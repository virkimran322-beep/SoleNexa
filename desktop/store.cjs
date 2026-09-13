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

class Store {
  constructor(filename) {
    this.filename = filename;
    if (filename !== ":memory:")
      fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    const version = this.db.prepare("PRAGMA user_version").get().user_version;
    if (version > 1) {
      this.db.close();
      throw Error("This database needs a newer version of SoleNexa.");
    }
    this.db
      .exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, kind TEXT NOT NULL, target TEXT NOT NULL REFERENCES records(id), date TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), created TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS event_target ON events(target,date);
      CREATE UNIQUE INDEX IF NOT EXISTS attendance_once ON events(target,date) WHERE kind='attendance';
      CREATE UNIQUE INDEX IF NOT EXISTS salary_once ON events(target,json_extract(data,'$.month')) WHERE kind='salary';
      PRAGMA user_version=1;`);
    if (!this.all("department").length)
      for (const name of ["Upper", "Bottom", "Insole", "Heel", "Finishing"])
        this.add("department", { name });
    if (!this.all("settings").length)
      this.add("settings", {
        key: "app-config",
        activated: false,
        setupComplete: false,
        theme: "dark",
        companyName: "",
        companyLogo: "",
        contact: "",
        address: "",
        owner: "",
      });
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
    if (data.amount !== undefined) safeMoney(data.amount);
    if (data.recovery !== undefined) safeMoney(data.recovery);
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
  stock(id) {
    return round(
      this.events(id)
        .filter((e) => e.kind === "stock")
        .reduce((s, e) => s + e.data.quantity, 0),
    );
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
    const tasks = this.all("assignment").filter((a) => a.poId === po.id);
    const departments = po.departments.map((id) => {
      const list = tasks.filter((a) => a.departmentId === id);
      return {
        id,
        name: this.get("department", id).name,
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
    return {
      departments,
      finished,
      dispatched,
      available: finished - dispatched,
      ready:
        Math.floor(Math.min(...departments.map((d) => d.accepted))) - finished,
    };
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
        "Activation key is incorrect. Contact IQ Links support.",
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
      };
      this.db
        .prepare("UPDATE records SET data=? WHERE id=?")
        .run(JSON.stringify(c), c.id);
      return c;
    }
    if (action === "create-user") {
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
          "viewer",
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
        theme: p.theme === "light" ? "light" : "dark",
      };
      this.db
        .prepare("UPDATE records SET data=? WHERE id=?")
        .run(JSON.stringify(c), c.id);
      return c;
    }
    if (action === "department") {
      const name = text(p.name, "Department name");
      check(
        !this.all("department").some(
          (d) => d.name.toLowerCase() === name.toLowerCase(),
        ),
        "Department already exists.",
      );
      return this.add("department", { name });
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
      });
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
      const labour = cents(p.labour),
        overhead = cents(p.overhead);
      return this.add("cost", {
        name: text(p.name, "Article / cost sheet name"),
        sku: text(p.sku, "Article code"),
        lines,
        labour,
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
      departments.forEach((id) => this.get("department", id));
      check(date(p.due) >= dt(), "Due date cannot be before the PO date.");
      return this.add("po", {
        number: `PO-${String(this.all("po").length + 1).padStart(4, "0")}`,
        costId: cost.id,
        article: cost.name,
        sku: cost.sku,
        costSnapshot: cost,
        quantity: num(p.quantity, "Pairs", 1, true),
        departments,
        date: dt(),
        due: date(p.due),
        notes: String(p.notes || "").slice(0, 1000),
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
      });
      const amount = cents(p.advance || 0);
      if (amount)
        this.event("advance", worker.id, dt(), {
          amount,
          note: "Opening advance",
        });
      return worker;
    }
    if (action === "assignment") {
      const po = this.get("po", p.poId),
        worker = this.get("worker", p.workerId);
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
    if (action === "receipt") {
      const a = this.get("assignment", p.assignmentId),
        prev = this.received(a.id);
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
    if (action === "stock") {
      this.get("material", p.materialId);
      check(
        ["receive", "issue", "return", "adjust-up", "adjust-down"].includes(
          p.type,
        ),
        "Invalid stock movement.",
      );
      const qty = num(p.quantity, "Quantity", 0.000001),
        quantity = ["issue", "adjust-down"].includes(p.type) ? -qty : qty;
      let poId = null;
      if (["issue", "return"].includes(p.type)) {
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
      const dtValue = dt(),
        future = [
          ...this.events(p.materialId)
            .filter((e) => e.kind === "stock")
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
      return this.event("stock", p.materialId, dtValue, {
        quantity,
        type: p.type,
        poId,
        note: text(p.note, "Reference / reason"),
      });
    }
    if (action === "finished" || action === "dispatch") {
      const po = this.get("po", p.poId),
        s = this.poStats(po),
        quantity = num(p.quantity, "Pairs", 1, true);
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
        note: text(p.note, "Reference / note"),
      });
    }
    if (action === "advance") {
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
      check(w.basis === "daily", "Attendance earnings apply to daily workers.");
      check(
        !this.events(w.id).some(
          (e) => e.kind === "attendance" && e.date === dt(),
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
    throw new Error("Unknown operation.");
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
        d.prepare("PRAGMA user_version").get().user_version === 1,
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
          kinds.includes(r.kind) && typeof JSON.parse(r.data) === "object",
          "Invalid backup record.",
        );
    } finally {
      d.close();
    }
  }
}
module.exports = { Store, today };
