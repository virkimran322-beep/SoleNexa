const { DatabaseSync } = require("node:sqlite");
const { randomUUID, createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function check(ok, message) {
  if (!ok) throw new Error(message);
}
function active(record) { return record && record.active !== false; }
function flag(value, fallback = true) { return value === undefined ? fallback : [true, "true", "on", "1"].includes(value); }
function text(v, name) {
  check(
    typeof v === "string" && v.trim().length > 0 && v.length <= 500,
    `${name} is required (maximum 500 characters).`,
  );
  return v.trim();
}
function num(v, name, min = 0, integer = false) {
  const n = Number(v);
  check(
    v !== "" &&
      v != null &&
      Number.isFinite(n) &&
      n >= min &&
      n <= 1e9 &&
      (!integer || Number.isInteger(n)),
    `${name} must be ${integer ? "a whole number" : "a number"} of at least ${min}.`,
  );
  return n;
}
function date(v) {
  check(
    typeof v === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Enter a valid date.",
  );
  return v;
}
function postedDate(v) {
  date(v);
  check(v <= today(), "Actual transactions cannot be future dated.");
  return v;
}
const cents = (v) => Math.round(num(v, "Amount") * 100);
function safeSignedMoney(v) {
  check(Number.isSafeInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER, "Calculated amount is too large. Reduce the quantity or rate.");
}
const round = (v) => Math.round(v * 1e6) / 1e6;
function safeMoney(v) {
  check(
    Number.isSafeInteger(v) && v >= 0,
    "Calculated amount is too large. Reduce the quantity or rate.",
  );
  return v;
}
const kinds = [
  "department",
  "material",
  "cost",
  "po",
  "worker",
  "assignment",
  "supplier",
  "purchase",
  "warehouse",
  "bin",
  "lot",
  "reservation",
  "transfer",
  "stock-count",
  "inventory-close",
  "inspection",
  "settings",
  "user",
];
// Offline licensing is a product gate, not unbreakable DRM. A determined reverse-engineer can inspect a client-only app.
const ACTIVATION_HASH =
  "24e5db9fa5db7c924434b530be942702aa2fb4c5bcf8a476dd5836feedef3b38";
const hashPassword = (value) =>
  createHash("sha256").update(String(value)).digest("hex");
const normalizeActivationKey = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\u2010-\u2015\s]/g, "-");
const CURRENT_SCHEMA_VERSION = 2;

function runMigrations(db, fromVersion) {
  check(Number.isInteger(fromVersion) && fromVersion >= 0, "Invalid database schema version.");
  check(fromVersion <= CURRENT_SCHEMA_VERSION, "This database needs a newer version of SoleNexa.");
  if (fromVersion === CURRENT_SCHEMA_VERSION) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    let version = fromVersion;
    if (version < 1) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS records(
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          data TEXT NOT NULL CHECK(json_valid(data))
        );
        CREATE TABLE IF NOT EXISTS events(
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          target TEXT NOT NULL REFERENCES records(id),
          date TEXT NOT NULL,
          data TEXT NOT NULL CHECK(json_valid(data)),
          created TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS event_target ON events(target,date);
        DROP INDEX IF EXISTS attendance_once;
        CREATE UNIQUE INDEX attendance_once ON events(target,date)
          WHERE kind='attendance'
            AND json_extract(data,'$.reversalOf') IS NULL
            AND json_extract(data,'$.correctedBy') IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS salary_once
          ON events(target,json_extract(data,'$.month')) WHERE kind='salary';
      `);
      version = 1;
      db.exec("PRAGMA user_version=1");
    }
    if (version < 2) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations(
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
        INSERT OR IGNORE INTO schema_migrations(version, applied_at)
          VALUES(1, '${new Date().toISOString()}');
        INSERT INTO schema_migrations(version, applied_at)
          VALUES(2, '${new Date().toISOString()}');
        PRAGMA user_version=2;
      `);
      version = 2;
    }
    check(version === CURRENT_SCHEMA_VERSION, "Database migration did not reach the current version.");
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw new Error(`Database migration failed safely: ${error.message}`);
  }
}

function migrationRecoveryCopy(db, filename, fromVersion) {
  if (filename === ":memory:" || fromVersion === 0 || fromVersion >= CURRENT_SCHEMA_VERSION) return null;
  const backupDir = path.join(path.dirname(filename), "migration-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(
    backupDir,
    `${path.basename(filename)}.before-v${CURRENT_SCHEMA_VERSION}-${stamp}-${randomUUID().slice(0, 8)}.sqlite`,
  );
  try {
    db.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`);
    return destination;
  } catch (error) {
    try { fs.rmSync(destination, { force: true }); } catch {}
    throw new Error(`Pre-upgrade recovery copy failed: ${error.message}`);
  }
}

class Store {
  constructor(filename) {
    this.filename = filename;
    if (filename !== ":memory:")
      fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    const version = this.db.prepare("PRAGMA user_version").get().user_version;
    if (version > CURRENT_SCHEMA_VERSION) {
      this.db.close();
      throw Error("This database needs a newer version of SoleNexa.");
    }
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    try {
      migrationRecoveryCopy(this.db, filename, version);
      runMigrations(this.db, version);
    } catch (error) {
      this.db.close();
      throw error;
    }
    if (!this.all("department").length)
      for (const name of ["Upper", "Bottom", "Insole", "Heel", "Finishing"])
        this.add("department", { name });
    if (!this.all("settings").length)
      this.add("settings", {
        key: "app-config",
        activated: false,
        setupComplete: false,
        theme: "light",
        themeVersion: 2,
        pinHash: "",
        companyName: "",
        companyLogo: "",
        contact: "",
        address: "",
        owner: "",
        rememberedUserId: "",
        language: "en",
        inventoryValuation: "unconfigured",
      });
    const settings = this.config();
    if (settings && (settings.themeVersion !== 2 || settings.theme !== "light" || !["en", "ur"].includes(settings.language) || !settings.inventoryValuation)) {
      const migrated = { ...settings, theme: "light", themeVersion: settings.themeVersion || 2, language: "en", inventoryValuation: settings.inventoryValuation || "unconfigured" };
      this.db.prepare("UPDATE records SET data=? WHERE id=?").run(JSON.stringify(migrated), migrated.id);
    }
    if (!this.all("warehouse").length) {
      const warehouse = this.add("warehouse", { code: "MAIN", name: "Main warehouse", active: true });
      this.add("bin", { warehouseId: warehouse.id, code: "MAIN", name: "Main stock", active: true });
    } else if (!this.all("bin").length) {
      const warehouse = this.all("warehouse")[0];
      this.add("bin", { warehouseId: warehouse.id, code: "MAIN", name: "Main stock", active: true });
    }
  }
  close() {
    this.db.close();
  }
  all(kind) {
    return this.db
      .prepare("SELECT * FROM records WHERE kind=? ORDER BY rowid")
      .all(kind)
      .map((r) => ({ id: r.id, ...JSON.parse(r.data) }));
  }
  config() {
    return this.all("settings")[0];
  }
  publicStatus() {
    const c = this.config();
    return {
      activated: c.activated,
      setupComplete: c.setupComplete,
      theme: c.theme,
      language: "en",
      companyName: c.companyName,
      companyLogo: c.companyLogo,
    };
  }
  userByUsername(username) {
    return this.all("user").find(
      (u) =>
        u.username.toLowerCase() ===
        String(username || "")
          .trim()
          .toLowerCase(),
    );
  }
  authenticatedUser(userId) {
    return this.get("user", userId);
  }
  get(kind, id) {
    const r = this.db
      .prepare("SELECT * FROM records WHERE id=? AND kind=?")
      .get(id, kind);
    check(r, `${kind} record was not found.`);
    return { id: r.id, ...JSON.parse(r.data) };
  }
  add(kind, data) {
    if (kind === "cost") {
      safeMoney(data.total);
      data.lines.forEach((l) => safeMoney(l.amount));
    }
    if (kind === "po") safeMoney(data.quantity * data.costSnapshot.total);
    if (kind === "assignment") safeMoney(data.quantity * data.rate);
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO records VALUES(?,?,?)")
      .run(id, kind, JSON.stringify(data));
    return { id, ...data };
  }
  events(target) {
    return this.db
      .prepare(
        `SELECT * FROM events ${target ? "WHERE target=?" : ""} ORDER BY date,created,rowid`,
      )
      .all(...(target ? [target] : []))
      .map((e) => ({ ...e, data: JSON.parse(e.data) }));
  }
  event(kind, target, dt, data) {
    if (data.amount !== undefined) (data.reversalOf ? safeSignedMoney : safeMoney)(data.amount);
    if (data.recovery !== undefined) (data.reversalOf ? safeSignedMoney : safeMoney)(data.recovery);
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO events VALUES(?,?,?,?,?,?)")
      .run(
        id,
        kind,
        target,
        dt,
        JSON.stringify(data),
        new Date().toISOString(),
      );
    return { id, kind, target, date: dt, data };
  }
  reverseEvent(original, correctionId, reason) {
    check(["stock", "receipt", "attendance", "settlement", "earning", "purchase-return", "supplier-payment", "supplier-receive"].includes(original.kind), "This entry cannot be corrected.");
    check(!original.data.reversalOf, "A correction entry cannot be corrected.");
    check(!original.data.correctedBy, "This entry has already been corrected.");
    const data = { ...original.data, reversalOf: original.id, correctionId, correctionReason: reason };
    for (const key of ["quantity", "accepted", "rejected", "days", "amount", "recovery"])
      if (data[key] !== undefined) data[key] = -data[key];
    const reversal = this.event(original.kind, original.target, original.date, data);
    const marked = { ...original.data, correctedBy: correctionId, correctedAt: new Date().toISOString(), correctionReason: reason };
    this.db.prepare("UPDATE events SET data=? WHERE id=?").run(JSON.stringify(marked), original.id);
    return reversal;
  }
  correctEvent(eventId, reason) {
    const row = this.db.prepare("SELECT * FROM events WHERE id=?").get(eventId);
    check(row, "Event was not found.");
    const original = { ...row, data: JSON.parse(row.data) };
    check(["stock", "receipt", "attendance", "settlement", "purchase-return", "supplier-payment", "supplier-receive"].includes(original.kind), "This entry cannot be corrected.");
    check(!original.data.reversalOf, "A correction entry cannot be corrected.");
    check(!original.data.correctedBy, "This entry has already been corrected.");
    const note = text(reason, "Correction reason");
    if (original.kind === "stock" && original.data.transferId)
      throw Error("Transfer entries must be reversed as a complete transfer.");
    if(original.kind === 'stock' && original.data.purchaseId)
      throw Error('Use the purchase return entry to correct purchased stock; invoice stock cannot be reversed independently.');
    const correction = this.event("correction", original.target, today(), { originalEventId: original.id, originalKind: original.kind, reason: note });
    this.reverseEvent(original, correction.id, note);
    if (original.kind === "receipt") {
      const earning = this.db.prepare("SELECT * FROM events WHERE kind='earning' AND json_extract(data,'$.receiptId')=?").get(original.id);
      if (earning) this.reverseEvent({ ...earning, data: JSON.parse(earning.data) }, correction.id, note);
    }
    if (original.kind === "purchase-return") {
      const stock = this.db.prepare("SELECT * FROM events WHERE kind='stock' AND json_extract(data,'$.purchaseReturnId')=?").get(original.id);
      if (stock) this.reverseEvent({ ...stock, data: JSON.parse(stock.data) }, correction.id, note);
    }
    if (original.kind === "stock" && original.data.supplierReceiveId) {
      const supplier = this.db.prepare("SELECT * FROM events WHERE kind='supplier-receive' AND id=?").get(original.data.supplierReceiveId);
      if (supplier) this.reverseEvent({ ...supplier, data: JSON.parse(supplier.data) }, correction.id, note);
    }
    if (original.kind === "supplier-receive") {
      const stock = this.db.prepare("SELECT * FROM events WHERE kind='stock' AND json_extract(data,'$.supplierReceiveId')=?").get(original.id);
      if (stock) this.reverseEvent({ ...stock, data: JSON.parse(stock.data) }, correction.id, note);
    }
    this.validateCorrectionBalances();
    return correction;
  }
  validateCorrectionBalances() {
    for(const m of this.all('material')) {
      let total=0;
      const days=new Map();
      for(const e of this.events(m.id).filter(e=>e.kind==='stock')) days.set(e.date,(days.get(e.date)||0)+e.data.quantity);
      for(const amount of days.values()) {total=round(total+amount);check(total>=0,'Correction would make stock negative. Correct dependent stock movements first.');}
    }
    for(const w of this.all('worker')) {
      for(const d of new Set(this.events(w.id).map(e=>e.date))) {const b=this.balance(w.id,d);check(b.payable>=0 && b.advanceDue>=0,'Correction would exceed unpaid earnings or advance balance. Correct dependent payments first.');}
    }
    for(const p of this.all('po')) check(this.poStats(p).ready>=0,'Correction would invalidate finished stock. Completed output is already in inventory.');
    for(const s of this.all('supplier')) check(this.supplierBalance(s.id).payable>=0,'Correction would exceed supplier payable. Correct dependent supplier payments first.');
  }
  revision(kind, id, before, after, reason) {
    const changes = Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
    if (!changes.length) throw Error("Change at least one value before saving.");
    return this.event("revision", id, today(), {
      entity: kind,
      changes,
      before,
      after,
      reason: String(reason || "Master data updated").trim().slice(0, 500) || "Master data updated",
    });
  }
  balance(workerId, until = "9999-12-31") {
    let earned = 0,
      paid = 0,
      advance = 0,
      recovered = 0;
    for (const e of this.events(workerId).filter((e) => e.date <= until)) {
      if (["earning", "attendance", "salary"].includes(e.kind))
        earned += e.data.amount;
      if (e.kind === "advance") advance += e.data.amount;
      if (e.kind === "settlement") {
        paid += e.data.amount;
        recovered += e.data.recovery;
      }
    }
    return {
      earned,
      paid,
      advance,
      recovered,
      payable: earned - paid - recovered,
      advanceDue: advance - recovered,
    };
  }
  defaultBin() {
    const bin = this.all("bin").find((item) => active(item));
    check(bin, "Create an active stock bin first.");
    return bin;
  }
  stockAtBin(materialId, binId, until = "9999-12-31") {
    return this.stockAtBinLot(materialId, binId, until);
  }
  stockAtBinLot(materialId, binId, until = "9999-12-31", lotCode = null) {
    const defaultBinId = this.defaultBin().id;
    return round(
      this.events(materialId)
        .filter((e) => e.kind === "stock" && e.date <= until && (e.data.binId || defaultBinId) === binId && (lotCode == null || (e.data.lotCode || "") === lotCode))
        .reduce((s, e) => s + e.data.quantity, 0),
    );
  }
  stock(id, until = "9999-12-31", lotCode = null) {
    return round(
      this.events(id)
        .filter((e) => e.kind === "stock" && e.date <= until)
        .filter((e) => lotCode == null || (e.data.lotCode || "") === lotCode)
        .reduce((s, e) => s + e.data.quantity, 0),
    );
  }
  inventoryValuationReport(asOf = today(), method = this.config().inventoryValuation) {
    const chosen = method === "fifo" ? "fifo" : "weighted-average";
    const materials = this.all("material").map((material) => {
      const events = this.events(material.id).filter((event) => event.kind === "stock" && event.date <= asOf);
      let quantity = 0, value = 0;
      const layers = [];
      const averageRate = () => quantity > 0 ? value / quantity : Number(material.rate || 0);
      for (const event of events) {
        const delta = Number(event.data.quantity || 0);
        if (delta > 0) {
          const rate = Number.isFinite(Number(event.data.valuationRate)) ? Number(event.data.valuationRate) : averageRate();
          if (chosen === "fifo") layers.push({ quantity: delta, rate });
          quantity += delta; value += delta * rate;
        } else if (delta < 0) {
          const issueQty = -delta;
          if (chosen === "fifo") {
            let remaining = issueQty;
            while (remaining > 0 && layers.length) {
              const layer = layers[0], used = Math.min(remaining, layer.quantity);
              layer.quantity -= used; remaining -= used;
              value -= used * layer.rate;
              if (layer.quantity <= 0.000001) layers.shift();
            }
            if (remaining > 0) value -= remaining * averageRate();
          } else value -= issueQty * (Number.isFinite(Number(event.data.valuationRate)) ? Number(event.data.valuationRate) : averageRate());
          quantity += delta;
        }
      }
      quantity = round(quantity);
      value = round(Math.max(0, value));
      return { materialId: material.id, materialName: material.name, unit: material.unit, quantity, value, averageRate: quantity > 0 ? round(value / quantity) : 0 };
    });
    return { asOf, method: chosen, materials, totalQuantity: round(materials.reduce((sum, line) => sum + line.quantity, 0)), totalValue: Math.round(materials.reduce((sum, line) => sum + line.value, 0)) };
  }
  checkInventoryPeriodOpen(dateValue) {
    const period = String(dateValue).slice(0, 7);
    check(!this.all("inventory-close").some((close) => close.period === period), `Inventory period ${period} is closed.`);
  }
  ensureLot(materialId, lotCode, dateValue = today()) {
    const code = String(lotCode || "").trim().slice(0, 80);
    if (!code) return null;
    const material = this.get("material", materialId);
    const existing = this.all("lot").find((lot) => lot.materialId === material.id && lot.code.toLowerCase() === code.toLowerCase());
    if (existing) return existing;
    return this.add("lot", { code, materialId: material.id, materialName: material.name, firstReceived: dateValue, active: true });
  }
  reservationRemaining(reservation) {
    return round(reservation.quantity - this.events(reservation.id)
      .filter((e) => ["reservation-release", "reservation-consume"].includes(e.kind))
      .reduce((sum, e) => sum + e.data.quantity, 0));
  }
  reservedAtBin(materialId, binId, lotCode = null, excludeId = null) {
    return round(this.all("reservation")
      .filter((r) => r.materialId === materialId && r.binId === binId && active(r) && r.id !== excludeId && (lotCode == null || (r.lotCode || "") === lotCode))
      .reduce((sum, r) => sum + Math.max(0, this.reservationRemaining(r)), 0));
  }
  supplierBalance(supplierId) {
    const purchases = this.all("purchase").filter((p) => p.supplierId === supplierId);
    const purchaseTotal = purchases.reduce((sum, p) => sum + p.total, 0);
    const receivedTotal = this.events(supplierId).filter((e) => e.kind === "supplier-receive").reduce((sum, e) => sum + e.data.amount, 0);
    const purchased = purchaseTotal + receivedTotal;
    const purchaseIds = new Set(purchases.map((p) => p.id));
    const returned = this.events().filter((e) => e.kind === "purchase-return" && purchaseIds.has(e.data.purchaseId)).reduce((sum, e) => sum + e.data.amount, 0);
    const paid = this.events(supplierId).filter((e) => e.kind === "supplier-payment").reduce((sum, e) => sum + e.data.amount, 0);
    return { purchased, returned, paid, payable: purchased - returned - paid };
  }
  received(id) {
    return this.events(id)
      .filter((e) => e.kind === "receipt")
      .reduce(
        (s, e) => ({
          accepted: s.accepted + e.data.accepted,
          rejected: s.rejected + e.data.rejected,
        }),
        { accepted: 0, rejected: 0 },
      );
  }
  poStats(po) {
    const tasks = this.all("assignment").filter((a) => a.poId === po.id && !a.cancelled);
    const departments = po.departments.map((id) => {
      const list = tasks.filter((a) => a.departmentId === id);
      return {
        id,
        name: po.departmentNames?.[id] || this.get("department", id).name,
        assigned: round(list.reduce((s, a) => s + a.quantity / a.factor, 0)),
        accepted: round(
          list.reduce((s, a) => s + this.received(a.id).accepted / a.factor, 0),
        ),
      };
    });
    const es = this.events(po.id);
    const finished = es
      .filter((e) => e.kind === "finished")
      .reduce((s, e) => s + e.data.quantity, 0);
    const dispatched = es
      .filter((e) => e.kind === "dispatch")
      .reduce((s, e) => s + e.data.quantity, 0);
    const variantStats = (po.variants || []).map((variant) => {
      const key = `${variant.size}::${variant.color}`;
      const finished = es.filter((e) => e.kind === "finished" && e.data.variantKey === key).reduce((sum, e) => sum + e.data.quantity, 0);
      const dispatched = es.filter((e) => e.kind === "dispatch" && e.data.variantKey === key).reduce((sum, e) => sum + e.data.quantity, 0);
      return { key, size: variant.size, color: variant.color, planned: variant.quantity, finished, dispatched, available: finished - dispatched };
    });
    return {
      departments,
      finished,
      dispatched,
      available: finished - dispatched,
      variantStats,
      ready:
        Math.floor(Math.min(...departments.map((d) => d.accepted))) - finished,
    };
  }
  poCosting(po) {
    const estimatedMaterial = po.costSnapshot.lines.reduce((sum, line) => sum + line.amount, 0) * po.quantity;
    const estimatedLabour = po.costSnapshot.labour * po.quantity;
    const estimatedOverhead = po.costSnapshot.overhead * po.quantity;
    const assignments = this.all("assignment").filter((a) => a.poId === po.id);
    const pieceLabour = assignments.reduce((sum, a) => sum + this.events(a.workerId).filter((e) => e.kind === "earning" && e.data.assignmentId === a.id).reduce((n, e) => n + e.data.amount, 0), 0);
    const end = this.events(po.id).filter((e) => ["finished", "dispatch"].includes(e.kind)).map((e) => e.date).sort().at(-1) || today();
    const inPeriod = (e) => e.date >= po.date && e.date <= end;
    const dailyLabour = this.all("worker").reduce((sum, w) => sum + this.events(w.id).filter((e) => e.kind === "attendance" && inPeriod(e)).reduce((n, e) => n + e.data.amount, 0), 0);
    const salaryLabour = this.all("worker").reduce((sum, w) => sum + this.events(w.id).filter((e) => e.kind === "salary" && inPeriod(e)).reduce((n, e) => n + e.data.amount, 0), 0);
    const actualMaterial = this.all("material").reduce((sum, material) => {
      const rate = po.costSnapshot.lines.find((line) => line.materialId === material.id)?.rate || 0;
      return sum + this.events(material.id).filter((e) => e.kind === "stock" && e.data.poId === po.id).reduce((n, e) => n - e.data.quantity * rate, 0);
    }, 0);
    // Factory-wide wages have no PO allocation. Do not charge them to every open PO.
    const actualLabour = pieceLabour;
    const estimatedByDepartment = Object.fromEntries((po.costSnapshot.departmentLabour || [{ departmentId: null, name: "General labour", amount: po.costSnapshot.labour }]).map((line) => [line.departmentId || "general", { name: line.name, amount: line.amount * po.quantity }]));
    const actualByDepartment = Object.fromEntries(assignments.reduce((rows, a) => {
      const key = a.departmentId || "general", name = po.departmentNames?.[a.departmentId] || "General labour";
      const amount = this.events(a.workerId).filter((e) => e.kind === "earning" && e.data.assignmentId === a.id).reduce((n, e) => n + e.data.amount, 0);
      const current = rows.find((row) => row[0] === key);
      if (current) current[1].amount += amount; else rows.push([key, { name, amount }]);
      return rows;
    }, []));
    const estimated = { material: estimatedMaterial, labour: estimatedLabour, overhead: estimatedOverhead, total: estimatedMaterial + estimatedLabour + estimatedOverhead };
    const actual = { material: actualMaterial, labour: actualLabour, overhead: 0, total: actualMaterial + actualLabour };
    return { estimated, actual, variance: { material: actual.material - estimated.material, labour: actual.labour - estimated.labour, overhead: actual.overhead - estimated.overhead, total: actual.total - estimated.total }, labourByDepartment: { estimated: estimatedByDepartment, actual: actualByDepartment }, labourBreakdown: { piece: pieceLabour, daily: dailyLabour, salary: salaryLabour, unallocated: dailyLabour + salaryLabour }, periodEnd: end };
  }
  poMaterialUsage(po) {
    return po.costSnapshot.lines.map((line) => {
      const events = this.events(line.materialId).filter((event) => event.kind === "stock" && event.data.poId === po.id);
      const issued = events.filter((event) => event.data.type === "issue").reduce((sum, event) => sum + Math.abs(event.data.quantity), 0);
      const returned = events.filter((event) => event.data.type === "return").reduce((sum, event) => sum + Math.max(0, event.data.quantity), 0);
      const scrap = events.filter((event) => event.data.type === "scrap").reduce((sum, event) => sum + Math.abs(event.data.quantity), 0);
      const planned = round(line.quantity * po.quantity);
      const netUsed = round(Math.max(0, issued - returned));
      const wip = round(Math.max(0, netUsed - scrap));
      return { materialId: line.materialId, materialName: line.name, unit: line.unit, planned, issued: round(issued), returned: round(returned), scrap: round(scrap), actual: netUsed, variance: round(netUsed - planned), wip, rate: line.rate, actualValue: Math.round(netUsed * line.rate), wipValue: Math.round(wip * line.rate) };
    });
  }
  snapshot() {
    return {
      ...Object.fromEntries(kinds.map((k) => [k, this.all(k)])),
      events: this.events(),
      balances: Object.fromEntries(
        this.all("worker").map((w) => [w.id, this.balance(w.id)]),
      ),
      stocks: Object.fromEntries(
        this.all("material").map((m) => [m.id, this.stock(m.id)]),
      ),
      poStats: Object.fromEntries(
        this.all("po").map((p) => [p.id, this.poStats(p)]),
      ),
      poCosts: Object.fromEntries(
        this.all("po").map((p) => [p.id, this.poCosting(p)]),
      ),
      poMaterialUsage: Object.fromEntries(this.all("po").map((p) => [p.id, this.poMaterialUsage(p)])),
      supplierBalances: Object.fromEntries(
        this.all("supplier").map((s) => [s.id, this.supplierBalance(s.id)]),
      ),
      inventoryValuation: this.inventoryValuationReport(),
      today: today(),
      config: this.config(),
      users: this.all("user").map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        active: u.active,
      })),
    };
  }
  command(action, p = {}) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.execute(action, p);
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  execute(action, p) {
    const dt = () => postedDate(p.date || today());
    if (action === "activate") {
      check(
        !this.config().activated,
        "This installation is already activated.",
      );
      check(
        hashPassword(normalizeActivationKey(text(p.key, "Activation key"))) ===
          ACTIVATION_HASH,
        "Activation key is incorrect.",
      );
      const c = this.config();
      c.activated = true;
      this.db
        .prepare("UPDATE records SET data=? WHERE id=?")
        .run(JSON.stringify(c), c.id);
      return this.publicStatus();
    }
    if (action === "setup-company") {
      check(this.config().activated, "Activate SoleNexa before factory setup.");
      const c = {
        ...this.config(),
        companyName: text(p.companyName, "Factory name"),
        contact: String(p.contact || "").slice(0, 200),
        address: String(p.address || "").slice(0, 500),
        owner: text(p.owner, "Owner / responsible person"),
        companyLogo: String(p.companyLogo || "").slice(0, 2_000_000),
        pinHash: String(p.pinHash || ""),
      };
      this.db
        .prepare("UPDATE records SET data=? WHERE id=?")
        .run(JSON.stringify(c), c.id);
      return c;
    }
    if (action === "delete-all-data") {
      check(String(p.confirmation || "").trim() === "DELETE ALL FACTORY DATA", "Type DELETE ALL FACTORY DATA to confirm permanent deletion.");
      const current = this.config();
      this.db.prepare("DELETE FROM events").run();
      this.db.prepare("DELETE FROM records").run();
      this.db.prepare("DELETE FROM audit").run();
      this.db.prepare("DELETE FROM login_attempts").run();
      return this.add("settings", { key: "app-config", activated: current.activated, setupComplete: false, theme: "light", themeVersion: 2, language: current.language === "ur" ? "ur" : "en", pinHash: "", companyName: "", companyLogo: "", contact: "", address: "", owner: "", rememberedUserId: "" });
    }
    if (action === "company-profile") {
      check(this.config().setupComplete, "Complete factory setup before editing the profile.");
      const current = this.config();
      const c = {
        ...current,
        companyName: text(p.companyName, "Factory name"),
        contact: String(p.contact || "").trim().slice(0, 200),
        address: String(p.address || "").trim().slice(0, 500),
        owner: text(p.owner, "Owner / responsible person"),
        companyLogo: p.removeLogo ? "" : p.companyLogo === undefined ? current.companyLogo : String(p.companyLogo).slice(0, 2_000_000),
      };
      this.db.prepare("UPDATE records SET data=? WHERE id=?").run(JSON.stringify(c), c.id);
      return c;
    }    if (action === "create-user") {
      check(
        this.config().activated,
        "Activate SoleNexa before creating users.",
      );
      const username = text(p.username, "Username").toLowerCase();
      check(
        /^[a-z0-9._-]{3,40}$/.test(username),
        "Username must be 3–40 letters, numbers, dot, underscore or dash.",
      );
      check(!this.userByUsername(username), "Username already exists.");
      const role = text(p.role, "Role");
      check(
        [
          "owner",
          "admin",
          "manager",
          "sub-manager",
          "accounts",
          "production",
          "inventory",
          "viewer", "supervisor", "storekeeper", "accountant", "worker",
        ].includes(role),
        "Choose a valid role.",
      );
      const password = text(p.password, "Password");
      check(password.length >= 8, "Password must be at least 8 characters.");
      const user = this.add("user", {
        username,
        role,
        passwordHash: hashPassword(password),
        active: true,
        created: today(),
      });
      if (role === "owner" && this.config().companyName) {
        const c = { ...this.config(), setupComplete: true };
        this.db
          .prepare("UPDATE records SET data=? WHERE id=?")
          .run(JSON.stringify(c), c.id);
      }
      return user;
    }
    if (action === "login") {
      const u = this.userByUsername(p.username);
      check(u && u.active, "Username or password is incorrect.");
      check(
        hashPassword(p.password) === u.passwordHash,
        "Username or password is incorrect.",
      );
      return { id: u.id, username: u.username, role: u.role };
    }
    if (action === "theme") {
      const c = {
        ...this.config(),
        theme: "light",
      };
      this.db
        .prepare("UPDATE records SET data=? WHERE id=?")
        .run(JSON.stringify(c), c.id);
      return c;
    }
    if (action === "language") {
      const c = { ...this.config(), theme: "light", language: "en" };
      this.db.prepare("UPDATE records SET data=? WHERE id=?").run(JSON.stringify(c), c.id);
      return c;
    }
    if (action === "supplier") {
      const name = text(p.name, "Supplier name");
      check(!this.all("supplier").some((s) => s.name.toLowerCase() === name.toLowerCase()), "Supplier already exists.");
      return this.add("supplier", {
        name,
        phone: String(p.phone || "").trim().slice(0, 50),
        address: String(p.address || "").trim().slice(0, 500),
        notes: String(p.notes || "").trim().slice(0, 500),
        active: true,
      });
    }
    if (action === "supplier-revise") {
      const current = this.get("supplier", p.id), name = text(p.name, "Supplier name");
      check(!this.all("supplier").some((s) => s.id !== current.id && s.name.toLowerCase() === name.toLowerCase()), "Supplier already exists.");
      const next = { ...current, name, phone: String(p.phone || "").trim().slice(0, 50), address: String(p.address || "").trim().slice(0, 500), notes: String(p.notes || "").trim().slice(0, 500), active: flag(p.active, active(current)) };
      this.db.prepare("UPDATE records SET data=? WHERE id=?").run(JSON.stringify(next), next.id);
      this.revision("supplier", next.id, current, next, p.reason);
      return next;
    }
    if (action === "purchase") {
      this.checkInventoryPeriodOpen(p.date || today());
      const supplier = this.get("supplier", p.supplierId);
      check(active(supplier), "Inactive suppliers cannot be used for new purchases.");
      const invoice = text(p.invoice, "Invoice / bill number");
      check(!this.all("purchase").some((x) => x.supplierId === supplier.id && x.invoice.toLowerCase() === invoice.toLowerCase()), "This supplier invoice already exists.");
      check(Array.isArray(p.lines) && p.lines.length > 0, "Add at least one material line.");
      check(new Set(p.lines.map(line=>line.materialId)).size===p.lines.length,'Use one line per material on a purchase invoice.');
      const lines = p.lines.map((line) => {
        const material = this.get("material", line.materialId);
        check(active(material), "Inactive materials cannot be purchased.");
        const quantity = num(line.quantity, "Quantity", 0.000001), rate = cents(line.rate);
        const lotCode = String(line.lotCode || "").trim().slice(0, 80);
        const lot = lotCode ? this.ensureLot(material.id, lotCode, postedDate(p.date || today())) : null;
        return { materialId: material.id, name: material.name, unit: material.unit, quantity, rate, amount: safeMoney(Math.round(quantity * rate)), lotCode: lot?.code || null, lotId: lot?.id || null };
      });
      const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
      const discount = cents(p.discount || 0), freight = cents(p.freight || 0), tax = cents(p.tax || 0);
      check(discount <= subtotal, "Discount cannot exceed the material subtotal.");
      const landedTotal = safeMoney(subtotal - discount + freight + tax);
      const allocation = freight + tax - discount;
      let allocated = 0;
      const landedLines = lines.map((line, index) => {
        const share = index === lines.length - 1 ? allocation - allocated : Math.round(allocation * line.amount / subtotal);
        allocated += share;
        const landedAmount = safeMoney(line.amount + share);
        return { ...line, landedAmount, landedRate: round(landedAmount / line.quantity) };
      });
      const purchase = this.add("purchase", { number: `PUR-${String(this.all("purchase").length + 1).padStart(4, "0")}`, supplierId: supplier.id, supplierName: supplier.name, invoice, date: dt(), lines: landedLines, subtotal, discount, freight, tax, total: landedTotal, valuationMethod: "landed-cost", notes: String(p.note || "").slice(0, 500) });
      for (const line of landedLines) this.event("stock", line.materialId, purchase.date, { quantity: line.quantity, type: "receive", purchaseId: purchase.id, invoice, lotId: line.lotId, lotCode: line.lotCode, valuationRate: line.landedRate, valuationAmount: line.landedAmount, note: `Purchase ${purchase.number} · ${invoice}` });
      return purchase;
    }
    if (action === "purchase-return") {
      this.checkInventoryPeriodOpen(p.date || today());
      const purchase = this.get("purchase", p.purchaseId), materialId = text(p.materialId, "Material");
      const line = purchase.lines.find((x) => x.materialId === materialId);
      check(line, "This material is not on the purchase.");
      const quantity = num(p.quantity, "Return quantity", 0.000001), returned = this.events().filter((e) => e.kind === "purchase-return" && e.data.purchaseId === purchase.id && e.data.materialId === materialId).reduce((sum, e) => sum + e.data.quantity, 0);
      check(quantity <= line.quantity - returned, "Purchase return exceeds the received quantity.");
      const dtValue = dt();
      this.checkInventoryPeriodOpen(dtValue);
      check(dtValue >= purchase.date, "Return date cannot be before the purchase date.");
      const material = this.get("material", materialId), currentStock = this.stock(material.id, "9999-12-31", line.lotCode || null);
      check(quantity <= currentStock, "Cannot return more than current stock. Issue or adjust the remaining stock first.");
      const valuationRate = line.landedRate ?? line.rate;
      const amount = safeMoney(Math.round(quantity * valuationRate));
      const returnedEvent = this.event("purchase-return", material.id, dtValue, { purchaseId: purchase.id, supplierId: purchase.supplierId, materialId: material.id, quantity, amount, valuationRate, lotId: line.lotId, lotCode: line.lotCode, note: text(p.note, "Return reason") });
      this.event("stock", material.id, dtValue, { quantity: -quantity, type: "purchase-return", purchaseId: purchase.id, purchaseReturnId: returnedEvent.id, lotId: line.lotId, lotCode: line.lotCode, valuationRate, valuationAmount: amount, note: `Purchase return · ${purchase.invoice}` });
      return returnedEvent;
    }
    if (action === "supplier-payment") {
      const supplier = this.get("supplier", p.supplierId), amount = cents(p.amount);
      check(amount > 0, "Supplier payment must be positive.");
      const balance = this.supplierBalance(supplier.id);
      check(amount <= balance.payable, "Supplier payment exceeds outstanding payable.");
      return this.event("supplier-payment", supplier.id, dt(), { amount, note: text(p.note, "Payment reference") });
    }
    if (action === "warehouse") {
      const code = text(p.code, "Warehouse code").toUpperCase();
      const name = text(p.name, "Warehouse name");
      check(!this.all("warehouse").some((w) => w.code === code), "Warehouse code already exists.");
      return this.add("warehouse", { code, name, active: true });
    }
    if (action === "bin") {
      const warehouse = this.get("warehouse", p.warehouseId);
      check(active(warehouse), "Inactive warehouses cannot receive new bins.");
      const code = text(p.code, "Bin code").toUpperCase();
      const name = text(p.name, "Bin name");
      check(!this.all("bin").some((b) => b.warehouseId === warehouse.id && b.code === code), "Bin code already exists in this warehouse.");
      return this.add("bin", { warehouseId: warehouse.id, code, name, active: true });
    }
    if (action === "stock-count") {
      const countDate = postedDate(p.date || today());
      this.checkInventoryPeriodOpen(countDate);
      const rawLines = Array.isArray(p.lines) && p.lines.length ? p.lines : [{ materialId: p.materialId, binId: p.binId, lotCode: p.lotCode, counted: p.counted }];
      check(rawLines.length <= 200, "A stock count sheet cannot contain more than 200 lines.");
      const seen = new Set();
      const lines = rawLines.map((raw, index) => {
        const material = this.get("material", raw.materialId);
        const bin = this.get("bin", raw.binId);
        check(active(material), `Line ${index + 1}: inactive materials cannot be counted.`);
        check(active(bin) && active(this.get("warehouse", bin.warehouseId)), `Line ${index + 1}: choose an active warehouse bin.`);
        const counted = num(raw.counted, `Line ${index + 1} counted quantity`);
        const selectedReservation = raw.reservationId ? this.get("reservation", raw.reservationId) : null;
        const lotCode = String(raw.lotCode || selectedReservation?.lotCode || "").trim().slice(0, 80);
        const lot = lotCode ? this.all("lot").find((item) => item.materialId === material.id && item.code.toLowerCase() === lotCode.toLowerCase()) : null;
        check(!lotCode || lot, `Line ${index + 1}: choose an existing lot before counting it.`);
        const key = `${material.id}|${bin.id}|${lot?.code || ""}`;
        check(!seen.has(key), `Line ${index + 1}: the same material, bin and lot appears more than once.`);
        seen.add(key);
        check(!this.all("stock-count").some((c) => (c.status === "draft" || c.status === "submitted") && (c.lines || [{ materialId: c.materialId, binId: c.binId, lotCode: c.lotCode }]).some((existing) => existing.materialId === material.id && existing.binId === bin.id && (existing.lotCode || "") === (lot?.code || ""))), `Line ${index + 1}: finish the existing count for this material, bin and lot first.`);
        const expected = this.stockAtBinLot(material.id, bin.id, countDate, lot?.code || null);
        return { materialId: material.id, materialName: material.name, binId: bin.id, binName: bin.name, warehouseId: bin.warehouseId, lotId: lot?.id || null, lotCode: lot?.code || null, expected, counted, variance: round(counted - expected) };
      });
      check(lines.length > 0, "Add at least one stock count line.");
      const first = lines[0];
      return this.add("stock-count", {
        number: `COUNT-${String(this.all("stock-count").length + 1).padStart(4, "0")}`,
        date: countDate, materialId: first.materialId, materialName: first.materialName,
        binId: first.binId, binName: first.binName, warehouseId: first.warehouseId,
        lotId: first.lotId, lotCode: first.lotCode,
        expected: first.expected, counted: first.counted, variance: first.variance, lines,
        note: String(p.note || "").trim().slice(0, 500), status: "draft",
      });
    }
    if (action === "reservation") {
      const material = this.get("material", p.materialId), bin = this.get("bin", p.binId);
      check(active(material), "Inactive materials cannot be reserved.");
      check(active(bin) && active(this.get("warehouse", bin.warehouseId)), "Choose an active warehouse bin.");
      const quantity = num(p.quantity, "Reserved quantity", 0.000001), dateValue = postedDate(p.date || today());
      const lotCode = String(p.lotCode || "").trim().slice(0, 80);
      const lot = lotCode ? this.all("lot").find((item) => item.materialId === material.id && item.code.toLowerCase() === lotCode.toLowerCase()) : null;
      check(!lotCode || lot, "Choose an existing lot before reserving it.");
      const expected = this.stockAtBinLot(material.id, bin.id, dateValue, lot?.code || null);
      const free = expected - this.reservedAtBin(material.id, bin.id, lot?.code || null);
      check(quantity <= free, "Reservation exceeds free stock in this bin and lot.");
      const reservation = this.add("reservation", {
        number: `RES-${String(this.all("reservation").length + 1).padStart(4, "0")}`,
        date: dateValue, materialId: material.id, materialName: material.name,
        binId: bin.id, binName: bin.name, warehouseId: bin.warehouseId,
        lotId: lot?.id || null, lotCode: lot?.code || null,
        quantity, note: String(p.note || "").trim().slice(0, 500), active: true,
      });
      this.event("reservation-create", reservation.id, dateValue, { quantity, note: reservation.note || "Reservation created" });
      return reservation;
    }
    if (action === "reservation-release") {
      const reservation = this.get("reservation", p.id), remaining = this.reservationRemaining(reservation);
      check(remaining > 0, "This reservation has no quantity left to release.");
      const quantity = p.quantity == null || p.quantity === "" ? remaining : num(p.quantity, "Release quantity", 0.000001);
      check(quantity <= remaining, "Release quantity exceeds the reservation balance.");
      return this.event("reservation-release", reservation.id, today(), { quantity, note: text(p.note || "Reservation released", "Release reason") });
    }
    if (action === "transfer") {
      const material = this.get("material", p.materialId);
      const source = this.get("bin", p.sourceBinId), destination = this.get("bin", p.destinationBinId);
      check(active(material), "Inactive materials cannot be transferred.");
      check(active(source) && active(this.get("warehouse", source.warehouseId)), "Choose an active source bin.");
      check(active(destination) && active(this.get("warehouse", destination.warehouseId)), "Choose an active destination bin.");
      check(source.id !== destination.id, "Source and destination bins must be different.");
      const quantity = num(p.quantity, "Transfer quantity", 0.000001), dateValue = postedDate(p.date || today());
      this.checkInventoryPeriodOpen(dateValue);
      const lotCode = String(p.lotCode || "").trim().slice(0, 80);
      const lot = lotCode ? this.all("lot").find((item) => item.materialId === material.id && item.code.toLowerCase() === lotCode.toLowerCase()) : null;
      check(!lotCode || lot, "Choose an existing lot before transferring it.");
      const sourceStock = this.stockAtBinLot(material.id, source.id, dateValue, lot?.code || null);
      const reserved = this.reservedAtBin(material.id, source.id, lot?.code || null);
      check(quantity <= sourceStock - reserved, "Transfer exceeds free stock in the source bin.");
      const transfer = this.add("transfer", {
        number: `TRF-${String(this.all("transfer").length + 1).padStart(4, "0")}`,
        date: dateValue, materialId: material.id, materialName: material.name,
        sourceBinId: source.id, sourceBinName: source.name, sourceWarehouseId: source.warehouseId,
        destinationBinId: destination.id, destinationBinName: destination.name, destinationWarehouseId: destination.warehouseId,
        lotId: lot?.id || null, lotCode: lot?.code || null, quantity,
        note: String(p.note || "").trim().slice(0, 500), status: "completed", active: true,
      });
      this.event("stock", material.id, dateValue, { quantity: -quantity, type: "transfer-out", binId: source.id, warehouseId: source.warehouseId, lotId: lot?.id || null, lotCode: lot?.code || null, transferId: transfer.id, note: `Transfer ${transfer.number} to ${destination.name}` });
      this.event("stock", material.id, dateValue, { quantity, type: "transfer-in", binId: destination.id, warehouseId: destination.warehouseId, lotId: lot?.id || null, lotCode: lot?.code || null, transferId: transfer.id, note: `Transfer ${transfer.number} from ${source.name}` });
      return transfer;
    }
    if (action === "inventory-valuation") {
      const method = String(p.method || "").trim().toLowerCase();
      check(["weighted-average", "fifo"].includes(method), "Choose weighted-average or FIFO valuation.");
      const current = this.config();
      const next = { ...current, inventoryValuation: method, inventoryValuationApprovedBy: String(p.approvedBy || "Accountant").slice(0, 80), inventoryValuationApprovedAt: new Date().toISOString() };
      this.db.prepare("UPDATE records SET data=? WHERE id=?").run(JSON.stringify(next), next.id);
      return next;
    }
    if (action === "inventory-close") {
      const period = String(p.period || "").trim();
      check(/^\d{4}-(0[1-9]|1[0-2])$/.test(period), "Choose a valid inventory period.");
      check(this.config().inventoryValuation !== "unconfigured", "Choose an inventory valuation method before closing a period.");
      const lastDay = new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0).toISOString().slice(0, 10);
      check(lastDay < today(), "Only a completed inventory period can be closed.");
      check(!this.all("inventory-close").some((close) => close.period === period), "This inventory period is already closed.");
      return this.add("inventory-close", { period, periodEnd: lastDay, method: this.config().inventoryValuation, valuation: this.inventoryValuationReport(lastDay), closedBy: String(p.closedBy || "Accountant").slice(0, 80), closedAt: new Date().toISOString(), note: String(p.note || "").trim().slice(0, 500) });
    }
    if (action === "inspection") {
      const stage = String(p.stage || "").trim();
      check(["incoming", "in-process", "final"].includes(stage), "Choose an inspection stage.");
      const quantity = num(p.quantity, "Inspection quantity", 0.000001), accepted = num(p.accepted, "Accepted quantity", 0), rejected = num(p.rejected, "Rejected quantity", 0);
      check(accepted + rejected <= quantity, "Accepted and rejected quantities cannot exceed the inspection quantity.");
      check(accepted + rejected > 0, "Enter an accepted or rejected quantity.");
      const disposition = String(p.disposition || "").trim();
      check(["pass", "rework", "scrap", "hold", "reject"].includes(disposition), "Choose a valid disposition.");
      const defect = String(p.defect || "").trim().slice(0, 500);
      check(rejected === 0 || defect, "Add a defect description for rejected quantity.");
      let referenceId = null, referenceName = "";
      if (stage === "incoming") { const material = this.get("material", p.materialId); check(active(material), "Choose an active material for incoming inspection."); referenceId = material.id; referenceName = material.name; }
      if (stage === "in-process") { const assignment = this.get("assignment", p.assignmentId); referenceId = assignment.id; referenceName = `${this.get("po", assignment.poId).number} · ${this.get("worker", assignment.workerId).name}`; }
      if (stage === "final") { const po = this.get("po", p.poId); referenceId = po.id; referenceName = `${po.number} · ${po.article}`; }
      return this.add("inspection", { number: `QC-${String(this.all("inspection").length + 1).padStart(4, "0")}`, date: postedDate(p.date || today()), stage, referenceId, referenceName, materialId: stage === "incoming" ? referenceId : null, assignmentId: stage === "in-process" ? referenceId : null, poId: stage === "final" ? referenceId : null, quantity, accepted, rejected, disposition, defect, note: String(p.note || "").trim().slice(0, 500), status: "draft" });
    }
    if (action === "inspection-submit") {
      const inspection = this.get("inspection", p.id);
      check(inspection.status === "draft", "Only a draft inspection can be submitted.");
      const next = { ...inspection, status: "submitted", submittedAt: new Date().toISOString() };
      this.db.prepare("UPDATE records SET data=? WHERE id=?").run(JSON.stringify(next), next.id);
      return next;
    }
    if (action === "inspection-reject") {
      const inspection = this.get("inspection", p.id);
      check(inspection.status === "submitted", "Only a submitted inspection can be rejected.");
      const next = { ...inspection, status: "rejected", rejectionReason: text(p.reason, "Rejection reason"), rejectedAt: new Date().toISOString() };
      this.db.prepare("UPDATE records SET data=? WHERE id=?").run(JSON.stringify(next), next.id);
      return next;
    }
    if (action === "inspection-approve") {
      const inspection = this.get("inspection", p.id);
      check(inspection.status === "submitted", "Only a submitted inspection can be approved.");
      const next = { ...inspection, status: "approved", approvedAt: new Date().toISOString(), approvedBy: String(p.approvedBy || "").slice(0, 80) };
      this.db.prepare("UPDATE records SET data=? WHERE id=?").run(JSON.stringify(next), next.id);
      return next;
    }
    if (action === "stock-count-submit") {
      const count = this.get("stock-count", p.id);
      check(count.status === "draft", "Only a draft stock count can be submitted.");
      const next = { ...count, status: "submitted", submittedAt: new Date().toISOString() };
      this.db.prepare("UPDATE records SET data=? WHERE id=?").run(JSON.stringify(next), next.id);
      return next;
    }
    if (action === "stock-count-reject") {
      const count = this.get("stock-count", p.id);
      check(count.status === "submitted", "Only a submitted stock count can be rejected.");
      const next = { ...count, status: "rejected", rejectionReason: text(p.reason, "Rejection reason"), rejectedAt: new Date().toISOString() };
      this.db.prepare("UPDATE records SET data=? WHERE id=?").run(JSON.stringify(next), next.id);
      return next;
    }
    if (action === "stock-count-approve") {
      const count = this.get("stock-count", p.id);
      check(count.status === "submitted", "Only a submitted stock count can be approved.");
      check(count.date === today(), "Only a same-day stock count can be approved safely.");
      const lines = count.lines || [{ materialId: count.materialId, materialName: count.materialName, binId: count.binId, binName: count.binName, warehouseId: count.warehouseId, lotId: count.lotId, lotCode: count.lotCode, expected: count.expected, counted: count.counted, variance: count.variance }];
      const movements = lines.map((line, index) => {
        const current = this.stockAtBinLot(line.materialId, line.binId, count.date, line.lotCode || null);
        check(round(current) === round(line.expected), `Stock changed on line ${index + 1}. Start a new count before approval.`);
        check(round(current + line.variance) >= 0, `Count adjustment on line ${index + 1} cannot make the bin stock negative.`);
        return this.event("stock", line.materialId, count.date, { quantity: line.variance, type: "count-adjustment", binId: line.binId, warehouseId: line.warehouseId, lotId: line.lotId, lotCode: line.lotCode, stockCountId: count.id, stockCountLine: index + 1, note: `Approved ${count.number} line ${index + 1}${count.note ? ` · ${count.note}` : ""}` });
      });
      const next = { ...count, lines, status: "approved", approvedAt: new Date().toISOString(), adjustmentEventIds: movements.map((movement) => movement.id), adjustmentEventId: movements[0]?.id || null };
      this.db.prepare("UPDATE records SET data=? WHERE id=?").run(JSON.stringify(next), next.id);
      return next;
    }
    if (action === "department") {
      const name = text(p.name, "Department name");
      check(
        !this.all("department").some(
          (d) => d.name.toLowerCase() === name.toLowerCase(),
        ),
        "Department already exists.",
      );
      return this.add("department", { name, active: true });
    }
    if (action === "department-revise") {
      const current = this.get("department", p.id), name = text(p.name, "Department name");
      check(!this.all("department").some((d) => d.id !== current.id && d.name.toLowerCase() === name.toLowerCase()), "Department already exists.");
      const next = { ...current, name, active: flag(p.active, active(current)) };
      this.db.prepare("UPDATE records SET data=? WHERE id=?").run(JSON.stringify(next), next.id);
      this.revision("department", next.id, current, next, p.reason);
      return next;
    }
    if (action === "material") {
      const name = text(p.name, "Material name"),
        unit = text(p.unit, "Unit");
      check(
        ["kg", "yard", "pcs", "meter", "litre", "pair"].includes(unit),
        "Choose a supported material unit.",
      );
      return this.add("material", {
        name,
        unit,
        rate: cents(p.rate),
        reorder: num(p.reorder, "Reorder level"),
        active: true,
      });
    }
    if (action === "material-revise") {
      const current = this.get("material", p.id), name = text(p.name, "Material name"), unit = text(p.unit, "Unit");
      check(["kg", "yard", "pcs", "meter", "litre", "pair"].includes(unit), "Choose a supported material unit.");
      const next = { ...current, name, unit, rate: cents(p.rate), reorder: num(p.reorder, "Reorder level"), active: flag(p.active, active(current)) };
      this.db.prepare("UPDATE records SET data=? WHERE id=?").run(JSON.stringify(next), next.id);
      this.revision("material", next.id, current, next, p.reason);
      return next;
    }
    if (action === "cost") {
      check(
        Array.isArray(p.lines) && p.lines.length > 0,
        "Add at least one material.",
      );
      const lines = p.lines.map((l) => {
        const m = this.get("material", l.materialId),
          quantity = num(l.quantity, "Consumption", 0.000001),
          wastage = num(l.wastage, "Wastage");
        check(active(m), "Inactive materials cannot be used in new cost sheets.");
        check(wastage <= 100, "Wastage cannot exceed 100%.");
        return {
          materialId: m.id,
          name: m.name,
          unit: m.unit,
          rate: m.rate,
          quantity,
          wastage,
          amount: Math.round(m.rate * quantity * (1 + wastage / 100)),
        };
      });
      const departmentLabour = Array.isArray(p.departmentLabour) && p.departmentLabour.length
        ? p.departmentLabour.map((line) => {
            const department = this.get("department", line.departmentId);
            check(active(department), "Inactive departments cannot be used in new cost sheets.");
            return { departmentId: department.id, name: department.name, amount: cents(line.amount || 0) };
          })
        : [{ departmentId: null, name: "General labour", amount: cents(p.labour) }];
      const labour = departmentLabour.reduce((sum, line) => sum + line.amount, 0),
        overhead = cents(p.overhead);
      return this.add("cost", {
        name: text(p.name, "Article / cost sheet name"),
        sku: text(p.sku, "Article code"),
        lines,
        labour,
        departmentLabour,
        overhead,
        total: lines.reduce((s, l) => s + l.amount, 0) + labour + overhead,
        date: dt(),
      });
    }
    if (action === "po") {
      const cost = this.get("cost", p.costId);
      check(
        Array.isArray(p.departments) && p.departments.length > 0,
        "Select at least one department.",
      );
      const departments = [...new Set(p.departments)];
      departments.forEach((id) => { const department = this.get("department", id); check(active(department), "Inactive departments cannot be used in new production orders."); });
      check(date(p.due) >= dt(), "Due date cannot be before the PO date.");
      const quantity = num(p.quantity, "Pairs", 1, true);
      const variants = Array.isArray(p.variants) && p.variants.length ? p.variants.map((v) => ({ size: text(v.size, "Variant size"), color: text(v.color, "Variant colour"), quantity: num(v.quantity, "Variant pairs", 1, true) })) : [];
      if (variants.length) {
        const keys = variants.map((v) => `${v.size.toLowerCase()}::${v.color.toLowerCase()}`);
        check(new Set(keys).size === keys.length, "Size and colour variants must be unique.");
        check(variants.reduce((sum, v) => sum + v.quantity, 0) === quantity, "Variant pairs must equal the PO quantity.");
      }
      return this.add("po", {
        number: `PO-${String(this.all("po").length + 1).padStart(4, "0")}`,
        costId: cost.id,
        article: cost.name,
        sku: cost.sku,
        costSnapshot: cost,
        quantity,
        departments,
        departmentNames: Object.fromEntries(departments.map((id) => [id, this.get("department", id).name])),
        date: dt(),
        due: date(p.due),
        notes: String(p.notes || "").slice(0, 1000),
        variants,
      });
    }
    if (action === "worker") {
      check(
        ["piece", "daily", "salary"].includes(p.basis),
        "Choose payment basis.",
      );
      const worker = this.add("worker", {
        name: text(p.name, "Worker name"),
        phone: String(p.phone || "").slice(0, 50),
        basis: p.basis,
        rate: cents(p.rate),
        active: true,
      });
      const amount = cents(p.advance || 0);
      if (amount)
        this.event("advance", worker.id, dt(), {
          amount,
          note: "Opening advance",
        });
      return worker;
    }
    if (action === "worker-revise") {
      const current = this.get("worker", p.id), basis = text(p.basis, "Payment basis");
      check(["piece", "daily", "salary"].includes(basis), "Choose payment basis.");
      const next = { ...current, name: text(p.name, "Worker name"), phone: String(p.phone || "").slice(0, 50), basis, rate: cents(p.rate), active: flag(p.active, active(current)) };
      this.db.prepare("UPDATE records SET data=? WHERE id=?").run(JSON.stringify(next), next.id);
      this.revision("worker", next.id, current, next, p.reason);
      return next;
    }
    if (action === "assignment") {
      const po = this.get("po", p.poId),
        worker = this.get("worker", p.workerId);
      check(active(worker), "Inactive workers cannot receive new assignments.");
      check(active(this.get("department", p.departmentId)), "Inactive departments cannot receive new assignments.");
      check(
        po.departments.includes(p.departmentId),
        "Department is not required by this PO.",
      );
      check(dt() >= po.date, "Assignment date cannot be before the PO date.");
      check(["pair", "pcs"].includes(p.unit), "Choose pairs or pcs.");
      const factor =
          p.unit === "pair" ? 1 : num(p.factor, "Pieces per pair", 1, true),
        quantity = num(p.quantity, "Quantity", 1, true);
      const stat = this.poStats(po).departments.find(
        (d) => d.id === p.departmentId,
      );
      check(
        round(stat.assigned + quantity / factor) <= po.quantity,
        "Assignment exceeds the remaining PO quantity for this department.",
      );
      return this.add("assignment", {
        poId: po.id,
        departmentId: p.departmentId,
        workerId: worker.id,
        quantity,
        unit: p.unit,
        factor,
        rate: worker.basis === "piece" ? cents(p.rate) : 0,
        basis: worker.basis,
        date: dt(),
      });
    }
    if (action === "cancel-assignment") {
      const a = this.get("assignment", text(p.id, "Assignment"));
      check(!a.cancelled, "This assignment is already cancelled.");
      const received = this.received(a.id);
      check(received.accepted + received.rejected === 0, "Assignments with received work cannot be cancelled.");
      const reason = text(p.reason, "Cancellation reason");
      const next = { ...a, cancelled: true, cancelledAt: today(), cancellationReason: reason };
      this.db.prepare("UPDATE records SET data=? WHERE id=?").run(JSON.stringify(next), next.id);
      this.event("cancellation", a.id, today(), { entity: "assignment", reason });
      return next;
    }
    if (action === "receipt") {
      const a = this.get("assignment", p.assignmentId),
        prev = this.received(a.id);
      check(!a.cancelled, "Cancelled assignments cannot receive work.");
      const accepted = num(p.accepted, "Accepted quantity", 0, true),
        rejected = num(p.rejected, "Rejected quantity", 0, true);
      check(accepted + rejected > 0, "Enter received quantities.");
      check(
        accepted + rejected <= a.quantity - prev.accepted,
        "Receipt exceeds outstanding work. Rejected work stays outstanding for rework.",
      );
      check(dt() >= a.date, "Receipt cannot be before assignment.");
      const receipt = this.event("receipt", a.id, dt(), {
        accepted,
        rejected,
        note: String(p.note || "").slice(0, 500),
      });
      if (accepted && a.basis === "piece")
        this.event("earning", a.workerId, dt(), {
          amount: Math.round(accepted * a.rate),
          assignmentId: a.id,
          receiptId: receipt.id,
          note: `${accepted} ${a.unit} · ${this.get("po", a.poId).number} · ${this.get("department", a.departmentId).name}`,
        });
      return receipt;
    }
    if (action === "scan-receipt") {
      const code = text(p.code, "QR scan");
      const parts = code.split("|");
      check(parts.length === 2 && parts[0] === "SNX1" && /^[0-9a-f-]{20,50}$/i.test(parts[1]), "Invalid SoleNexa work QR code.");
      const assignment = this.get("assignment", parts[1]);
      const received = this.received(assignment.id);
      const outstanding = assignment.quantity - received.accepted - received.rejected;
      check(!assignment.cancelled, "This assignment is cancelled.");
      check(outstanding > 0, "This work assignment is already fully received.");
      const receipt = this.event("receipt", assignment.id, dt(), { accepted: outstanding, rejected: 0, note: "Completed by QR scanner." });
      if (assignment.basis === "piece")
        this.event("earning", assignment.workerId, dt(), {
          amount: Math.round(outstanding * assignment.rate),
          assignmentId: assignment.id,
          receiptId: receipt.id,
          note: `${outstanding} ${assignment.unit} · ${this.get("po", assignment.poId).number} · ${this.get("department", assignment.departmentId).name}`,
        });
      return receipt;
    }
    if (action === "stock") {
      const material = this.get("material", p.materialId);
      check(active(material), "Inactive materials cannot be used in new stock movements.");
      check(
        ["receive", "issue", "return", "scrap", "adjust-up", "adjust-down"].includes(
          p.type,
        ),
        "Invalid stock movement.",
      );
      const qty = num(p.quantity, "Quantity", 0.000001),
        quantity = ["issue", "scrap", "adjust-down"].includes(p.type) ? -qty : qty;
      const dtValue = dt();
      this.checkInventoryPeriodOpen(dtValue);
      const selectedReservation = p.reservationId ? this.get("reservation", p.reservationId) : null;
      const lotCode = String(p.lotCode || selectedReservation?.lotCode || "").trim().slice(0, 80);
      const lot = lotCode ? (p.type === "receive" ? this.ensureLot(material.id, lotCode, dtValue) : this.all("lot").find((item) => item.materialId === material.id && item.code.toLowerCase() === lotCode.toLowerCase())) : null;
      check(!lotCode || lot, "Choose an existing lot for this movement, or receive the lot first.");
      const bin = this.get("bin", p.binId || this.defaultBin().id);
      check(active(bin) && active(this.get("warehouse", bin.warehouseId)), "Choose an active warehouse bin.");
      const defaultBinId = this.defaultBin().id;
      let poId = null;
      let supplierReceiveId = null;
      if (p.type === "receive" && p.supplierId) {
        const supplier = this.get("supplier", p.supplierId);
        check(active(supplier), "Inactive suppliers cannot be used for stock receipts.");
        const amount = safeMoney(Math.round(qty * material.rate));
        supplierReceiveId = this.event("supplier-receive", supplier.id, dtValue, {
          supplierId: supplier.id,
          materialId: material.id,
          quantity: qty,
          rate: material.rate,
          amount,
          note: text(p.note, "Reference / reason"),
        }).id;
      }
      if (["issue", "return"].includes(p.type)) {
        poId = this.get("po", p.poId).id;
      }
      if (p.type === "scrap") {
        poId = this.get("po", p.poId).id;
      }
      if (p.type === "return") {
        const issued = -this.events(p.materialId)
          .filter((e) => e.kind === "stock" && e.data.poId === poId)
          .reduce((s, e) => s + e.data.quantity, 0);
        check(
          qty <= issued,
          "Return exceeds the net quantity issued to this PO.",
        );
      }
      if (p.type === "issue") {
        const reservation = selectedReservation;
        if (reservation) {
          check(reservation.materialId === material.id && reservation.binId === bin.id && (reservation.lotCode || "") === (lot?.code || ""), "Selected reservation does not match this material, bin or lot.");
          const remaining = this.reservationRemaining(reservation);
          check(qty <= remaining, "Issue quantity exceeds the selected reservation balance.");
        }
        const reserved = this.reservedAtBin(material.id, bin.id, lot?.code || null, reservation?.id || null);
        check(qty <= this.stockAtBinLot(material.id, bin.id, dtValue, lot?.code || null) - reserved, "Not enough stock available; reserved stock must be issued against its reservation.");
      }
      if (p.type === "scrap") {
        check(qty <= this.stockAtBinLot(material.id, bin.id, dtValue, lot?.code || null) - this.reservedAtBin(material.id, bin.id, lot?.code || null), "Not enough free stock to scrap; reserved stock is protected.");
      }
      const future = [
          ...this.events(p.materialId)
            .filter((e) => e.kind === "stock" && (e.data.binId || defaultBinId) === bin.id && (!lotCode || (e.data.lotCode || "") === lot.code))
            .map((e) => ({ date: e.date, quantity: e.data.quantity })),
          { date: dtValue, quantity },
        ].sort((a, b) => a.date.localeCompare(b.date));
      let running = 0;
      for (const e of future) {
        running = round(running + e.quantity);
        check(
          running >= 0,
          "Not enough stock on this date. Receive stock first.",
        );
      }
      const movement = this.event("stock", p.materialId, dtValue, {
        quantity,
        type: p.type,
        poId,
        binId: bin.id,
        warehouseId: bin.warehouseId,
        lotId: lot?.id || null,
        lotCode: lot?.code || null,
        ...(p.reservationId ? { reservationId: p.reservationId } : {}),
        ...(supplierReceiveId ? { supplierReceiveId } : {}),
        note: text(p.note, "Reference / reason"),
      });
      if (p.type === "issue" && p.reservationId) this.event("reservation-consume", p.reservationId, dtValue, { quantity: qty, stockEventId: movement.id, note: "Consumed by stock issue." });
      return movement;
    }
    if (action === "finished" || action === "dispatch") {
      const po = this.get("po", p.poId),
        s = this.poStats(po),
        quantity = num(p.quantity, "Pairs", 1, true);
      const variant = p.variantKey ? s.variantStats.find((v) => v.key === p.variantKey) : null;
      check(!p.variantKey || variant, "Choose a valid size and colour variant.");
      if (variant) check(quantity <= (action === "finished" ? variant.planned - variant.finished : variant.available), `${action === "finished" ? "Finished receipt" : "Dispatch"} exceeds this size and colour variant balance.`);
      check(dt() >= po.date, "Date cannot be before PO.");
      check(
        quantity <= (action === "finished" ? s.ready : s.available),
        action === "finished"
          ? "All required departments must have accepted output before finished stock is received."
          : "Not enough finished stock.",
      );
      const latest = this.events(po.id)
        .filter((e) => ["finished", "dispatch"].includes(e.kind))
        .at(-1);
      if (latest)
        check(
          dt() >= latest.date,
          "Use a date on or after the last finished-stock movement.",
        );
      if (action === "finished") {
        const receipts = this.all("assignment")
          .filter((a) => a.poId === po.id)
          .flatMap((a) => this.events(a.id));
        check(
          receipts.every((e) => e.date <= dt()),
          "Finished receipt cannot precede department receipts.",
        );
      }
      return this.event(action, po.id, dt(), {
        quantity,
        ...(variant ? { variantKey: variant.key, variantSize: variant.size, variantColor: variant.color } : {}),
        note: text(p.note, "Reference / note"),
      });
    }
    if (action === "advance") {
      check(active(this.get("worker", p.workerId)), "Inactive workers cannot receive new advances.");
      this.get("worker", p.workerId);
      const amount = cents(p.amount);
      check(amount > 0, "Advance must be positive.");
      return this.event("advance", p.workerId, dt(), {
        amount,
        note: text(p.note, "Note"),
      });
    }
    if (action === "attendance") {
      const w = this.get("worker", p.workerId);
      check(active(w), "Inactive workers cannot receive new payroll entries.");
      check(w.basis === "daily", "Attendance earnings apply to daily workers.");
      check(
        !this.events(w.id).some(
          (e) => e.kind === "attendance" && e.date === dt() && !e.data.correctedBy && !e.data.reversalOf,
        ),
        "Attendance already posted for this date.",
      );
      const days = num(p.days, "Day units", 0);
      check([0, 0.5, 1].includes(days), "Use 0 (absent), 0.5 or 1 day.");
      return this.event("attendance", w.id, dt(), {
        days,
        rate: w.rate,
        amount: Math.round(days * w.rate),
        note: `${days} day attendance`,
      });
    }
    if (action === "salary") {
      const w = this.get("worker", p.workerId);
      check(active(w), "Inactive workers cannot receive new payroll entries.");
      check(w.basis === "salary", "Select a salaried worker.");
      check(/^\d{4}-\d{2}$/.test(p.month), "Choose a salary month.");
      date(p.month + "-01");
      const [y, m] = p.month.split("-").map(Number),
        last = new Date(y, m, 0),
        end = `${p.month}-${String(last.getDate()).padStart(2, "0")}`;
      check(
        end <= today(),
        "Salary accrual is available after the month ends.",
      );
      check(
        !this.events(w.id).some(
          (e) => e.kind === "salary" && e.data.month === p.month,
        ),
        "Salary already posted for this month.",
      );
      return this.event("salary", w.id, end, {
        month: p.month,
        amount: w.rate,
        note: `Full-month salary ${p.month}`,
      });
    }
    if (action === "settlement") {
      check(active(this.get("worker", p.workerId)), "Inactive workers cannot receive settlements.");
      this.get("worker", p.workerId);
      const d = dt(),
        b = this.balance(p.workerId, d),
        amount = cents(p.amount),
        recovery = cents(p.recovery || 0);
      check(amount + recovery > 0, "Enter payment or advance recovery.");
      check(recovery <= b.advanceDue, "Recovery exceeds outstanding advance.");
      check(
        amount + recovery <= b.payable,
        "Payment plus recovery exceeds unpaid earnings as of this date.",
      );
      const latest = this.events(p.workerId)
        .filter((e) => e.kind === "settlement")
        .at(-1);
      if (latest)
        check(d >= latest.date, "Cannot backdate before the last settlement.");
      // Protect later transactions when a backdated recovery is entered.
      const all = this.balance(p.workerId);
      check(
        recovery <= all.advanceDue && amount + recovery <= all.payable,
        "Later payments already used this balance.",
      );
      return this.event("settlement", p.workerId, d, {
        amount,
        recovery,
        note: text(p.note, "Settlement note"),
        earnedToDate: b.earned,
      });
    }
    if (action === "correct-event") return this.correctEvent(text(p.eventId, "Event"), p.reason);
    throw new Error("Unknown operation.");
  }
  exportCsv(kind) {
    const csvCell = (value) => {
      let textValue = String(value ?? "");
      if (/^[=+\-@]/.test(textValue)) textValue = "'" + textValue;
      return `"${textValue.replaceAll('"', '""')}"`;
    };
    const rows = {
      materials: [["ID", "Name", "Unit", "Rate (cents)", "Reorder", "Active"], ...this.all("material").map((m) => [m.id, m.name, m.unit, m.rate, m.reorder, active(m)])],
      workers: [["ID", "Name", "Basis", "Rate (cents)", "Active"], ...this.all("worker").map((w) => [w.id, w.name, w.basis, w.rate, active(w)])],
      departments: [["ID", "Name", "Active"], ...this.all("department").map((d) => [d.id, d.name, active(d)])],
      stock: [["Date", "Material ID", "Type", "Quantity", "PO ID", "Reference"], ...this.events().filter((e) => e.kind === "stock").map((e) => [e.date, e.target, e.data.type, e.data.quantity, e.data.poId, e.data.note])],
      pos: [["PO", "Article", "SKU", "Quantity (pairs)", "Date", "Due", "Estimated total (cents)"], ...this.all("po").map((p) => [p.number, p.article, p.sku, p.quantity, p.date, p.due, p.costSnapshot.total * p.quantity])],
      suppliers: [["ID", "Name", "Phone", "Address", "Active", "Payable (cents)"], ...this.all("supplier").map((s) => [s.id, s.name, s.phone, s.address, active(s), this.supplierBalance(s.id).payable])],
      purchases: [["Purchase", "Supplier", "Invoice", "Date", "Material", "Quantity", "Unit", "Rate (cents)", "Line total (cents)"], ...this.all("purchase").flatMap((p) => p.lines.map((l) => [p.number, p.supplierName, p.invoice, p.date, l.name, l.quantity, l.unit, l.rate, l.amount]))],
      "supplier-ledgers": [["Date", "Supplier ID", "Entry", "Amount (cents)", "Purchase ID", "Material ID", "Note"], ...this.events().filter((e) => ["purchase-return", "supplier-payment", "supplier-receive"].includes(e.kind)).map((e) => [e.date, e.target, e.kind, e.data.amount, e.data.purchaseId || "", e.data.materialId || "", e.data.note])],
      ledgers: [["Date", "Worker ID", "Entry", "Amount (cents)", "Recovery (cents)", "Note"], ...this.all("worker").flatMap((w) => this.events(w.id).filter((e) => ["earning", "attendance", "salary", "advance", "settlement"].includes(e.kind)).map((e) => [e.date, w.id, e.kind, e.data.amount, e.data.recovery || 0, e.data.note]))],
    }[kind];
    check(rows, "Choose a supported CSV export.");
    return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }
  backup(destination) {
    check(
      path.resolve(destination) !== path.resolve(this.filename),
      "Choose a different backup file.",
    );
    check(!fs.existsSync(destination), "Choose a new backup filename.");
    this.db.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`);
    return destination;
  }
  static validateBackup(filename) {
    const d = new DatabaseSync(filename, { readOnly: true });
    try {
      check(
        d.prepare("PRAGMA integrity_check").get().integrity_check === "ok",
        "Backup integrity check failed.",
      );
      check(
        [1, CURRENT_SCHEMA_VERSION].includes(d.prepare("PRAGMA user_version").get().user_version),
        "Unsupported backup version.",
      );
      for (const table of ["records", "events"])
        check(
          d
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            )
            .get(table),
          "This is not a SoleNexa backup.",
        );
      check(
        d.prepare("PRAGMA foreign_key_check").all().length === 0,
        "Backup has broken references.",
      );
      for (const r of d.prepare("SELECT kind,data FROM records").all())
        check(
          kinds.includes(r.kind) && (() => { const value = JSON.parse(r.data); return value && typeof value === "object" && !Array.isArray(value); })(),
          "Invalid backup record.",
        );
      const version = d.prepare("PRAGMA user_version").get().user_version;
      if (version >= 2) {
        check(
          d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get(),
          "Backup migration ledger is missing.",
        );
        const migrations = d.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((row) => row.version);
        check(migrations.includes(1) && migrations.includes(2), "Backup migration ledger is incomplete.");
      }
      for (const e of d.prepare("SELECT kind,target,date,data FROM events").all()) {
        check(
          typeof e.kind === "string" && e.kind.length > 0 &&
            /^\d{4}-\d{2}-\d{2}$/.test(e.date) && !Number.isNaN(Date.parse(e.date)),
          "Invalid backup event header.",
        );
        const value = JSON.parse(e.data);
        check(value && typeof value === "object" && !Array.isArray(value), "Invalid backup event payload.");
      }
      check(
        d.prepare("SELECT COUNT(*) AS count FROM records WHERE kind='settings'").get().count <= 1,
        "Backup contains multiple settings records.",
      );
    } finally {
      d.close();
    }
  }
}
module.exports = { Store, today, CURRENT_SCHEMA_VERSION };
