const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { Store, today } = require("../desktop/store.cjs");
test("unsupported database version is not silently downgraded", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "solenexa-version-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "future.sqlite");
  const { DatabaseSync } = require("node:sqlite");
  let db = new DatabaseSync(file);
  db.exec("PRAGMA user_version=2");
  db.close();
  assert.throws(() => new Store(file), /newer version/);
  db = new DatabaseSync(file);
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 2);
  db.close();
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
test("per-pair costing includes wastage, labour and overhead; PO snapshots it", (t) => {
  const { c, p } = fixture(t);
  assert.equal(c.total, 9000);
  assert.equal(c.lines[0].amount, 5500);
  assert.equal(p.costSnapshot.total, 9000);
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
