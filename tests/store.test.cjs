const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { Store, today, CURRENT_SCHEMA_VERSION } = require("../desktop/store.cjs");
test("unsupported database version is not silently downgraded", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "solenexa-version-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "future.sqlite");
  const { DatabaseSync } = require("node:sqlite");
  let db = new DatabaseSync(file);
  db.exec(`PRAGMA user_version=${CURRENT_SCHEMA_VERSION + 1}`);
  db.close();
  assert.throws(() => new Store(file), /newer version/);
  db = new DatabaseSync(file);
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, CURRENT_SCHEMA_VERSION + 1);
  db.close();
});
test("existing schema is migrated transactionally without changing records", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "solenexa-migration-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "factory.sqlite");
  let s = new Store(file);
  const material = s.add("material", { name: "Migration Leather", unit: "yard", rate: 250, reorder: 2 });
  s.close();
  const { DatabaseSync } = require("node:sqlite");
  let db = new DatabaseSync(file);
  db.exec("DROP TABLE schema_migrations; PRAGMA user_version=1");
  db.close();

  s = new Store(file);
  assert.equal(s.get("material", material.id).name, "Migration Leather");
  assert.equal(s.db.prepare("PRAGMA user_version").get().user_version, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(
    s.db.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((row) => row.version),
    [1, 2],
  );
  s.close();
  assert.equal(
    fs.readdirSync(path.join(dir, "migration-backups")).filter((name) => name.endsWith(".sqlite")).length,
    1,
  );
});
test("failed migration rolls back instead of changing the old schema", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "solenexa-migration-failure-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "factory.sqlite");
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(file);
  db.exec("CREATE VIEW schema_migrations AS SELECT 1 AS version, 'blocked' AS applied_at; PRAGMA user_version=1");
  db.close();
  assert.throws(() => new Store(file), /migration failed safely/);
  const checkDb = new DatabaseSync(file);
  assert.equal(checkDb.prepare("PRAGMA user_version").get().user_version, 1);
  checkDb.close();
});
test("backup validation rejects semantically invalid record payloads", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "solenexa-backup-validation-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "factory.sqlite");
  const backup = path.join(dir, "invalid.sqlite");
  const s = new Store(file);
  s.backup(backup);
  s.close();
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(backup);
  db.prepare("INSERT INTO records(id,kind,data) VALUES(?,?,?)").run("bad-record", "not-a-kind", "{}");
  db.close();
  assert.throws(() => Store.validateBackup(backup), /Invalid backup record/);
});
test("warehouse stock count requires review and posts one audited variance", (t) => {
  const { s, m } = fixture(t);
  const bin = s.defaultBin();
  s.command("stock", { materialId: m.id, binId: bin.id, type: "receive", quantity: 10, note: "Opening stock" });
  const count = s.command("stock-count", { materialId: m.id, binId: bin.id, counted: 8, date: today(), note: "Physical count" });
  assert.equal(count.expected, 10);
  assert.equal(count.variance, -2);
  assert.equal(s.command("stock-count-submit", { id: count.id }).status, "submitted");
  const approved = s.command("stock-count-approve", { id: count.id });
  assert.equal(approved.status, "approved");
  assert.equal(s.stockAtBin(m.id, bin.id), 8);
  assert.equal(s.events(m.id).filter((e) => e.kind === "stock" && e.data.stockCountId === count.id).length, 1);
  assert.throws(() => s.command("stock-count-approve", { id: count.id }), /submitted/);
});
test("stock count approval rejects stale stock and preserves the count for review", (t) => {
  const { s, m } = fixture(t);
  const bin = s.defaultBin();
  s.command("stock", { materialId: m.id, binId: bin.id, type: "receive", quantity: 4, note: "Opening stock" });
  const count = s.command("stock-count", { materialId: m.id, binId: bin.id, counted: 3, date: today() });
  s.command("stock-count-submit", { id: count.id });
  s.command("stock", { materialId: m.id, binId: bin.id, type: "receive", quantity: 1, note: "Late receipt" });
  assert.throws(() => s.command("stock-count-approve", { id: count.id }), /Stock changed/);
  assert.equal(s.get("stock-count", count.id).status, "submitted");
  assert.equal(s.stockAtBin(m.id, bin.id), 5);
});
test("multi-line stock count approves all lines atomically", (t) => {
  const { s, m } = fixture(t);
  const warehouse = s.all("warehouse")[0];
  const secondBin = s.command("bin", { warehouseId: warehouse.id, code: "PACK", name: "Packing stock" });
  const secondMaterial = s.add("material", { name: "Test Sole", unit: "pcs", rate: 25, reorder: 2 });
  s.command("stock", { materialId: m.id, binId: s.defaultBin().id, type: "receive", quantity: 10, note: "Leather stock" });
  s.command("stock", { materialId: secondMaterial.id, binId: secondBin.id, type: "receive", quantity: 6, note: "Sole stock" });
  const sheet = s.command("stock-count", { date: today(), note: "Monthly physical count", lines: [
    { materialId: m.id, binId: s.defaultBin().id, counted: 8 },
    { materialId: secondMaterial.id, binId: secondBin.id, counted: 7 },
  ] });
  assert.equal(sheet.lines.length, 2);
  assert.equal(sheet.lines[0].variance, -2);
  assert.equal(sheet.lines[1].variance, 1);
  s.command("stock-count-submit", { id: sheet.id });
  const approved = s.command("stock-count-approve", { id: sheet.id });
  assert.equal(approved.status, "approved");
  assert.equal(approved.adjustmentEventIds.length, 2);
  assert.equal(s.stockAtBin(m.id, s.defaultBin().id), 8);
  assert.equal(s.stockAtBin(secondMaterial.id, secondBin.id), 7);
  assert.equal(s.events(m.id).filter((e) => e.kind === "stock" && e.data.stockCountId === sheet.id).length, 1);
  assert.throws(() => s.command("stock-count", { date: today(), lines: [
    { materialId: m.id, binId: s.defaultBin().id, counted: 8 },
    { materialId: m.id, binId: s.defaultBin().id, counted: 8 },
  ] }), /appears more than once/);
});
test("stock movement guards are isolated per bin", (t) => {
  const { s, m, p } = fixture(t);
  const warehouse = s.all("warehouse")[0];
  const secondBin = s.command("bin", { warehouseId: warehouse.id, code: "CUT", name: "Cutting stock" });
  s.command("stock", { materialId: m.id, binId: s.defaultBin().id, type: "receive", quantity: 3, note: "Main stock" });
  assert.throws(() => s.command("stock", { materialId: m.id, binId: secondBin.id, type: "issue", quantity: 1, poId: p.id, note: "Wrong bin" }), /Not enough stock/);
});
test("lot tracked purchases keep stock counts and returns isolated", (t) => {
  const { s, m } = fixture(t);
  const supplier = s.command("supplier", { name: "Batch Supplier" });
  const first = s.command("purchase", { supplierId: supplier.id, invoice: "LOT-A", date: today(), lines: [{ materialId: m.id, quantity: 10, rate: 100, lotCode: "A-001" }] });
  const second = s.command("purchase", { supplierId: supplier.id, invoice: "LOT-B", date: today(), lines: [{ materialId: m.id, quantity: 5, rate: 100, lotCode: "B-001" }] });
  assert.equal(s.all("lot").length, 2);
  assert.equal(s.stock(m.id, "9999-12-31", "A-001"), 10);
  assert.equal(s.stock(m.id, "9999-12-31", "B-001"), 5);
  const returned = s.command("purchase-return", { purchaseId: first.id, materialId: m.id, quantity: 6, date: today(), note: "Lot A return" });
  assert.equal(returned.data.lotCode, "A-001");
  assert.equal(s.stock(m.id, "9999-12-31", "A-001"), 4);
  assert.equal(s.stock(m.id, "9999-12-31", "B-001"), 5);
  s.command("stock", { materialId: m.id, type: "adjust-down", quantity: 3, lotCode: "A-001", note: "Lot A damaged" });
  assert.throws(() => s.command("purchase-return", { purchaseId: first.id, materialId: m.id, quantity: 2, date: today(), note: "Too much from lot A" }), /current stock/);
  const count = s.command("stock-count", { materialId: m.id, binId: s.defaultBin().id, lotCode: "B-001", counted: 4, date: today() });
  assert.equal(count.expected, 5);
  assert.equal(count.lotCode, "B-001");
  void second;
});
test("stock reservations reduce free stock and are consumed or released by audit events", (t) => {
  const { s, m, p } = fixture(t);
  const bin = s.defaultBin();
  s.command("stock", { materialId: m.id, binId: bin.id, type: "receive", quantity: 10, lotCode: "RES-1", note: "Reserved stock" });
  const reservation = s.command("reservation", { materialId: m.id, binId: bin.id, quantity: 6, lotCode: "RES-1", date: today(), note: "PO allocation" });
  assert.equal(s.reservationRemaining(reservation), 6);
  assert.throws(() => s.command("reservation", { materialId: m.id, binId: bin.id, quantity: 5, lotCode: "RES-1", date: today(), note: "Too much" }), /free stock/);
  s.command("stock", { materialId: m.id, binId: bin.id, type: "issue", quantity: 3, lotCode: "RES-1", reservationId: reservation.id, poId: p.id, note: "Issue reserved" });
  assert.equal(s.reservationRemaining(reservation), 3);
  assert.throws(() => s.command("stock", { materialId: m.id, binId: bin.id, type: "issue", quantity: 5, lotCode: "RES-1", poId: p.id, note: "Would consume reserved stock" }), /reserved stock/);
  s.command("reservation-release", { id: reservation.id, quantity: 1, note: "Plan reduced" });
  assert.equal(s.reservationRemaining(reservation), 2);
  assert.equal(s.events(reservation.id).filter((e) => e.kind === "reservation-release").length, 1);
});
test("warehouse transfer moves one lot atomically and cannot consume reserved stock", (t) => {
  const { s, m } = fixture(t);
  const warehouse = s.all("warehouse")[0];
  const destination = s.command("bin", { warehouseId: warehouse.id, code: "PACK", name: "Packing stock" });
  const source = s.defaultBin();
  s.command("stock", { materialId: m.id, binId: source.id, type: "receive", quantity: 10, lotCode: "TRF-1", note: "Transfer source" });
  s.command("reservation", { materialId: m.id, binId: source.id, quantity: 6, lotCode: "TRF-1", date: today(), note: "Reserved for production" });
  assert.throws(() => s.command("transfer", { materialId: m.id, sourceBinId: source.id, destinationBinId: destination.id, quantity: 5, lotCode: "TRF-1", date: today(), note: "Too much" }), /free stock/);
  const transfer = s.command("transfer", { materialId: m.id, sourceBinId: source.id, destinationBinId: destination.id, quantity: 4, lotCode: "TRF-1", date: today(), note: "Move to packing" });
  assert.equal(transfer.status, "completed");
  assert.equal(s.stockAtBinLot(m.id, source.id, "9999-12-31", "TRF-1"), 6);
  assert.equal(s.stockAtBinLot(m.id, destination.id, "9999-12-31", "TRF-1"), 4);
  assert.equal(s.events(m.id).filter((e) => e.data.transferId === transfer.id).length, 2);
});
function fixture(t) {
  const s = new Store(":memory:");
  t.after(() => s.close());
  const m = s.command("material", {
    name: "Leather",
    unit: "yard",
    rate: 100,
    reorder: 5,
  });
  const c = s.command("cost", {
    name: "Classic",
    sku: "SN-01",
    lines: [{ materialId: m.id, quantity: 0.5, wastage: 10 }],
    labour: 25,
    overhead: 10,
  });
  const w = s.command("worker", {
    name: "Ali",
    basis: "piece",
    rate: 20,
    advance: 100,
  });
  const dep = s.all("department")[0];
  const p = s.command("po", {
    costId: c.id,
    quantity: 100,
    departments: [dep.id],
    due: today(),
  });
  return { s, m, c, w, dep, p };
}
test("factory profile edits preserve production snapshots", (t) => {
  const { s, p } = fixture(t);
  s.command("activate", { key: "IQ-LINKS-OWNER-2026" });
  s.command("setup-company", { companyName: "Factory", owner: "Owner" });
  s.command("create-user", { username: "owner", role: "owner", password: "Testing123" });
  const beforeSnapshot = JSON.stringify(s.get("po", p.id).costSnapshot);
  s.command("company-profile", { companyName: "Updated Factory", owner: "New Owner", contact: "0300-1234567", address: "New factory address", companyLogo: "data:image/png;base64,UPDATED" });
  assert.equal(s.config().companyName, "Updated Factory");
  assert.equal(s.config().owner, "New Owner");
  assert.equal(s.config().contact, "0300-1234567");
  assert.equal(s.config().address, "New factory address");
  assert.equal(s.config().companyLogo, "data:image/png;base64,UPDATED");
  assert.equal(JSON.stringify(s.get("po", p.id).costSnapshot), beforeSnapshot);
  s.command("company-profile", { companyName: "Updated Factory", owner: "New Owner", contact: "", address: "", removeLogo: "true" });
  assert.equal(s.config().companyLogo, "");
});test("per-pair costing includes wastage, labour and overhead; PO snapshots it", (t) => {
  const { c, p } = fixture(t);
  assert.equal(c.total, 9000);
  assert.equal(c.lines[0].amount, 5500);
  assert.equal(p.costSnapshot.total, 9000);
});
test("PO costing separates estimates, actual material and mixed labour variance", (t) => {
  const { s, m, p, w, dep } = fixture(t);
  const daily = s.command("worker", { name: "Daily cost", basis: "daily", rate: 1200 });
  const salary = s.command("worker", { name: "Salary cost", basis: "salary", rate: 30000 });
  s.command("stock", { materialId: m.id, type: "receive", quantity: 10, note: "Supplier" });
  s.command("stock", { materialId: m.id, type: "issue", quantity: 5, poId: p.id, note: "PO issue" });
  const a = s.command("assignment", { poId: p.id, workerId: w.id, departmentId: dep.id, unit: "pair", quantity: 10, rate: 20 });
  s.command("receipt", { assignmentId: a.id, accepted: 6, rejected: 4 });
  s.command("attendance", { workerId: daily.id, days: 0.5 });
  s.event("salary", salary.id, today(), { month: today().slice(0, 7), amount: salary.rate, note: "Test salary" });
  const report = s.poCosting(p);
  assert.deepEqual(report.estimated, { material: 550000, labour: 250000, overhead: 100000, total: 900000 });
  assert.equal(report.actual.material, 50000);
  assert.equal(report.labourBreakdown.piece, 12000);
  assert.equal(report.labourBreakdown.daily, 60000);
  assert.equal(report.labourBreakdown.salary, 3000000);
  assert.equal(report.actual.labour, 12000);
  assert.equal(report.labourBreakdown.unallocated,3060000);
  assert.equal(report.variance.total, -838000);
});
test("PO material usage separates BOM plan, issues, returns, scrap and WIP", (t) => {
  const { s, m, p } = fixture(t);
  s.command("stock", { materialId: m.id, type: "receive", quantity: 30, note: "Raw stock" });
  s.command("stock", { materialId: m.id, type: "issue", quantity: 20, poId: p.id, note: "Production issue" });
  s.command("stock", { materialId: m.id, type: "scrap", quantity: 3, poId: p.id, note: "Cutting scrap" });
  s.command("stock", { materialId: m.id, type: "return", quantity: 2, poId: p.id, note: "Unused return" });
  const line = s.poMaterialUsage(p)[0];
  assert.equal(line.planned, 50);
  assert.equal(line.issued, 20);
  assert.equal(line.returned, 2);
  assert.equal(line.scrap, 3);
  assert.equal(line.actual, 18);
  assert.equal(line.wip, 15);
  assert.equal(s.snapshot().poMaterialUsage[p.id][0].wip, 15);
});
test("quality inspections require references and preserve an approval trail", (t) => {
  const { s, m, p, w, dep } = fixture(t);
  const assignment = s.command("assignment", { poId: p.id, workerId: w.id, departmentId: dep.id, unit: "pair", quantity: 10, rate: 20 });
  const incoming = s.command("inspection", { stage: "incoming", materialId: m.id, quantity: 10, accepted: 8, rejected: 2, disposition: "rework", defect: "Surface marks", note: "Incoming check" });
  assert.equal(incoming.status, "draft");
  s.command("inspection-submit", { id: incoming.id });
  assert.equal(s.command("inspection-approve", { id: incoming.id }).status, "approved");
  const inProcess = s.command("inspection", { stage: "in-process", assignmentId: assignment.id, quantity: 10, accepted: 10, rejected: 0, disposition: "pass", note: "Line check" });
  assert.equal(inProcess.referenceId, assignment.id);
  assert.throws(() => s.command("inspection", { stage: "final", poId: p.id, quantity: 1, accepted: 0, rejected: 1, disposition: "reject" }), /defect description/);
  assert.throws(() => s.command("inspection-approve", { id: inProcess.id }), /submitted/);
});
test("master data revisions keep historical snapshots and record a readable history", (t) => {
  const { s, m, c, w, dep, p } = fixture(t);
  const a = s.command("assignment", { poId: p.id, workerId: w.id, departmentId: dep.id, unit: "pair", quantity: 10, rate: 20 });
  s.command("material-revise", { id: m.id, name: "Premium Leather", unit: "yard", rate: 150, reorder: 8, reason: "Supplier rate changed" });
  s.command("worker-revise", { id: w.id, name: "Ali Khan", phone: "0300", basis: "piece", rate: 25, reason: "Annual rate review" });
  s.command("department-revise", { id: dep.id, name: "Upper Stitching", reason: "Production line renamed" });
  assert.equal(s.get("material", m.id).rate, 15000);
  assert.equal(s.get("worker", w.id).rate, 2500);
  assert.equal(s.get("department", dep.id).name, "Upper Stitching");
  assert.equal(c.lines[0].rate, 10000);
  assert.equal(p.costSnapshot.total, 9000);
  assert.equal(s.get("assignment", a.id).rate, 2000);
  assert.equal(s.poStats(p).departments[0].name, "Upper");
  const history = s.events().filter((e) => e.kind === "revision");
  assert.equal(history.length, 3);
  assert.deepEqual(new Set(history.map((e) => e.data.reason)), new Set(["Supplier rate changed", "Annual rate review", "Production line renamed"]));
  assert.ok(history.every((e) => e.data.before && e.data.after && e.data.changes.length));
});
test("assignment capacity is per department and converts pieces to pairs", (t) => {
  const { s, p, w, dep } = fixture(t);
  s.command("assignment", {
    poId: p.id,
    workerId: w.id,
    departmentId: dep.id,
    unit: "pcs",
    factor: 2,
    quantity: 80,
    rate: 10,
  });
  assert.equal(s.poStats(p).departments[0].assigned, 40);
  assert.throws(
    () =>
      s.command("assignment", {
        poId: p.id,
        workerId: w.id,
        departmentId: dep.id,
        unit: "pair",
        quantity: 61,
        rate: 20,
      }),
    /exceeds/,
  );
  assert.equal(s.all("assignment").length, 1);
});
test("assigned work earns nothing; accepted work earns once; rejects stay for rework", (t) => {
  const { s, p, w, dep } = fixture(t);
  const a = s.command("assignment", {
    poId: p.id,
    workerId: w.id,
    departmentId: dep.id,
    unit: "pair",
    quantity: 40,
    rate: 20,
  });
  assert.equal(s.balance(w.id).earned, 0);
  s.command("receipt", { assignmentId: a.id, accepted: 30, rejected: 10 });
  assert.equal(s.balance(w.id).earned, 60000);
  s.command("receipt", { assignmentId: a.id, accepted: 10, rejected: 0 });
  assert.equal(s.balance(w.id).earned, 80000);
  assert.throws(
    () =>
      s.command("receipt", { assignmentId: a.id, accepted: 1, rejected: 0 }),
    /exceeds/,
  );
  assert.equal(s.balance(w.id).earned, 80000);
});
test("stock receipts, PO issues, returns and negative-stock guards", (t) => {
  const { s, m, p } = fixture(t);
  s.command("stock", {
    materialId: m.id,
    type: "receive",
    quantity: 10,
    note: "Invoice",
  });
  s.command("stock", {
    materialId: m.id,
    type: "issue",
    quantity: 7,
    poId: p.id,
    note: "PO issue",
  });
  assert.equal(s.stock(m.id), 3);
  assert.throws(
    () =>
      s.command("stock", {
        materialId: m.id,
        type: "issue",
        quantity: 4,
        poId: p.id,
        note: "Too much",
      }),
    /Not enough/,
  );
  assert.throws(
    () =>
      s.command("stock", {
        materialId: m.id,
        type: "return",
        quantity: 8,
        poId: p.id,
        note: "Too much",
      }),
    /exceeds/,
  );
  s.command("stock", {
    materialId: m.id,
    type: "return",
    quantity: 2,
    poId: p.id,
    note: "Unused",
  });
  assert.equal(s.stock(m.id), 5);
});
test("finished output requires accepted work and dispatch cannot exceed stock", (t) => {
  const { s, p, w, dep } = fixture(t);
  assert.throws(
    () => s.command("finished", { poId: p.id, quantity: 1, note: "Receipt" }),
    /departments/,
  );
  const a = s.command("assignment", {
    poId: p.id,
    workerId: w.id,
    departmentId: dep.id,
    unit: "pair",
    quantity: 40,
    rate: 20,
  });
  s.command("receipt", { assignmentId: a.id, accepted: 40, rejected: 0 });
  s.command("finished", { poId: p.id, quantity: 40, note: "Packed" });
  assert.throws(
    () => s.command("finished", { poId: p.id, quantity: 1, note: "Duplicate" }),
    /departments/,
  );
  s.command("dispatch", { poId: p.id, quantity: 30, note: "Shop" });
  assert.equal(s.poStats(p).available, 10);
  assert.throws(
    () => s.command("dispatch", { poId: p.id, quantity: 11, note: "Shop" }),
    /Not enough/,
  );
});
test("daily attendance and monthly salary cannot be posted twice", (t) => {
  const { s } = fixture(t);
  const w = s.command("worker", { name: "Daily", basis: "daily", rate: 1200 });
  s.command("attendance", { workerId: w.id, days: 0.5 });
  assert.equal(s.balance(w.id).earned, 60000);
  assert.throws(
    () => s.command("attendance", { workerId: w.id, days: 1 }),
    /already/,
  );
  const m = s.command("worker", {
    name: "Staff",
    basis: "salary",
    rate: 30000,
  });
  s.command("salary", { workerId: m.id, month: "2025-12" });
  assert.equal(s.balance(m.id).earned, 3000000);
  assert.throws(
    () => s.command("salary", { workerId: m.id, month: "2025-12" }),
    /already/,
  );
  assert.throws(
    () => s.command("salary", { workerId: m.id, month: "2099-01" }),
    /month ends/,
  );
});
test("settlement separates cash and recovery, rejects overpayment and double payment", (t) => {
  const { s, p, w, dep } = fixture(t);
  const a = s.command("assignment", {
    poId: p.id,
    workerId: w.id,
    departmentId: dep.id,
    unit: "pair",
    quantity: 40,
    rate: 20,
  });
  s.command("receipt", { assignmentId: a.id, accepted: 40, rejected: 0 });
  assert.throws(
    () =>
      s.command("settlement", {
        workerId: w.id,
        amount: 800,
        recovery: 100,
        note: "Week",
      }),
    /exceeds/,
  );
  s.command("settlement", {
    workerId: w.id,
    amount: 750,
    recovery: 50,
    note: "Saturday",
  });
  assert.equal(s.balance(w.id).payable, 0);
  assert.equal(s.balance(w.id).advanceDue, 5000);
  assert.throws(
    () =>
      s.command("settlement", {
        workerId: w.id,
        amount: 750,
        recovery: 0,
        note: "Again",
      }),
    /exceeds/,
  );
});
test("salary and daily assignments never produce piece earnings", (t) => {
  const { s, p, dep } = fixture(t);
  const w = s.command("worker", { name: "Daily", basis: "daily", rate: 1000 });
  const a = s.command("assignment", {
    poId: p.id,
    workerId: w.id,
    departmentId: dep.id,
    unit: "pair",
    quantity: 10,
    rate: 100,
  });
  s.command("receipt", { assignmentId: a.id, accepted: 10, rejected: 0 });
  assert.equal(s.balance(w.id).earned, 0);
});

test("unfinished assignments can be cancelled and safely reallocated", (t) => {
  const { s, p, w, dep } = fixture(t);
  const a = s.command("assignment", { poId: p.id, workerId: w.id, departmentId: dep.id, unit: "pair", quantity: 40, rate: 20 });
  s.command("cancel-assignment", { id: a.id, reason: "Worker unavailable" });
  assert.equal(s.get("assignment", a.id).cancelled, true);
  assert.equal(s.poStats(p).departments[0].assigned, 0);
  assert.throws(() => s.command("receipt", { assignmentId: a.id, accepted: 1, rejected: 0 }), /Cancelled/);
  const replacement = s.command("assignment", { poId: p.id, workerId: w.id, departmentId: dep.id, unit: "pair", quantity: 40, rate: 20 });
  assert.equal(replacement.cancelled, undefined);
  const received = s.command("receipt", { assignmentId: replacement.id, accepted: 40, rejected: 0 });
  assert.ok(received.id);
  assert.throws(() => s.command("cancel-assignment", { id: replacement.id, reason: "Too late" }), /received work/);
});
test("audited corrections reverse posted events exactly once and preserve balances", (t) => {
  const { s, m, p, w, dep } = fixture(t);
  const a = s.command("assignment", { poId: p.id, workerId: w.id, departmentId: dep.id, unit: "pair", quantity: 10, rate: 20 });
  const receipt = s.command("receipt", { assignmentId: a.id, accepted: 6, rejected: 2, note: "Wrong count" });
  assert.equal(s.balance(w.id).earned, 12000);
  const correction = s.command("correct-event", { eventId: receipt.id, reason: "Supervisor verified wrong count" });
  assert.equal(correction.data.originalEventId, receipt.id);
  assert.equal(s.balance(w.id).earned, 0);
  assert.deepEqual(s.received(a.id), { accepted: 0, rejected: 0 });
  assert.throws(() => s.command("correct-event", { eventId: receipt.id, reason: "Again" }), /already/);
  const reversal = s.events(a.id).find((e) => e.data.reversalOf === receipt.id);
  assert.equal(reversal.data.accepted, -6);
  assert.ok(s.events().some((e) => e.kind === "correction" && e.data.originalEventId === receipt.id));
});

test("attendance corrections reverse the posted wage without deleting history", (t) => {
  const { s } = fixture(t);
  const w = s.command("worker", { name: "Daily correction", basis: "daily", rate: 1200 });
  const attendance = s.command("attendance", { workerId: w.id, days: 1 });
  assert.equal(s.balance(w.id).earned, 120000);
  s.command("correct-event", { eventId: attendance.id, reason: "Attendance marked absent after review" });
  assert.equal(s.balance(w.id).earned, 0);
  assert.equal(s.events(w.id).filter((e) => e.kind === "attendance").length, 2);
});
test("audited stock and settlement corrections preserve compensating balances", (t) => {
  const { s, m, p, w, dep } = fixture(t);
  const stock = s.command("stock", { materialId: m.id, type: "receive", quantity: 10, note: "Wrong receive" });
  s.command("correct-event", { eventId: stock.id, reason: "Invoice correction" });
  assert.equal(s.stock(m.id), 0);
  const a = s.command("assignment", { poId: p.id, workerId: w.id, departmentId: dep.id, unit: "pair", quantity: 10, rate: 20 });
  s.command("receipt", { assignmentId: a.id, accepted: 10, rejected: 0 });
  const settlement = s.command("settlement", { workerId: w.id, amount: 100, recovery: 0, note: "Wrong cash" });
  const before = s.balance(w.id);
  s.command("correct-event", { eventId: settlement.id, reason: "Cash amount corrected" });
  assert.equal(s.balance(w.id).payable, before.payable + 10000);
});

test("inactive master records are retained but blocked from new transactions", (t) => {
  const { s, m, p, w, dep } = fixture(t);
  s.command("material-revise", { id: m.id, name: m.name, unit: m.unit, rate: 100, reorder: 5, active: "false", reason: "Material retired" });
  assert.equal(s.get("material", m.id).active, false);
  assert.throws(() => s.command("cost", { name: "Blocked", sku: "BLK", lines: [{ materialId: m.id, quantity: 1, wastage: 0 }], labour: 0, overhead: 0 }), /Inactive materials/);
  s.command("worker-revise", { id: w.id, name: w.name, phone: "", basis: w.basis, rate: 20, active: "false", reason: "Worker inactive" });
  assert.throws(() => s.command("assignment", { poId: p.id, workerId: w.id, departmentId: dep.id, unit: "pair", quantity: 1, rate: 20 }), /Inactive workers/);
});

test("CSV exports are quoted and spreadsheet-formula safe", (t) => {
  const { s } = fixture(t);
  s.command("material", { name: "=Unsafe", unit: "pcs", rate: 10, reorder: 1 });
  const csv = s.exportCsv("materials");
  assert.match(csv, /"ID","Name","Unit"/);
  assert.match(csv, /"'=Unsafe"/);
  assert.match(csv, /"true"/);
  assert.throws(() => s.exportCsv("unknown"), /supported CSV/);
});
test("offline factory trial completes material-to-dispatch workflow", (t) => {
  const { s, m, p, w, dep } = fixture(t);
  s.command("stock", { materialId: m.id, type: "receive", quantity: 10, note: "Supplier delivery" });
  s.command("stock", { materialId: m.id, type: "issue", quantity: 5, poId: p.id, note: "Issue to production" });
  const assignment = s.command("assignment", { poId: p.id, workerId: w.id, departmentId: dep.id, unit: "pair", quantity: 20, rate: 20 });
  s.command("receipt", { assignmentId: assignment.id, accepted: 18, rejected: 2, note: "Department receipt" });
  s.command("finished", { poId: p.id, quantity: 18, note: "Packed finished pairs" });
  s.command("dispatch", { poId: p.id, quantity: 12, note: "Customer dispatch" });
  assert.equal(s.poStats(p).available, 6);
  s.command("settlement", { workerId: w.id, amount: 250, recovery: 50, note: "Saturday settlement" });
  assert.equal(s.balance(w.id).payable, 6000);
  assert.equal(s.balance(w.id).advanceDue, 5000);
});
test("disk persistence and validated backup preserve data", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "solenexa-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "factory.sqlite"),
    backup = path.join(dir, "backup.sqlite");
  let s = new Store(file);
  s.command("material", { name: "Glue", unit: "kg", rate: 250, reorder: 2 });
  s.backup(backup);
  s.close();
  Store.validateBackup(backup);
  s = new Store(file);
  assert.equal(s.all("material")[0].name, "Glue");
  s.close();
  assert.throws(() => Store.validateBackup(path.join(dir, "missing.sqlite")));
});
test("invalid input rolls back all changes and backdated stock cannot go negative", (t) => {
  const { s, m } = fixture(t);
  assert.throws(() =>
    s.command("worker", { name: "Bad", basis: "piece", rate: 10, advance: -1 }),
  );
  assert.equal(s.all("worker").length, 1);
  assert.throws(() =>
    s.command("material", {
      name: "Invalid",
      unit: "kg",
      rate: NaN,
      reorder: 1,
    }),
  );
  s.command("stock", {
    materialId: m.id,
    type: "receive",
    quantity: 10,
    note: "Today",
  });
  assert.throws(
    () =>
      s.command("stock", {
        materialId: m.id,
        type: "adjust-down",
        quantity: 1,
        note: "Yesterday",
        date: "2025-01-01",
      }),
    /Not enough/,
  );
});

test("offline purchasing receives materials and tracks supplier payable", (t) => {
  const { s, m } = fixture(t);
  const supplier = s.command("supplier", { name: "Prime Leather", phone: "0300-1234567", address: "Lahore" });
  const purchase = s.command("purchase", {
    supplierId: supplier.id,
    invoice: "INV-1001",
    date: today(),
    lines: [{ materialId: m.id, quantity: 10, rate: 120 }],
    note: "Leather delivery",
  });
  assert.equal(purchase.total, 120000);
  assert.equal(s.stock(m.id), 10);
  assert.equal(s.supplierBalance(supplier.id).purchased, 120000);
  assert.equal(s.supplierBalance(supplier.id).payable, 120000);
  assert.equal(s.events(m.id).find((e) => e.kind === "stock").data.purchaseId, purchase.id);
  assert.throws(() => s.command("purchase", { supplierId: supplier.id, invoice: "INV-1001", date: today(), lines: [{ materialId: m.id, quantity: 1, rate: 120 }] }), /invoice/);
});

test("purchase landed cost allocates discount freight and tax into historical line valuation", (t) => {
  const { s, m } = fixture(t);
  const supplier = s.command("supplier", { name: "Landed Cost Supplier" });
  const purchase = s.command("purchase", {
    supplierId: supplier.id,
    invoice: "LAND-1",
    date: today(),
    lines: [{ materialId: m.id, quantity: 10, rate: 100 }],
    discount: 5,
    freight: 10,
    tax: 9,
  });
  assert.equal(purchase.subtotal, 100000);
  assert.equal(purchase.discount, 500);
  assert.equal(purchase.freight, 1000);
  assert.equal(purchase.tax, 900);
  assert.equal(purchase.total, 101400);
  assert.equal(purchase.lines[0].landedAmount, 101400);
  assert.equal(purchase.lines[0].landedRate, 10140);
  assert.equal(s.events(m.id).find((e) => e.data.purchaseId === purchase.id).data.valuationRate, 10140);
  assert.equal(s.supplierBalance(supplier.id).payable, 101400);
  const returned = s.command("purchase-return", { purchaseId: purchase.id, materialId: m.id, quantity: 2, date: today(), note: "Landed return" });
  assert.equal(returned.data.amount, 20280);
});
test("inventory valuation policy reports weighted average and FIFO and closes periods", (t) => {
  const { s, m } = fixture(t);
  s.command("inventory-valuation", { method: "weighted-average", approvedBy: "accounts" });
  const supplier = s.command("supplier", { name: "Valuation Supplier" });
  s.command("purchase", { supplierId: supplier.id, invoice: "VAL-1", lines: [{ materialId: m.id, quantity: 10, rate: 100 }] });
  s.command("purchase", { supplierId: supplier.id, invoice: "VAL-2", lines: [{ materialId: m.id, quantity: 10, rate: 200 }] });
  s.command("stock", { materialId: m.id, type: "adjust-down", quantity: 5, note: "Consumed stock" });
  const weighted = s.inventoryValuationReport();
  assert.equal(weighted.method, "weighted-average");
  assert.equal(weighted.materials.find((line) => line.materialId === m.id).value, 225000);
  s.command("inventory-valuation", { method: "fifo", approvedBy: "accounts" });
  const fifo = s.inventoryValuationReport();
  assert.equal(fifo.materials.find((line) => line.materialId === m.id).value, 250000);
  const d = new Date(today() + "T12:00:00"); d.setMonth(d.getMonth() - 1);
  const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const close = s.command("inventory-close", { period, closedBy: "accounts" });
  assert.equal(close.period, period);
  assert.throws(() => s.command("stock", { materialId: m.id, type: "receive", quantity: 1, date: `${period}-15`, note: "Backdated after close" }), /period .* closed/);
});

test("stock receive can post an automatic supplier payable at the material rate", (t) => {
  const { s, m } = fixture(t);
  const supplier = s.command("supplier", { name: "Direct Receipt Supplier" });
  const stock = s.command("stock", { materialId: m.id, type: "receive", quantity: 10, supplierId: supplier.id, note: "Direct delivery" });
  assert.equal(s.stock(m.id), 10);
  assert.equal(s.supplierBalance(supplier.id).purchased, 100000);
  const payable = s.events(supplier.id).find((e) => e.kind === "supplier-receive");
  assert.equal(payable.data.amount, 100000);
  assert.equal(payable.data.rate, m.rate);
  s.command("correct-event", { eventId: stock.id, reason: "Wrong direct receipt" });
  assert.equal(s.stock(m.id), 0);
  assert.equal(s.supplierBalance(supplier.id).payable, 0);
  assert.ok(s.events(supplier.id).some((e) => e.kind === "supplier-receive" && e.data.reversalOf === payable.id));
});

test("purchase returns reduce stock and supplier payable without allowing over-return", (t) => {
  const { s, m } = fixture(t);
  const supplier = s.command("supplier", { name: "Return Supplier" });
  const purchase = s.command("purchase", { supplierId: supplier.id, invoice: "RET-1", date: today(), lines: [{ materialId: m.id, quantity: 10, rate: 100 }] });
  const returned = s.command("purchase-return", { purchaseId: purchase.id, materialId: m.id, quantity: 3, date: today(), note: "Damaged rolls" });
  assert.equal(returned.data.quantity, 3);
  assert.equal(s.stock(m.id), 7);
  assert.equal(s.supplierBalance(supplier.id).returned, 30000);
  assert.equal(s.supplierBalance(supplier.id).payable, 70000);
  assert.throws(() => s.command("purchase-return", { purchaseId: purchase.id, materialId: m.id, quantity: 8, date: today(), note: "Too much" }), /exceeds/);
});

test("supplier payments are separate, capped by payable and visible in ledger", (t) => {
  const { s, m } = fixture(t);
  const supplier = s.command("supplier", { name: "Paid Supplier" });
  s.command("purchase", { supplierId: supplier.id, invoice: "PAY-1", date: today(), lines: [{ materialId: m.id, quantity: 5, rate: 100 }] });
  s.command("supplier-payment", { supplierId: supplier.id, amount: 200, date: today(), note: "Part payment" });
  assert.equal(s.supplierBalance(supplier.id).paid, 20000);
  assert.equal(s.supplierBalance(supplier.id).payable, 30000);
  assert.throws(() => s.command("supplier-payment", { supplierId: supplier.id, amount: 400, date: today(), note: "Overpay" }), /exceeds/);
  assert.equal(s.events(supplier.id).filter((e) => e.kind === "supplier-payment").length, 1);
});

test("end-to-end factory trial covers supplier stock and every worker payment basis", (t) => {
  const { s, m, c, p, w, dep } = fixture(t);
  const supplier = s.command("supplier", { name: "End-to-end Materials", phone: "0300-1112222" });
  const purchase = s.command("purchase", {
    supplierId: supplier.id,
    invoice: "E2E-001",
    date: today(),
    lines: [{ materialId: m.id, quantity: 20, rate: 120 }],
    note: "Opening leather delivery",
  });
  assert.equal(purchase.total, 240000);
  assert.equal(s.stock(m.id), 20);
  s.command("purchase-return", { purchaseId: purchase.id, materialId: m.id, quantity: 2, date: today(), note: "Damaged leather" });
  assert.equal(s.stock(m.id), 18);
  s.command("supplier-payment", { supplierId: supplier.id, amount: 100, date: today(), note: "Part payment" });
  assert.deepEqual(s.supplierBalance(supplier.id), { purchased: 240000, returned: 24000, paid: 10000, payable: 206000 });

  s.command("stock", { materialId: m.id, type: "issue", quantity: 5, poId: p.id, date: today(), note: "Issued to production" });
  const piece = s.command("assignment", { poId: p.id, workerId: w.id, departmentId: dep.id, unit: "pair", quantity: 20, rate: 20 });
  s.command("receipt", { assignmentId: piece.id, accepted: 15, rejected: 5, date: today(), note: "First quality check" });
  s.command("receipt", { assignmentId: piece.id, accepted: 5, rejected: 0, date: today(), note: "Rework accepted" });
  assert.equal(s.balance(w.id).earned, 40000);
  assert.deepEqual(s.received(piece.id), { accepted: 20, rejected: 5 });

  const daily = s.command("worker", { name: "Daily Trial Worker", basis: "daily", rate: 1200 });
  s.command("attendance", { workerId: daily.id, days: 1, date: today() });
  assert.equal(s.balance(daily.id).earned, 120000);
  assert.throws(() => s.command("attendance", { workerId: daily.id, days: 1, date: today() }), /already posted/);

  const salary = s.command("worker", { name: "Salary Trial Worker", basis: "salary", rate: 30000 });
  const previousMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  const month = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, "0")}`;
  s.command("salary", { workerId: salary.id, month, date: today() });
  assert.equal(s.balance(salary.id).earned, 3000000);
  assert.throws(() => s.command("salary", { workerId: salary.id, month, date: today() }), /already posted/);

  s.command("finished", { poId: p.id, quantity: 20, date: today(), note: "Packed finished pairs" });
  s.command("dispatch", { poId: p.id, quantity: 7, date: today(), note: "Trial dispatch" });
  assert.equal(s.poStats(p).available, 13);
  s.command("settlement", { workerId: w.id, amount: 300, recovery: 100, date: today(), note: "Saturday settlement" });
  assert.deepEqual(s.balance(w.id), { earned: 40000, paid: 30000, advance: 10000, recovered: 10000, payable: 0, advanceDue: 0 });
});

test("production PO can preserve validated size and colour quantity breakdown", (t) => {
  const { s, c, dep } = fixture(t);
  const p = s.command("po", {
    costId: c.id, quantity: 100, departments: [dep.id], due: today(),
    variants: [{ size: "40", color: "Black", quantity: 60 }, { size: "41", color: "Black", quantity: 40 }],
  });
  assert.deepEqual(p.variants.map((v) => v.quantity), [60, 40]);
  assert.throws(() => s.command("po", { costId: c.id, quantity: 100, departments: [dep.id], due: today(), variants: [{ size: "40", color: "Black", quantity: 99 }] }), /must equal/);
  assert.throws(() => s.command("po", { costId: c.id, quantity: 100, departments: [dep.id], due: today(), variants: [{ size: "40", color: "Black", quantity: 60 }, { size: "40", color: "Black", quantity: 40 }] }), /unique/);
});

test("variant finished stock and dispatch stay in separate size-colour bins", (t) => {
  const { s, c, dep, w } = fixture(t);
  const p = s.command("po", { costId: c.id, quantity: 100, departments: [dep.id], due: today(), variants: [{ size: "40", color: "Black", quantity: 60 }, { size: "41", color: "Black", quantity: 40 }] });
  const a = s.command("assignment", { poId: p.id, workerId: w.id, departmentId: dep.id, unit: "pair", quantity: 100, rate: 20 });
  s.command("receipt", { assignmentId: a.id, accepted: 100, rejected: 0 });
  s.command("finished", { poId: p.id, variantKey: "40::Black", quantity: 60, note: "Size 40 packed" });
  s.command("finished", { poId: p.id, variantKey: "41::Black", quantity: 40, note: "Size 41 packed" });
  s.command("dispatch", { poId: p.id, variantKey: "40::Black", quantity: 20, note: "Size 40 dispatch" });
  assert.deepEqual(s.poStats(p).variantStats.map((v) => [v.key, v.finished, v.dispatched, v.available]), [["40::Black", 60, 20, 40], ["41::Black", 40, 0, 40]]);
  assert.throws(() => s.command("finished", { poId: p.id, variantKey: "40::Black", quantity: 1, note: "Over variant" }), /variant/);
  assert.throws(() => s.command("dispatch", { poId: p.id, variantKey: "41::Black", quantity: 41, note: "Over variant" }), /variant/);
});

test("supplier return and payment corrections preserve audit history and balances", (t) => {
  const { s, m } = fixture(t);
  const supplier = s.command("supplier", { name: "Correction Supplier" });
  const purchase = s.command("purchase", { supplierId: supplier.id, invoice: "COR-1", date: today(), lines: [{ materialId: m.id, quantity: 10, rate: 100 }] });
  const returned = s.command("purchase-return", { purchaseId: purchase.id, materialId: m.id, quantity: 2, date: today(), note: "Wrong return" });
  const payment = s.command("supplier-payment", { supplierId: supplier.id, amount: 100, date: today(), note: "Wrong payment" });
  assert.equal(s.stock(m.id), 8);
  assert.equal(s.supplierBalance(supplier.id).payable, 70000);
  s.command("correct-event", { eventId: returned.id, reason: "Return quantity corrected" });
  s.command("correct-event", { eventId: payment.id, reason: "Payment entered against wrong invoice" });
  assert.equal(s.stock(m.id), 10);
  assert.equal(s.supplierBalance(supplier.id).payable, 100000);
  assert.throws(() => s.command("correct-event", { eventId: payment.id, reason: "Again" }), /already/);
  assert.ok(s.events().some((e) => e.kind === "correction" && e.data.originalEventId === returned.id));
});

test("QR work completion accepts outstanding quantity once and rejects duplicate scans", (t) => {
  const { s, c, dep, w } = fixture(t);
  const p = s.command("po", { costId: c.id, quantity: 12, departments: [dep.id], due: today() });
  const a = s.command("assignment", { poId: p.id, workerId: w.id, departmentId: dep.id, unit: "pair", quantity: 12, rate: 20 });
  const receipt = s.command("scan-receipt", { code: `SNX1|${a.id}` });
  assert.equal(receipt.data.accepted, 12);
  assert.throws(() => s.command("scan-receipt", { code: `SNX1|${a.id}` }), /fully received/);
  assert.throws(() => s.command("scan-receipt", { code: "BAD|not-an-assignment" }), /Invalid/);
});
test('corrections cannot invalidate consumed stock, paid wages or finished output',t=>{
 const {s,m,p,w,dep}=fixture(t);
 const stock=s.command('stock',{materialId:m.id,type:'receive',quantity:10,note:'Opening'});
 s.command('stock',{materialId:m.id,type:'issue',quantity:5,poId:p.id,note:'Used'});
 assert.throws(()=>s.command('correct-event',{eventId:stock.id,reason:'Wrong receipt'}),/negative/);
 assert.equal(s.stock(m.id),5);
 const a=s.command('assignment',{poId:p.id,workerId:w.id,departmentId:dep.id,unit:'pair',quantity:5,rate:20});
 const r=s.command('receipt',{assignmentId:a.id,accepted:5,rejected:0});
 s.command('finished',{poId:p.id,quantity:5,note:'Packed'});
 assert.throws(()=>s.command('correct-event',{eventId:r.id,reason:'Wrong receipt'}),/finished stock/);
 const daily=s.command('worker',{name:'Correction Daily',basis:'daily',rate:1500});
 const att=s.command('attendance',{workerId:daily.id,days:1});
 s.command('settlement',{workerId:daily.id,amount:1500,recovery:0,note:'Paid'});
 assert.throws(()=>s.command('correct-event',{eventId:att.id,reason:'Wrong day'}),/unpaid earnings/);
 assert.equal(s.balance(daily.id).payable,0);
});
test('corrected attendance can be reposted and invoice stock cannot be reversed alone',t=>{
 const {s,m}=fixture(t);
 const w=s.command('worker',{name:'Repost Daily',basis:'daily',rate:1500});
 const a=s.command('attendance',{workerId:w.id,days:1});
 s.command('correct-event',{eventId:a.id,reason:'Half day actually'});
 s.command('attendance',{workerId:w.id,days:0.5});assert.equal(s.balance(w.id).earned,75000);
 const supplier=s.command('supplier',{name:'Invoice control'});
 const purchase=s.command('purchase',{supplierId:supplier.id,invoice:'QA-INV',lines:[{materialId:m.id,quantity:2,rate:100}]});
 const stock=s.events(m.id).find(e=>e.data.purchaseId===purchase.id);
 assert.throws(()=>s.command('correct-event',{eventId:stock.id,reason:'Wrong purchase'}),/purchase return/);
 assert.throws(()=>s.command('purchase',{supplierId:supplier.id,invoice:'QA-DUP',lines:[{materialId:m.id,quantity:2,rate:100},{materialId:m.id,quantity:3,rate:200}]}),/one line/);
});
