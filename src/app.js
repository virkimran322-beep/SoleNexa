"use strict";
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const money = (n) =>
  "Rs " +
  ((n || 0) / 100).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const qty = (n) =>
  Number(n || 0).toLocaleString("en-PK", { maximumFractionDigits: 3 });
let state,
  route = "dashboard",
  selected = "",
  query = "",
  workerFilter = "",
  from = "",
  to = "",
  paper = "80",
  printFormat = "thermal",
  shareReportText = "",
  scanBuffer = "",
  scanTimer,
  pages = { stock: 0, ledger: 0 };
const icons = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  materials: "M12 3l9 5-9 5-9-5z M3 8v9l9 5 9-5V8 M12 13v9",
  costs: "M6 3h12v18H6z M9 7h6 M9 11h1 M14 11h1 M9 15h1 M14 15h1",
  orders: "M8 4H5v17h14V4h-3 M8 3h8v4H8z M8 12h8 M8 16h5",
  production: "M3 21V9l6 4V8l6 4V3h5v18z M7 17h1 M12 17h1 M17 17h1",
  workers:
    "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a3 3 0 0 1 0 6 M22 21v-3a4 4 0 0 0-3-4",
  ledger: "M4 4h16v17H4z M8 4v17 M11 8h6 M11 12h6 M11 16h4",
  inventory: "M3 10l9-7 9 7v11H3z M8 21v-8h8v8 M8 17h8",
  suppliers: "M4 7h16v13H4z M8 7V5a4 4 0 0 1 8 0v2 M8 12h8",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
  arrow: "M4 12h16 M14 6l6 6-6 6",
};
const icon = (k) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[k] || icons.orders}"/></svg>`;
const labels = {
  dashboard: "Overview",
  materials: "Raw materials",
  costs: "Costing sheets",
  orders: "Production orders",
  production: "Work assignments",
  workers: "Workers & staff",
  ledger: "Labour accounts",
  inventory: "Finished inventory",
  suppliers: "Suppliers & purchases",
  profile: "Company profile",
  settings: "Settings & backup",
  access: "Users & security",
};
const find = (kind, id) => state[kind].find((x) => x.id === id);
const reservationRemaining = (r) => Math.max(0, Number(r.quantity || 0) - state.events.filter((e) => e.target === r.id && ["reservation-release", "reservation-consume"].includes(e.kind)).reduce((sum, e) => sum + Number(e.data.quantity || 0), 0));
const active = (record) => record && record.active !== false;
const btn = (name, action, id = "", primary = false) =>
  `<button type="button" ${primary ? 'class="primary"' : ""} data-action="${action}" data-id="${esc(id)}">${name}</button>`;
const badge = (s, c = "") => `<span class="badge ${c}">${esc(s)}</span>`;
const empty = (title, desc, action = "") =>
  `<div class="empty">${icon(route)}<h3>${title}</h3><p>${desc}</p>${action}</div>`;
const table = (heads, rows) =>
  `<div class="table-wrap"><table><thead><tr>${heads.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
const panel = (title, body, action = "") =>
  `<section class="panel"><div class="panel-head"><h2>${title}</h2>${action}</div>${body}</section>`;
const pageControls = (total, key) => {
  const count = Math.ceil(total / 50);
  return count > 1 ? `<div class="actions pagination" aria-label="Pagination">${btn("Previous", "page-prev", key)}<span>Page ${pages[key] + 1} of ${count}</span>${btn("Next", "page-next", key)}</div>` : "";
};
const metric = (title, value, note, k) =>
  `<div class="metric"><div class="label">${title}${icon(k)}</div><div class="value">${value}</div><small>${note}</small></div>`;
const input = (name, label, type = "text", value = "", extra = "") =>
  `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra} required></label>`;
const number = (name, label, value = 0, step = "0.01", min = 0) =>
  input(name, label, "number", value, `min="${min}" step="${step}"`);
const options = (items, fn = (x) => x.name) =>
  items
    .map((x) => `<option value="${esc(x.id)}">${esc(fn(x))}</option>`)
    .join("");
const select = (name, label, opts, value = "") =>
  `<label>${label}<select name="${name}" required>${opts.map ? opts.map((x) => `<option value="${esc(x[0])}" ${x[0] === value ? "selected" : ""}>${esc(x[1])}</option>`).join("") : opts}</select></label>`;
const dates = () =>
  input("date", "Date", "date", state.today, `max="${state.today}"`);
const note = (label = "Reference / note") => input("note", label);
const optionalReason = () => '<label class="full">Reason for change (optional)<textarea name="reason" rows="2" placeholder="Example: supplier rate changed"></textarea></label>';
const activeField = (checked) => `<label class="check full"><input type="checkbox" name="active" value="true" ${checked ? "checked" : ""}>Active for new transactions</label>`;
const reportFilters = () => `<div class="report-filters"><p class="muted">Optional report scope</p><div class="form-grid">${select("reportDepartment", "Department", [["", "All departments"], ...state.department.map((d) => [d.id, d.name])]).replace(" required", "")}${select("reportWorker", "Worker", [["", "All workers"], ...state.worker.map((w) => [w.id, w.name])]).replace(" required", "")}${select("reportPo", "Production order", [["", "All orders"], ...state.po.map((p) => [p.id, p.number + " · " + p.article])]).replace(" required", "")}${input("reportFrom", "From", "date", "").replace(" required", "")}${input("reportTo", "To", "date", "").replace(" required", "")}</div><small class="muted">Filters apply when you open a PDF report.</small></div>`;
async function call(action, payload = {}) {
  const r = window.sole
    ? await window.sole.call(action, payload)
    : await fetch("/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      }).then((r) => r.json());
  if (!r.ok) {
    if (r.error === "Factory PIN required." && !payload.__pinRetry && payload.pin === undefined) {
      const pin = await requestFactoryPin();
      return call(action, { ...payload, pin, __pinRetry: true });
    }
    if (/Session expired|Account changed|Licence required|Activation required:/.test(r.error)) { state=null; $('#modal')?.close(); boot(); }
    throw Error(r.error);
  }
  return r.data;
}
function requestFactoryPin() {
  return new Promise((resolve, reject) => {
    const dlg = document.createElement("dialog");
    dlg.innerHTML = '<form class="dialog-body pin-prompt"><h2>Confirm with factory PIN</h2><p class="subtitle">This change requires the 6-digit factory PIN.</p><div class="error" role="alert" tabindex="-1"></div><label>Factory PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required></label><div class="dialog-foot"><button type="button" data-cancel>Cancel</button><button class="primary" type="submit">Confirm</button></div></form>';
    document.body.appendChild(dlg); dlg.showModal();
    const finish = (fn, value) => { dlg.close(); dlg.remove(); fn(value); };
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish(reject, Error("Factory PIN confirmation cancelled.")); });
    dlg.querySelector("[data-cancel]").onclick = () => finish(reject, Error("Factory PIN confirmation cancelled."));
    dlg.querySelector("form").onsubmit = (e) => { e.preventDefault(); const pin=e.target.pin.value; if(!/^\d{6}$/.test(pin)) { const box=e.target.querySelector(".error"); box.textContent="Enter exactly 6 digits."; box.focus(); return; } finish(resolve, pin); };
    dlg.querySelector("input").focus();
  });
}
async function readCompanyLogo(file) {
  if (!file) return "";
  const raw = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  if (!raw.startsWith("data:image/")) throw Error("Choose a PNG, JPEG or WebP image.");
  try {
    const image = new Image();
    image.src = raw;
    await image.decode();
    const max = 1200;
    const scale = Math.min(1, max / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    return raw;
  }
}
function hideSplash() {
  setTimeout(() => $("#splash")?.classList.add("hidden"), 1800);
}
function gate(title, subtitle, fields, action, submit, after) {
  hideSplash();
  $("#sidebar").style.display = "none";
  $(".shell").style.display = "block";
  document.querySelectorAll(".shell header,.shell footer").forEach(el=>el.style.display="none");
  const root = $("#main");
  root.innerHTML = `<section class="gate"><img src="../iq-links-logo.png" alt="IQ Links" class="gate-logo"><p class="eyebrow">SOFTWARE POWERED BY IQ LINKS</p><h1>${title}</h1><p class="subtitle">${subtitle}</p><form class="gate-card"><div class="error" role="alert" tabindex="-1"></div>${fields}<button class="primary" type="submit">${submit}</button><small class="gate-help">Your records stay on this computer.</small></form></section>`;
  root.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector("button[type=submit]");
    b.disabled = true;
    try {
      let data = Object.fromEntries(new FormData(e.target));
      if (data.companyLogoFile !== undefined) {
        const f = e.target.querySelector("[name=companyLogoFile]").files[0];
        if (f) data.companyLogo = await readCompanyLogo(f);
        delete data.companyLogoFile;
      }
      await call(action, data);
      await after();
    } catch (err) {
      const box = e.target.querySelector(".error");
      box.textContent = err.message;
      box.focus();
    } finally {
      b.disabled = false;
    }
  };
}
function activationGate(status = {}) {
  const reason = status.licence?.reason || "This computer needs offline activation.";
  gate(
    "Activate SoleNexa",
    "Enter the IQ Links activation key and choose how many days this installation may run.",
    `<div class="notice full"><strong>Offline activation</strong><small>Every new laptop must be activated once. Factory records stay local on that computer.</small></div>`+
    input("key", "Activation key", "password", "", 'autocomplete="off" placeholder="Enter activation key"')+
    input("validityDays", "Validity days", "number", "", 'min="1" max="3660" step="1" placeholder="Example: 365"')+
    `<p class="hint full">${esc(reason)} Enter a new validity period after it expires.</p>`,
    "activate",
    "Activate installation",
    firstCompanyGate,
  );
}
function firstCompanyGate() {
  gate(
    "Set up your factory",
    "Add the factory identity that will appear on screens and printed slips.",
    input("companyName", "Factory name") +
      input("owner", "Owner / responsible person") +
      input(
        "contact",
        "Phone / contact",
        "tel",
        "",
        'autocomplete="tel"',
      ).replace(" required", "") +
      input(
        "address",
        "Factory address",
        "text",
        "",
        'autocomplete="street-address"',
      ).replace(" required", "") +
      input("pin", "Factory PIN (6 digits)", "password", "", 'inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="new-password"') +
      input("pinConfirm", "Confirm factory PIN", "password", "", 'inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="new-password"') +
      `<label>Factory logo (optional)<input name="companyLogoFile" type="file" accept="image/png,image/jpeg,image/webp"></label><p class="hint full">This PIN is required when SoleNexa starts again and before sensitive factory changes.</p>`,
    "setup-company",
    "Continue to user account",
    ownerGate,
  );
}
function pinSetupGate() {
  gate("Protect your factory", "This older installation has no factory PIN yet. Set one before continuing.", input("pin", "Factory PIN (6 digits)", "password", "", 'inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="new-password"') + input("pinConfirm", "Confirm factory PIN", "password", "", 'inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="new-password"'), "set-pin", "Set factory PIN", async () => loginGate(await call("status")));
}
async function openAfterUnlock(status) {
  if (status.rememberedUser) {
    try {
      await call("resume-login");
      $("#sidebar").style.display = "";
      $(".shell").style.display = "";
      document.querySelectorAll(".shell header,.shell footer").forEach((el) => (el.style.display = ""));
      await refresh();
      return;
    } catch (e) { /* Fall back to normal credentials when the remembered account changed. */ }
  }
  loginGate(status);
}
function pinGate(status) {
  gate("Enter factory PIN", `${status.companyName || "Factory workspace"} · Unlock this app.`, input("pin", "Factory PIN (6 digits)", "password", "", 'inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="current-password"'), "unlock-pin", "Unlock app", async () => openAfterUnlock(await call("status")));
}
function ownerGate() {
  gate(
    "Create owner account",
    "This first account controls factory setup and user access.",
    input(
      "username",
      "Owner username",
      "text",
      "owner",
      'autocomplete="username"',
    ) +
      select("role", "Role", [["owner", "Owner"]]) +
      input(
        "password",
        "Password",
        "password",
        "",
        'autocomplete="new-password"',
      ) +
      `<p class="hint">Use at least 8 characters.</p>`,
    "create-user",
    "Create owner account",
    async () => loginGate(await call("status")),
  );
}
function loginGate(status) {
  gate(
    "Sign in to SoleNexa",
    `${status.companyName || "Factory workspace"} · Enter your local user account.`,
    input("username", "Username", "text", "", 'autocomplete="username"') +
      input(
        "password",
        "Password",
        "password",
        "",
        'autocomplete="current-password"',
      ),
    "login",
    "Sign in",
    async () => {
      const s = await call("status");
      if (!s.setupComplete) {
        ownerGate();
        return;
      }
      $("#sidebar").style.display = "";
      $(".shell").style.display = "";
      document.querySelectorAll(".shell header,.shell footer").forEach(el=>el.style.display="");
      await refresh();
    },
  );
}
async function boot() {
  try {
    const s = await call("status");
    document.body.classList.add("light");
    if (!s.activated) activationGate(s);
    else if (!s.setupComplete && !s.companyName) firstCompanyGate();
    else if (!s.setupComplete) ownerGate();
    else if (!s.pinConfigured) pinSetupGate();
    else if (!s.pinUnlocked) pinGate(s);
    else loginGate(s);
  } catch (e) {
    $("#main").innerHTML =
      `<div class="error">Could not start SoleNexa: ${esc(e.message)}</div>`;
  }
}
function toast(message, tone = "success") {
  $("#toast").textContent = message;
  clearTimeout(toast.timer);
  $("#toast").className = tone === "error" ? "error-toast" : "";
  toast.timer = setTimeout(() => { $("#toast").textContent = ""; $("#toast").className = ""; }, 5500);
}
async function refresh() {
  state = await call("snapshot");
  resetIdleTimer();
  if (!to) to = state.today;
  if (!from) {
    const d = new Date(state.today + "T12:00:00");
    d.setDate(d.getDate() - ((d.getDay() + 0) % 7));
    from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  render();
}
function progress(n, total) {
  return `<div class="progress"><progress value="${Math.min(n, total)}" max="${total || 1}" aria-label="${qty(n)} of ${qty(total)} pairs"></progress></div>`;
}
function heading(title, desc, actions = "") {
  return `<div class="page-head"><div><h1>${title}</h1><div class="subtitle">${desc}</div></div><div class="actions">${actions}</div></div>`;
}
function variantSummary(po) {
  return po.variants?.length ? po.variants.map((v) => `${v.size} · ${v.color}: ${qty(v.quantity)} pairs`).join(" · ") : "No structured size / colour split";
}
const code39Patterns = { "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn","4":"nnnwwnnnw","5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw","8":"wnnwnnwnn","9":"nnwwnnwnn","A":"wnnnnwnnw","B":"nnwnnwnnw","C":"wnwnnwnnn","D":"nnnnwwnnw","E":"wnnnwwnnn","F":"nnwnwwnnn","G":"nnnnnwwnw","H":"wnnnnwwnn","I":"nnwnnwwnn","J":"nnnnwwwnn","K":"wnnnnnnww","L":"nnwnnnnww","M":"wnwnnnnwn","N":"nnnnwnnww","O":"wnnnwnnwn","P":"nnwnwnnwn","Q":"nnnnnnwww","R":"wnnnnnwwn","S":"nnwnnnwwn","T":"nnnnwnwwn","U":"wwnnnnnnw","V":"nwwnnnnnw","W":"wwwnnnnnn","X":"nwnnwnnnw","Y":"wwnnwnnnn","Z":"nwwnwnnnn","-":"nwnnnnwnw",".":"wwnnnnwnn"," ":"nwwnnnwnn","$":"nwnwnwnnn","/":"nwnwnnnwn","+":"nwnnnwnwn","%":"nnnwnwnwn","*":"nwnnwnwnn" };
function code39Svg(value) {
  const clean = String(value || "").toUpperCase().replace(/[^0-9A-Z .\-$/+%]/g, "-").slice(0, 32), encoded = `*${clean}*`;
  let x = 8, bars = "";
  for (const ch of encoded) {
    const pattern = code39Patterns[ch] || code39Patterns["-"];
    [...pattern].forEach((width, i) => { const w = width === "w" ? 3 : 1; if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="54"/>`; x += w; });
    x += 1;
  }
  return `<svg class="barcode" viewBox="0 0 ${x + 8} 70" role="img" aria-label="Barcode ${esc(clean)}"><g fill="currentColor">${bars}</g><text x="${(x + 8) / 2}" y="68" text-anchor="middle" font-size="10" fill="currentColor">${esc(clean)}</text></svg>`;
}
function assignmentQr(value) {
  try {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    return qr.createSvgTag(4, 0).replace("<svg", '<svg class="assignment-qr" role="img" aria-label="Scan to complete work"');
  } catch {
    return `<code class="qr-fallback">${esc(value)}</code>`;
  }
}
function searchbar(label) {
  return `<div class="toolbar"><label class="search">Search ${label}<input id="search" type="search" value="${esc(query)}" placeholder="Type a name or reference…"></label><span class="muted">Newest records first</span></div>`;
}
const filtered = (items) =>
  items
    .filter((x) =>
      JSON.stringify(x).toLowerCase().includes(query.toLowerCase()),
    )
    .toReversed();
function orderRows(items) {
  if (route === "dashboard") {
    return table(
      ["PO / article", "Pairs", "Finished", "Status"],
      items.map((p) => {
        const s = state.poStats[p.id];
        return `<tr><td><a href="#orders/${p.id}">${esc(p.number)}</a><small>${esc(p.article)} · ${esc(variantSummary(p))}</small></td><td>${qty(p.quantity)}</td><td>${qty(s.finished)}${progress(s.finished, p.quantity)}</td><td>${s.finished >= p.quantity ? badge("Complete", "green") : badge(p.due < state.today ? "Overdue" : "In progress", p.due < state.today ? "amber" : "blue")}</td></tr>`;
      }),
    );
  }
  return table(
    ["PO / article", "Quantity", "Finished", "Due date", "Status", ""],
    items.map((p) => {
      const s = state.poStats[p.id];
      return `<tr><td><a href="#orders/${p.id}">${esc(p.number)}</a><small>${esc(p.article)} · ${esc(p.sku)} · ${esc(variantSummary(p))}</small></td><td>${qty(p.quantity)} pairs</td><td>${qty(s.finished)} / ${qty(p.quantity)}${progress(s.finished, p.quantity)}</td><td>${esc(p.due)}</td><td>${s.finished >= p.quantity ? badge("Completed", "green") : badge(p.due < state.today ? "Overdue" : "In production", p.due < state.today ? "amber" : "blue")}</td><td><a href="#orders/${p.id}">Open →</a></td></tr>`;
    }),
  );
}
function dashboard() {
  const open = state.po.filter(
      (p) => state.poStats[p.id].finished < p.quantity,
    ),
    finished = Object.values(state.poStats).reduce(
      (s, p) => s + p.available,
      0,
    ),
    payable = Object.values(state.balances).reduce((s, b) => s + b.payable, 0),
    low = state.material.filter((m) => state.stocks[m.id] <= m.reorder);
  return (
    heading(
      "Your factory, at a glance",
      "Production, people and materials. All in one workspace.",
      btn("+ Create production order", "po", "", true),
    ) +
    `<section class="dashboard-hero"><div><span class="hero-kicker">OFFLINE FACTORY CONTROL CENTER</span><h2>Welcome back, ${esc(state.currentUser?.username || "Team")}</h2><p>Keep production, labour and finished stock moving with confidence.</p></div><div class="hero-meta"><span class="hero-date">${esc(state.today)}</span>${btn("Open production", "orders", "", true)}</div></section><div class="metrics">${metric("Open production orders", open.length, `${qty(open.reduce((s, p) => s + p.quantity - state.poStats[p.id].finished, 0))} pairs to finish`, "orders")}${metric("Finished stock", qty(finished), "Pairs available for dispatch", "inventory")}${metric("Labour payable", money(payable), `${state.worker.length} workers & staff`, "workers")}${metric("Low-stock materials", low.length, "At or below reorder level", "materials")}</div>${dashboardAlerts()}${dashboardQuickActions()}<div class="grid"><div>${panel("Production overview", state.po.length ? orderRows(state.po.toReversed().slice(0, 6)) : empty("Your first production run starts here", "Add materials and a cost sheet, then create your first PO.", btn("Add raw material", "material", "", true)), '<a href="#orders">All orders →</a>')}${panel(
      "Recent factory activity",
      state.events.length
        ? `<div class="panel-body">${state.events
            .toReversed()
            .slice(0, 5)
            .map(
              (e) =>
                `<div class="activity">${icon(["earning", "advance", "settlement", "salary", "attendance"].includes(e.kind) ? "ledger" : "production")}<div><strong>${esc(e.kind.replaceAll("-", " "))}</strong> · ${esc(find("worker", e.target)?.name || find("material", e.target)?.name || find("po", e.target)?.number || "Work receipt")}<small>${esc(e.data.note || e.data.reason || e.data.type || "Recorded")} · ${e.date}</small></div></div>`,
            )
            .join("")}</div>`
        : empty(
            "A clear record of every step",
            "Stock movements, completed work and account entries will appear here.",
          ),
    )}</div><div>${panel(
      "Factory setup",
      `<div class="panel-body">${[
        [
          "Add your raw materials",
          "Set units, rates and reorder levels.",
          state.material.length,
          "materials",
        ],
        [
          "Create an article cost sheet",
          "Know your cost for one pair.",
          state.cost.length,
          "costs",
        ],
        [
          "Add your team",
          "Daily, piece-rate and salary workers.",
          state.worker.length,
          "workers",
        ],
        [
          "Start a production order",
          "Allocate work by department.",
          state.po.length,
          "orders",
        ],
      ]
        .map(
          (s, i) =>
            `<div class="step ${s[2] ? "done" : ""}"><span class="number">${s[2] ? "✓" : i + 1}</span><div><a href="#${s[3]}">${s[0]}</a><p>${s[1]}</p></div></div>`,
        )
        .join("")}</div>`,
    )}${offlineSafetyCard()}${panel("Reports & exports", `<div class="panel-body"><p>Export factory activity, staff accounts and stock as a PDF report.</p>${reportFilters()}<div class="actions">${btn("Daily report PDF", "report-daily", "", true)}${btn("Weekly report PDF", "report-weekly")}${btn("Monthly report PDF", "report-monthly")}</div></div>`)}${panel("Saturday settlement", `<div class="panel-body"><p>Review accepted work and daily attendance before paying your team.</p><p class="muted">Advance recoveries are shown separately from cash payments.</p><a href="#ledger">Open labour accounts →</a></div>`)}</div></div>`
  );
}
function materials() {
  const items = filtered(state.material);
  return (
    heading(
      "Raw materials",
      "Track each material in its own unit. Stock changes are recorded separately.",
      btn("Stock movement", "stock") +
        btn("+ Add material", "material", "", true),
    ) +
    searchbar("materials") +
    panel(
      "Material register",
      items.length
        ? table(
            [
              "Material",
              "Unit",
              "Cost / unit",
              "On hand",
              "Reorder at",
              "Status",
              "Actions",
            ],
            items.map(
              (m) =>
                `<tr><td><strong>${esc(m.name)}</strong></td><td>${esc(m.unit)}</td><td>${money(m.rate)}</td><td>${qty(state.stocks[m.id])} ${esc(m.unit)}</td><td>${qty(m.reorder)}</td><td>${m.active === false ? badge("Inactive", "amber") : state.stocks[m.id] <= m.reorder ? badge("Low stock", "amber") : badge("In stock", "green")}</td><td>${can("material-revise") ? btn("Edit", "material-revise", m.id) + btn("History", "material-history", m.id) : ""}</td></tr>`,
            ),
          )
        : empty(
            "No matching materials",
            "Add leather, soles, adhesive, thread or other materials.",
          ),
    ) +
    panel(
      "Stock movements",
      table(
        ["Date", "Material", "Movement", "Quantity", "Reference", "Correction"],
        state.events
          .filter((e) => e.kind === "stock")
          .toReversed()
          .slice(pages.stock * 50, pages.stock * 50 + 50)
          .map(
            (e) =>
              `<tr><td>${e.date}</td><td>${esc(find("material", e.target)?.name)}</td><td>${esc(e.data.type)}</td><td>${qty(e.data.quantity)} ${esc(find("material", e.target)?.unit)}</td><td>${esc(e.data.note)}<small>${esc(find("po", e.data.poId)?.number || "")}</small></td><td>${correctionControl(e)}</td></tr>`,
          ),
      ),
      pageControls(state.events.filter((e) => e.kind === "stock").length, "stock"),
    )
  );
}
function costs() {
  if (selected) {
    const c = find("cost", selected);
    if (!c) return empty("Cost sheet not found", "Return to costing sheets.");
    return (
      `<a class="breadcrumb" href="#costs">← Costing sheets</a>` +
      heading(
        esc(c.name),
        `${esc(c.sku)} · Cost per pair · ${c.date}`,
        btn("Print cost sheet", "print-cost", c.id),
      ) +
      panel(
        "Material consumption per pair",
        table(
          ["Material", "Qty", "Unit rate", "Wastage", "Amount"],
          c.lines.map(
            (l) =>
              `<tr><td>${esc(l.name)}</td><td>${qty(l.quantity)} ${esc(l.unit)}</td><td>${money(l.rate)}</td><td>${l.wastage}%</td><td>${money(l.amount)}</td></tr>`,
          ),
        ),
      ) +
      `<div class="metrics">${metric("Materials", money(c.total - c.labour - c.overhead), "Including wastage", "materials")}${metric("Labour allowance", money(c.labour), "Per pair estimate", "workers")}${metric("Overhead", money(c.overhead), "Per pair estimate", "costs")}${metric("Cost per pair", money(c.total), "Saved cost snapshot", "costs")}</div>`
    );
  }
  return (
    heading(
      "Costing sheets",
      "Build a repeatable material recipe and know your cost per pair.",
      btn("+ New cost sheet", "cost", "", true),
    ) +
    searchbar("cost sheets") +
    panel(
      "Article cost library",
      filtered(state.cost).length
        ? table(
            [
              "Article / code",
              "Materials",
              "Labour / pair",
              "Overhead / pair",
              "Total / pair",
              "",
            ],
            filtered(state.cost).map(
              (c) =>
                `<tr><td><strong>${esc(c.name)}</strong><small>${esc(c.sku)}</small></td><td>${c.lines.length} materials</td><td>${money(c.labour)}</td><td>${money(c.overhead)}</td><td><strong>${money(c.total)}</strong></td><td><a href="#costs/${c.id}">View recipe →</a></td></tr>`,
            ),
          )
        : empty(
            "No cost sheets yet",
            "Add raw materials first, then define consumption for one pair.",
          ),
    )
  );
}
function assignments(poId) {
  const items = state.assignment
    .filter((a) => !poId || a.poId === poId)
    .toReversed();
  return items.length
    ? table(
        [
          "Worker / department",
          "PO",
          "Assigned",
          "Accepted",
          "Rate / unit",
          "",
        ],
        items.map((a) => {
          const accepted = state.events
            .filter((e) => e.kind === "receipt" && e.target === a.id)
            .reduce((s, e) => s + e.data.accepted, 0);
          return `<tr><td><strong>${esc(find("worker", a.workerId)?.name)}</strong><small>${esc(find("department", a.departmentId)?.name)}</small></td><td>${esc(find("po", a.poId)?.number)}</td><td>${qty(a.quantity)} ${a.unit}</td><td>${qty(accepted)} / ${qty(a.quantity)}</td><td>${a.basis === "piece" ? money(a.rate) : esc(a.basis)}</td><td><div class="actions">${accepted < a.quantity ? btn("Receive", "receipt", a.id) : badge("Complete", "green")}${btn("Slip", "print-assignment", a.id)}${!a.cancelled && can("cancel-assignment") ? btn("Cancel", "cancel-assignment", a.id) : a.cancelled ? badge("Cancelled", "amber") : ""}${state.events.filter((e) => e.kind === "receipt" && e.target === a.id).map(correctionControl).join("")}</div></td></tr>`;
        }),
      )
    : empty(
        "No work assigned yet",
        "Split PO work across workers, one department at a time.",
      );
}
function orders() {
  if (selected) {
    const p = find("po", selected);
    if (!p) return empty("Order not found", "Return to production orders.");
    const s = state.poStats[p.id];
    return (
      '<a class="breadcrumb" href="#orders">← Production orders</a>' +
      heading(
        `${esc(p.number)} <span class="muted">/</span> ${esc(p.article)}`,
        `${esc(p.sku)} · Created ${p.date} · Due ${p.due}`,
        btn("+ Assign work", "assignment", p.id, true),
      ) +
      `<div class="metrics">${metric("Order quantity", qty(p.quantity), "Pairs", "orders")}${metric("Cost / pair", money(p.costSnapshot.total), "At order creation", "costs")}${metric("Estimated PO cost", money(p.costSnapshot.total * p.quantity), "Materials + labour + overhead", "costs")}${metric("Finished", qty(s.finished), `${qty(s.available)} pairs on hand`, "inventory")}</div>${poCostPanel(p)}<div class="grid">${panel("Department progress", `<div class="panel-body">${s.departments.map((d) => `<div class="department"><div><strong>${esc(d.name)}</strong><small>${qty(d.assigned)} pairs assigned · ${qty(p.quantity - d.assigned)} unassigned</small></div><div>${qty(d.accepted)} / ${qty(p.quantity)} accepted${progress(d.accepted, p.quantity)}</div></div>`).join("")}</div>`)}${panel("Size / colour plan", `<div class="panel-body">${p.variants?.length ? table(["Size", "Colour", "Pairs"], p.variants.map((v) => `<tr><td>${esc(v.size)}</td><td>${esc(v.color)}</td><td>${qty(v.quantity)}</td></tr>`)) : '<p class="muted">No structured size / colour breakdown was added.</p>'}</div>`)}${panel("Order notes", `<div class="panel-body"><p>${esc(p.notes || "No notes added.")}</p><small>Quantities are pairs. Pcs assignments use an explicit pieces-per-pair conversion.</small></div>`)}</div>` +
      panel("Work assignments", assignments(p.id))
    );
  }
  return (
    heading(
      "Production orders",
      "Plan pair quantities, due dates and the departments each article needs.",
      btn("+ Create production order", "po", "", true),
    ) +
    searchbar("orders") +
    panel(
      "Production register",
      filtered(state.po).length
        ? orderRows(filtered(state.po))
        : empty(
            "No matching production orders",
            "Create a cost sheet, then open a PO to start production.",
          ),
    )
  );
}
function workers() {
  return (
    heading(
      "Workers & staff",
      "Piece-rate, daily and monthly salary records with separate advance accounts.",
      btn("+ Add worker", "worker", "", true),
    ) +
    searchbar("workers") +
    panel(
      "Team register",
      filtered(state.worker).length
        ? table(
            [
              "Worker",
              "Payment basis",
              "Default rate",
              "Advance balance",
              "Unpaid earnings",
              "",
              "Actions",
            ],
            filtered(state.worker).map(
              (w) =>
                `<tr><td><strong>${esc(w.name)}</strong><small>${w.active === false ? badge("Inactive", "amber") : ""}${esc(w.phone || "No phone recorded")}</small></td><td>${badge(w.basis)}</td><td>${money(w.rate)}<small>per ${w.basis === "salary" ? "month" : w.basis === "daily" ? "day" : "assignment unit"}</small></td><td>${money(state.balances[w.id].advanceDue)}</td><td>${money(state.balances[w.id].payable)}</td><td><a href="#ledger/${w.id}">Account →</a></td><td>${can("worker-revise") ? btn("Edit", "worker-revise", w.id) + btn("History", "worker-history", w.id) : ""}</td></tr>`,
            ),
          )
        : empty(
            "Add the people behind each pair",
            "Create your workers, payment rates and opening advances.",
          ),
    )
  );
}
function ledgerData() {
  const id = selected || workerFilter || state.worker[0]?.id;
  const w = find("worker", id);
  if (!w) return null;
  const all = state.events.filter((e) => e.target === w.id),
    rows = all.filter((e) => e.date >= from && e.date <= to);
  const balance = (until) => {
    let earned = 0,
      paid = 0,
      adv = 0,
      rec = 0;
    all
      .filter((e) => e.date <= until)
      .forEach((e) => {
        if (["earning", "salary", "attendance"].includes(e.kind))
          earned += e.data.amount;
        if (e.kind === "advance") adv += e.data.amount;
        if (e.kind === "settlement") {
          paid += e.data.amount;
          rec += e.data.recovery;
        }
      });
    return {
      earned,
      paid,
      adv,
      rec,
      payable: earned - paid - rec,
      advanceDue: adv - rec,
    };
  };
  return {
    w,
    rows: rows.slice(pages.ledger * 50, pages.ledger * 50 + 50),
    total: rows.length,
    closing: balance(to),
    current: state.balances[w.id],
    opening: all
      .filter((e) => e.date < from)
      .reduce(
        (s, e) =>
          s +
          (["earning", "salary", "attendance"].includes(e.kind)
            ? e.data.amount
            : e.kind === "settlement"
              ? -e.data.amount - e.data.recovery
              : 0),
        0,
      ),
  };
}
function ledger() {
  const l = ledgerData();
  return (
    heading(
      "Labour accounts",
      "Review the week, recover advances and record the actual payment.",
      btn("Attendance", "attendance") +
        btn("Post salary", "salary") +
        btn("Give advance", "advance") +
        btn("Settle account", "settlement", "", true),
    ) +
    (l
      ? `<div class="toolbar">${select("workerFilter", "Worker", options(state.worker), l.w.id)}${input("from", "From", "date", from)}${input("to", "To", "date", to)}${btn("Apply dates", "filter-ledger")}${btn("Print ledger", "print-ledger")}</div><div class="notice">Weekly accounts: Sunday–Saturday. Salary accounts: calendar month. Piece earnings are based on accepted work.</div><div class="ledger-summary"><div><small>Opening unpaid earnings</small><strong>${money(l.opening)}</strong></div><div><small>Unpaid earnings as of ${esc(to)}</small><strong>${money(l.closing.payable)}</strong></div><div><small>Outstanding advance as of ${esc(to)}</small><strong>${money(l.closing.advanceDue)}</strong></div></div>` +
        panel(
          esc(l.w.name) + " · Account ledger",
          l.rows.length
            ? table(
                [
                  "Date",
                  "Entry",
                  "Details",
                  "Earned",
                  "Advance",
                  "Recovery",
                  "Cash paid",
                  "Correction",
                ],
                l.rows.map(
                  (e) =>
                    `<tr><td>${e.date}</td><td>${badge(e.kind)}</td><td>${esc(e.data.note || e.data.correctionReason || "Corrected entry")}</td><td>${["earning", "attendance", "salary"].includes(e.kind) ? money(e.data.amount) : "—"}</td><td>${e.kind === "advance" ? money(e.data.amount) : "—"}</td><td>${e.kind === "settlement" ? money(e.data.recovery) : "—"}</td><td>${e.kind === "settlement" ? money(e.data.amount) : "—"}</td><td>${e.kind === "settlement" ? btn("Slip", "print-settlement", e.id) : ""}${correctionControl(e)}</td></tr>`,
                )
              ) + pageControls(l.total, "ledger")
            : empty(
                "No entries in this period",
                "Choose another date range or record completed work, attendance or an advance.",
              ),
        )
      : empty(
          "No worker accounts yet",
          "Add your team before recording their accounts.",
          btn("Add worker", "worker", "", true),
        ))
  );
}
function inventory() {
  return (
    heading(
      "Finished inventory",
      "Receive completed pairs into stock, then record shop or customer dispatches. Ready quantity is limited by the least-complete required department.",
      btn("Add warehouse", "warehouse") + btn("Add bin", "bin") + btn("Reserve stock", "reservation") + btn("Transfer stock", "transfer") + btn("Start stock count", "stock-count") +
        btn("Dispatch pairs", "dispatch") + btn("Receive finished pairs", "finished", "", true),
    ) +
    panel(
      "Stock by production order",
      state.po.length
        ? table(
            [
              "PO / article",
              "Ordered",
              "Ready to receive",
              "Received",
              "Dispatched",
              "On hand",
            ],
            state.po.toReversed().map((p) => {
              const s = state.poStats[p.id];
              return `<tr><td><a href="#orders/${p.id}">${p.number}</a><small>${esc(p.article)}</small></td><td>${qty(p.quantity)}</td><td>${qty(s.ready)} pairs</td><td>${qty(s.finished)}</td><td>${qty(s.dispatched)}</td><td>${badge(qty(s.available) + " pairs", s.available ? "green" : "")}</td></tr>`;
            }),
          )
        : empty(
            "No finished stock yet",
            "Complete the required departments on a PO, then receive finished pairs.",
          ),
    ) +
    panel(
      "Dispatch & receipt history",
      table(
        ["Date", "PO", "Movement", "Lot", "Pairs", "Reference"],
        state.events
          .filter((e) => ["finished", "dispatch"].includes(e.kind))
          .toReversed()
          .map(
            (e) =>
              `<tr><td>${e.date}</td><td>${esc(find("po", e.target)?.number)}</td><td>${e.kind}</td><td>${esc(e.data.lotCode || "Untracked")}</td><td>${qty(e.data.quantity)}</td><td>${esc(e.data.note)}</td></tr>`,
          ),
      ),
    ) +
    panel(
      "Warehouse stock counts",
      `<div class="panel-body"><p class="hint">Each stock count sheet can contain several material/bin/lot lines. Submit it for review, then an Owner or Manager can approve all variances together. Approval creates audited stock adjustments; original movements remain unchanged.</p>${state["stock-count"].length ? table(["Count","Material","Lot","Bin","System","Counted","Variance","Status","Action"], state["stock-count"].toReversed().map((c) => `<tr><td>${esc(c.number)}<small>${esc(c.date)}</small></td><td>${esc(c.materialName)}${c.lines?.length > 1 ? `<small>+ ${c.lines.length - 1} more line(s)</small>` : ""}</td><td>${esc(c.lotCode || "Untracked")}</td><td>${esc(c.binName)}</td><td>${qty(c.expected)}</td><td>${qty(c.counted)}</td><td>${badge((c.variance >= 0 ? "+" : "") + qty(c.variance), c.variance === 0 ? "green" : "amber")}</td><td>${badge(c.status, c.status === "approved" ? "green" : c.status === "submitted" ? "amber" : "")}</td><td>${c.status === "draft" && can("stock-count-submit") ? btn("Submit", "stock-count-submit", c.id) : c.status === "submitted" && can("stock-count-approve") ? btn("Approve all", "stock-count-approve", c.id, true) + btn("Reject", "stock-count-reject", c.id) : c.rejectionReason ? esc(c.rejectionReason) : "—"}</td></tr>`)) : '<p class="muted">No stock counts recorded yet.</p>'}</div>`,
    ) +
    panel(
      "Warehouse and bin register",
      `<div class="panel-body">${table(["Warehouse","Bin","Status"], state.bin.map((b) => `<tr><td>${esc(state.warehouse.find((w) => w.id === b.warehouseId)?.name || "—")}</td><td><strong>${esc(b.code)}</strong><small>${esc(b.name)}</small></td><td>${badge(active(b) ? "Active" : "Inactive", active(b) ? "green" : "amber")}</td></tr>`))}</div>`,
    )
    + panel(
      "Stock reservations",
      `<div class="panel-body"><p class="hint">Reserve available raw stock for a planned issue. Reserved quantity is not available to other issues until it is consumed or released.</p>${(state.reservation || []).length ? table(["Reservation","Material","Lot","Bin","Reserved","Remaining","Status","Action"], state.reservation.toReversed().map((r) => { const remaining = reservationRemaining(r); return `<tr><td><strong>${esc(r.number)}</strong><small>${esc(r.date)}</small></td><td>${esc(r.materialName)}</td><td>${esc(r.lotCode || "Untracked")}</td><td>${esc(r.binName)}</td><td>${qty(r.quantity)}</td><td>${qty(remaining)}</td><td>${badge(remaining ? "Active" : "Consumed", remaining ? "amber" : "green")}</td><td>${remaining && can("reservation-release") ? btn("Release", "reservation-release", r.id) : "—"}</td></tr>`; })) : '<p class="muted">No stock reservations recorded yet.</p>'}</div>`,
    )
    + panel(
      "Warehouse transfers",
      `<div class="panel-body"><p class="hint">Transfers move stock between active bins in one transaction. Reserved quantity cannot be transferred until it is released or issued.</p>${(state.transfer || []).length ? table(["Transfer","Material","Lot","From","To","Quantity","Status"], state.transfer.toReversed().map((t) => `<tr><td><strong>${esc(t.number)}</strong><small>${esc(t.date)}</small></td><td>${esc(t.materialName)}</td><td>${esc(t.lotCode || "Untracked")}</td><td>${esc(t.sourceBinName)}</td><td>${esc(t.destinationBinName)}</td><td>${qty(t.quantity)}</td><td>${badge(t.status, "green")}</td></tr>`)) : '<p class="muted">No warehouse transfers recorded yet.</p>'}</div>`,
    )
    + panel(
      "Size / colour stock",
      state.po.some((p) => p.variants?.length)
        ? table(["PO", "Size", "Colour", "Planned", "Finished", "Dispatched", "On hand", "Label"], state.po.flatMap((p) => (state.poStats[p.id].variantStats || []).map((v) => `<tr><td>${esc(p.number)}</td><td>${esc(v.size)}</td><td>${esc(v.color)}</td><td>${qty(v.planned)}</td><td>${qty(v.finished)}</td><td>${qty(v.dispatched)}</td><td>${badge(qty(v.available) + " pairs", v.available ? "green" : "")}</td><td>${btn("Preview label", "print-label", `${p.id}|${v.key}`)}</td></tr>`)))
        : '<p class="muted">New production orders can optionally create independent size / colour stock bins.</p>',
    )
  );
}
const securedActions=['company-profile','material','material-revise','cost','po','worker','worker-revise','assignment','receipt','stock','finished','dispatch','department','department-revise','supplier','supplier-revise','purchase','purchase-return','supplier-payment','reservation','reservation-release','transfer','advance','attendance','salary','settlement','correct-event','cancel-assignment','backup','restore','delete-all-data'];
const can=a=>state?.permissions?.includes('*') || state?.permissions?.includes(a);
const correctionControl = (e) => {
  if (!can("correct-event") || !["stock", "receipt", "attendance", "settlement", "purchase-return", "supplier-payment", "supplier-receive"].includes(e.kind)) return "";
  return e.data.correctedBy ? badge("Corrected", "amber") : btn("Correct", "correct-event", e.id);
};
function correctionRegister() {
  const rows = state.events.filter((e) => e.kind === "correction").toReversed();
  return rows.length ? table(["Date", "Original entry", "Reason", "Linked event"], rows.map((e) => `<tr><td>${e.date}</td><td>${esc(e.data.originalKind)} · ${esc(e.data.originalEventId.slice(0, 8).toUpperCase())}</td><td>${esc(e.data.reason)}</td><td>${esc(e.id.slice(0, 8).toUpperCase())}</td></tr>`)) : '<p class="muted">No audited corrections recorded.</p>';
}
function visibleRoutes(){
 const r=state?.currentUser?.role;
 if(r==='owner') return Object.keys(labels);
 if(r==='manager') return ['dashboard','materials','costs','orders','production','workers','ledger','inventory','suppliers'];
 if(r==='supervisor') return ['dashboard','orders','production'];
 if(r==='storekeeper') return ['dashboard','materials','inventory','suppliers'];
 if(r==='accountant') return ['dashboard','workers','ledger','suppliers'];
 return ['dashboard'];
}
function workerHome(){
 const w=state.myWork;
 if(!w)return heading('Welcome, '+esc(state.currentUser.username),'Ask the owner to link your login to your labour profile.')+empty('No profile linked','Your assignments and account will appear here after linking.');
 return heading('My work · '+esc(w.name),'Your assigned work and account, read only.')+
 '<div class="metrics">'+metric('Unpaid earnings',money(w.balance.payable),'Current balance','ledger')+metric('Advance remaining',money(w.balance.advanceDue),'Recovery recorded separately','ledger')+metric('Assignments',w.assignments.length,'All work issued to you','production')+'</div>'+
 panel('My assignments',table(['Date / PO','Article / department','Assigned','Accepted','Rate'],w.assignments.map(a=>'<tr><td>'+esc(a.date)+'<small>'+esc(a.po)+'</small></td><td>'+esc(a.article)+'<small>'+esc(a.department)+'</small></td><td>'+qty(a.quantity)+' '+esc(a.unit)+'</td><td>'+qty(a.accepted)+'</td><td>'+(a.basis==='piece'?money(a.rate)+' / '+esc(a.unit):esc(a.basis))+'</td></tr>')))+
 panel('My account history',table(['Date','Entry','Amount','Advance recovery'],w.entries.toReversed().map(e=>'<tr><td>'+esc(e.date)+'</td><td>'+esc(e.kind)+'</td><td>'+money(e.amount)+'</td><td>'+money(e.recovery)+'</td></tr>')));
}
function accessPage(){return heading('Users & security','Manage factory access and review the latest 200 security and activity events.',btn('+ Add user','user-new','',true))+panel('Access register','<div id="access-content" class="panel-body" aria-live="polite">Loading access records…</div>')+panel('Correction register','<div class="panel-body">'+correctionRegister()+'</div>');}
async function loadAccess(){
 try {
 const data=await call('access');
 if(!$('#access-content')) return;
 $('#access-content').innerHTML=table(['Username','Role','Status','Actions'],data.users.map(u=>'<tr><td>'+esc(u.username)+'</td><td>'+esc(u.role)+'</td><td>'+badge(u.active?'Active':'Disabled',u.active?'green':'')+'</td><td>'+(u.role==='worker'?btn(u.workerId?'Change profile':'Link labour profile','user-link',u.id):'')+btn('Reset password','user-reset',u.id)+(u.id!==state.currentUser.id?btn(u.active?'Disable':'Enable',u.active?'user-disable':'user-enable',u.id):'')+'</td></tr>'))+'<h3>Activity & login history</h3>'+table(['Time','User','Action','Target','Result'],data.audit.map(a=>'<tr><td>'+esc(new Date(a.at).toLocaleString())+'</td><td>'+esc(a.actor)+'</td><td>'+esc(a.action)+'</td><td>'+esc(a.target)+'</td><td>'+esc(a.outcome)+'</td></tr>'));
 }catch(e){toast(e.message);}
}
function settings() {
  return (
    heading(
      "Settings & backup",
      "Factory structure, print format and local data recovery.",
    ) +
    (state.licence ? panel('IQ Links activation', '<div class="panel-body"><p><strong>Offline local activation</strong></p><p>Validity: '+esc(state.licence.validityDays || '')+' days · Expires: '+esc(new Date(state.licence.expiresAt).toLocaleDateString())+'</p>'+btn('Set activation period','licence-renew')+'</div>') : '')+
    `<div class="setting">${panel("Factory profile", `<div class="panel-body"><p><strong>${esc(state.config.companyName || "Factory workspace")}</strong><br>${esc(state.config.owner || "")}<br>${esc(state.config.contact || "")}<br>${esc(state.config.address || "")}</p>${can("company-profile") ? btn("Edit factory profile", "company-profile", "", true) : ""}<p class="hint">Changes apply to future screens and print documents. Historical records keep their original snapshots.</p></div>`)}${panel("Inventory valuation policy", `<div class="panel-body"><p>${badge(state.config.inventoryValuation === "unconfigured" ? "Accountant approval required" : state.config.inventoryValuation, state.config.inventoryValuation === "unconfigured" ? "amber" : "green")}</p><p class="hint">Landed cost is captured on each purchase. Weighted average, FIFO or another valuation method must be selected with the factory accountant before inventory accounting reports are enabled.</p></div>`)}${panel("Offline application", `<div class="panel-body"><p>SoleNexa stores factory records locally on this computer and works without internet.</p></div>`)}${panel("Production departments", `<div class="panel-body"><div class="checks">${state.department.map((d) => `<span class="tag-with-action">${badge(d.name)}${d.active === false ? badge("Inactive", "amber") : ""}${can("department-revise") ? btn("Edit", "department-revise", d.id) + btn("History", "department-history", d.id) : ""}</span>`).join("")}</div>${btn("+ Add department", "department")}<p class="hint">New departments can be selected on future POs. Existing POs keep their saved department names.</p></div>`)}${panel(
      "Thermal printing",
      `<div class="panel-body">${select(
        "paper",
        "Receipt paper width",
        [
          ["80", "80 mm thermal roll"],
          ["58", "58 mm thermal roll"],
        ],
        paper,
      )}<p class="hint">Choose the same paper size in your Windows printer driver. Slips open for review before printing.</p></div>`,
    )}${panel("Protect your factory records", `<div class="panel-body"><p>Automatic backups stay on this computer and keep the latest seven verified copies. A new copy is created at startup, after restore and shortly after posted changes. Also save a manual backup to USB regularly, especially after Saturday settlement.</p><div id="backup-health" class="backup-health" role="status" aria-live="polite">Checking backup health…</div>${btn("Export database backup", "backup")}${btn("Restore a backup", "restore")}${can("delete-all-data") ? btn("Delete all factory data permanently", "delete-all-data") : ""}<h3>CSV exports</h3><div class="actions">${btn("Materials CSV", "csv-materials")}${btn("Workers CSV", "csv-workers")}${btn("Stock CSV", "csv-stock")}${btn("POs CSV", "csv-pos")}${btn("Ledgers CSV", "csv-ledgers")}</div><p class="hint">Restoring asks for confirmation and first saves your current database as a recovery copy. Permanent deletion requires the factory PIN and exact typed confirmation.</p><div id="data-path" class="hint"></div></div>`)}${panel("Shopify · Online phase", `<div class="panel-body"><p>${badge("Not connected", "amber")}</p><p>The offline edition records factory output and dispatches locally. Live Shopify orders and inventory sync will be added in the online phase.</p><small>Use your Shopify SKU as the article code where possible.</small></div>`)}</div>`
  );
}
function profilePage() {
  const c = state.config || {};
  const logo = c.companyLogo
    ? `<img class="profile-logo" src="${esc(c.companyLogo)}" alt="${esc(c.companyName || "Company")} logo">`
    : `<span class="profile-logo-fallback">${esc((c.companyName || "SN").slice(0, 2).toUpperCase())}</span>`;
  return heading("Company profile", "Manage the factory identity used across SoleNexa, reports and printed slips.", can("company-profile") ? btn("Edit company profile", "company-profile", "", true) : "") +
    `<div class="profile-layout"><section class="profile-identity panel"><div class="profile-cover"><span class="eyebrow">FACTORY IDENTITY</span>${logo}<span class="profile-status">Local company profile</span></div><div class="profile-details"><div class="profile-title"><div><h2>${esc(c.companyName || "Factory workspace")}</h2><p class="muted">${esc(c.owner || "Owner / responsible person")}</p></div>${badge("Offline", "green")}</div><div class="profile-contact-grid"><div class="profile-contact"><span class="profile-contact-label">CONTACT</span><strong>${esc(c.contact || "Not added")}</strong></div><div class="profile-contact"><span class="profile-contact-label">ADDRESS</span><strong>${esc(c.address || "Not added")}</strong></div></div></div></section>${panel("Where this information appears", `<div class="panel-body profile-checklist"><p><span class="profile-check-icon">01</span><span><strong>Dashboard and sidebar</strong><small>Company name and logo identify this local factory workspace.</small></span></p><p><span class="profile-check-icon">02</span><span><strong>Reports and print slips</strong><small>Factory name, address, contact and logo are used on future documents.</small></span></p><p><span class="profile-check-icon">03</span><span><strong>Historical records</strong><small>Old costing, PO and assignment snapshots remain unchanged.</small></span></p></div>`)}${panel("Profile checklist", `<div class="panel-body"><p class="hint">Complete these details once so your factory documents always look professional.</p><div class="profile-summary"><span class="${c.companyLogo ? "complete" : "missing"}">${c.companyLogo ? "✓" : "○"} Company logo</span><span class="${c.contact ? "complete" : "missing"}">${c.contact ? "✓" : "○"} Contact number</span><span class="${c.address ? "complete" : "missing"}">${c.address ? "✓" : "○"} Factory address</span><span class="${c.owner ? "complete" : "missing"}">${c.owner ? "✓" : "○"} Responsible person</span></div>${can("company-profile") ? btn("Update details", "company-profile") : ""}</div>`)}</div>`;
}
function render() {
  // Session transitions can clear state while an in-flight UI action is finishing.
  // Do not repaint a half-logged-out shell; boot() will render the next gate.
  if (!state) return;
  const parts = location.hash.slice(1).split("/");
  route = labels[parts[0]] ? parts[0] : "dashboard";
  if (!visibleRoutes().includes(route)) route="dashboard";
  selected = parts[1] || "";
  $("#crumb").textContent = labels[route];
  $("#date").textContent = state.today;
  const brand = $("#brand-logo");
  if (brand) brand.src = "../iq-links-logo.png";
  const companyName = state.config?.companyName || "Factory workspace";
  const workspace = $("#workspace-name");
  if (workspace) workspace.textContent = companyName;
  const workspaceLogo = $("#workspace-logo");
  if (workspaceLogo) {
    workspaceLogo.innerHTML = state.config?.companyLogo ? `<img src="${esc(state.config.companyLogo)}" alt="">` : esc(companyName.slice(0, 2).toUpperCase());
    workspaceLogo.classList.toggle("has-image", Boolean(state.config?.companyLogo));
  }
  $("#nav").innerHTML = Object.entries(labels).filter(([key])=>key !== "profile" && visibleRoutes().includes(key))
    .map(
      ([key, label], i) =>
        (i === 1
          ? '<div class="group">FACTORY OPERATIONS</div>'
          : i === 5
            ? '<div class="group">PEOPLE & ACCOUNTS</div>'
            : i === 8
              ? '<div class="group">WORKSPACE</div>'
              : "") +
        `<a href="#${key}" class="${key === route ? "active" : ""}" ${key === route ? 'aria-current="page"' : ""}>${icon(key)}${label}</a>`,
    )
    .join("");
  $("#main").innerHTML = {
    dashboard,
    materials,
    costs,
    orders,
    production: () =>
      heading(
        "Work assignments",
        "Issue work against a PO and receive accepted output.",
        btn("+ Assign work", "assignment", "", true),
      ) + panel("All assignments", assignments()),
    workers,
    ledger,
    inventory,
    suppliers,
    profile: profilePage,
    settings,
    access: accessPage,
  }[route]();
  if(route==="access") loadAccess();
  if(state.currentUser.role==="worker") $("#main").innerHTML=workerHome();
  const account=$("#account-controls");
  if(account) account.innerHTML=`<span>${esc(state.currentUser.username)} · ${esc(state.currentUser.role)}</span>${btn("Password","password-self")}${btn("Sign out","logout")}`;
  document.querySelectorAll("[data-action]").forEach(el=>{ const a=el.dataset.action; if(securedActions.includes(a) && !can(a)) el.hidden=true; });
  if (route === "ledger" && ledgerData()) {
    $("[name=workerFilter]").value = ledgerData().w.id;
    $("#main").insertAdjacentHTML(
      "beforeend",
      panel("Work issued in this period", workIssued(ledgerData().w.id)),
    );
  }
  if (!window.sole)
    $(".header-right .badge").textContent = "Test preview · separate data";
  if (route === "settings")
    call("info")
      .then((i) => {
        if ($("#data-path")) {
          $("#data-path").innerHTML = "Database location: " + esc(i.dbPath) + "<br>Automatic backups: " + esc(i.backupDir) + "<br>Safe diagnostics log: " + esc(i.logsDir);
          const h = i.backupHealth || {};
          const health = $("#backup-health");
          if (health) health.className = `backup-health ${h.healthy ? "healthy" : "attention"}`;
          if (health) health.innerHTML = h.healthy
            ? `<strong>Backup health: Verified</strong><span>${Number(h.count || 0)} automatic copies retained · Last verified ${esc(h.lastSuccessAt ? new Date(h.lastSuccessAt).toLocaleString("en-PK") : "not available")}</span>`
            : `<strong>Backup health: Attention required</strong><span>${esc(h.error || "Export a manual backup now.")}</span>`;
        }
      })
      .catch(() => {});
}
function showForm(title, fields, onSave, submit = "Save record") {
  const dlg = $("#modal");
  dlg.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${title}</h2>${btn("Close", "close")}</div><form class="dialog-body"><div class="error" role="alert" tabindex="-1"></div><div class="form-grid">${fields}</div><div class="dialog-foot">${btn("Cancel", "close")}<button class="primary" type="submit">${submit}</button></div></form>`;
  dlg.showModal();
  dlg.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.submitter || e.target.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(e.target));
      if (data.companyLogoFile !== undefined) {
        const file = e.target.querySelector("[name=companyLogoFile]").files[0];
        if (file) {
          data.companyLogo = await readCompanyLogo(file);
        }
        delete data.companyLogoFile;
      }
      await onSave(data);
      dlg.close();
      if(state) await refresh();
      toast("Record saved.");
    } catch (error) {
      const box = dlg.querySelector(".error");
      box.textContent = error.message;
      box.focus();
    } finally {
      button.disabled = false;
    }
  };
}
function showRevisionHistory(kind, id) {
  const record = find(kind, id), title = kind === "material" ? "Material history" : kind === "worker" ? "Worker history" : "Department history";
  const value = (key, v) => key === "rate" ? money(v) : Array.isArray(v) ? v.join(", ") : String(v ?? "—");
  const rows = state.events.filter((e) => e.kind === "revision" && e.target === id).toReversed();
  const body = rows.length ? rows.map((e) => `<article class="revision"><div class="revision-head"><strong>${esc(e.date)}</strong><span>${esc(e.data.reason)}</span></div><p>${e.data.changes.map((key) => `<strong>${esc(key)}:</strong> ${esc(value(key, e.data.before[key]))} → ${esc(value(key, e.data.after[key]))}`).join("<br>")}</p></article>`).join("") : '<div class="empty"><h3>No revisions yet</h3><p>This record is still using its original values.</p></div>';
  const dlg = $("#modal");
  dlg.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${title}: ${esc(record.name)}</h2>${btn("Close", "close")}</div><div class="dialog-body"><p class="hint">Every saved change keeps the earlier value for review. Existing cost sheets, assignments and ledgers keep their snapshots.</p>${body}<div class="dialog-foot">${btn("Close", "close")}</div></div>`;
  dlg.showModal();
}
function requireRecords(kind, msg) {
  if (!state[kind].length) throw Error(msg);
}
function workerSelect(basis) {
  return select(
    "workerId",
    "Worker",
    options(
      state.worker.filter((w) => active(w) && (!basis || w.basis === basis)),
      (w) => `${w.name} · ${w.basis}`,
    ),
  );
}
function materialSelect() {
  return select(
    "materialId",
    "Material",
    options(state.material.filter(active), (m) => `${m.name} (${m.unit})`),
  );
}
function binSelect() {
  return select(
    "binId",
    "Warehouse bin",
    state.bin.filter(active).map((b) => [b.id, `${state.warehouse.find((w) => w.id === b.warehouseId)?.name || "Warehouse"} · ${b.code} · ${b.name}`]),
  );
}
function transferBinSelect(name, label) {
  return select(name, label, state.bin.filter(active).map((b) => [b.id, `${state.warehouse.find((w) => w.id === b.warehouseId)?.name || "Warehouse"} · ${b.code} · ${b.name}`]));
}
function reservationSelect() {
  const rows = (state.reservation || []).filter((r) => reservationRemaining(r) > 0);
  return select("reservationId", "Reservation for this issue (optional)", [["", "No reservation"], ...rows.map((r) => [r.id, `${r.number} · ${r.materialName} · ${qty(reservationRemaining(r))} remaining`])]).replace(" required", "");
}
function warehouseSelect() {
  return select("warehouseId", "Warehouse", state.warehouse.filter(active).map((w) => [w.id, `${w.code} · ${w.name}`]));
}
function poSelect(id = "") {
  return select(
    "poId",
    "Production order",
    state.po.map((p) => [p.id, `${p.number} · ${p.article}`]),
    id,
  );
}
function departmentLabourFields() {
  return `<div class="full"><h3>Labour estimate by department (Rs / pair)</h3><div class="form-grid">${state.department.filter(active).map((d) => number(`departmentLabour_${d.id}`, d.name, 0)).join("")}</div><p class="hint">Daily and salary actuals remain separately reported because they are not assigned to one department.</p></div>`;
}
function poCostPanel(p) {
  const c = state.poCosts?.[p.id];
  if (!c) return "";
  const departmentRows = Object.entries(c.labourByDepartment.estimated).map(([id,line]) => {const actual=c.labourByDepartment.actual[id]?.amount || 0; return [esc(line.name),money(line.amount),money(actual),money(actual-line.amount)];});
  const costRows = [["Material", money(c.estimated.material), money(c.actual.material), money(c.variance.material)], ["Labour", money(c.estimated.labour), money(c.actual.labour), money(c.variance.labour)], ["Overhead", money(c.estimated.overhead), money(c.actual.overhead), money(c.variance.overhead)], ["Total", money(c.estimated.total), money(c.actual.total), money(c.variance.total)], ...departmentRows].map((row) => `<tr>${row.map((value) => `<td>${value}</td>`).join("")}</tr>`);
  return panel("Estimated vs actual costing", `<div class="panel-body"><p class="hint">Actual material uses saved PO rates. Actual labour includes accepted piece output. Factory-wide daily and salary wages in this period (${money(c.labourBreakdown.unallocated)}) are unallocated and excluded from this PO total. Actual overhead is not recorded yet; variance is provisional.</p><div class="table-wrap"><table><thead><tr><th>Component</th><th>Estimated</th><th>Actual</th><th>Variance</th></tr></thead><tbody>${costRows.join("")}</tbody></table></div></div>`);
}
function dashboardAlerts() {
  const overdue = state.po.filter((p) => state.poStats[p.id].finished < p.quantity && p.due < state.today);
  const low = state.material.filter((m) => state.stocks[m.id] <= m.reorder);
  const unpaid = Object.entries(state.balances).filter(([, b]) => b.payable > 0);
  const supplierDue = Object.values(state.supplierBalances || {}).filter((b) => b.payable > 0).length;
  const items = [...overdue.map((p) => `Overdue ${p.number}`), ...low.map((m) => `Low stock: ${m.name}`), ...(unpaid.length ? [`${unpaid.length} worker account(s) unpaid`] : []), ...(supplierDue ? [`${supplierDue} supplier account(s) payable`] : [])];
  return items.length ? panel("Needs attention", `<div class="panel-body"><ul class="alert-list">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>`) : "";
}
function purchaseMaterialSelect(purchaseId = "") {
  const purchase = find("purchase", purchaseId) || state.purchase[0];
  const lines = purchase?.lines || [];
  return select(
    "materialId",
    "Purchased material",
    lines.map((line) => [line.materialId, `${line.name} (${line.unit}) · ${qty(line.quantity)} received`]),
    lines[0]?.materialId || "",
  );
}
function poVariantSelect(po) {
  const variants = po?.variants || [];
  return select("variantKey", "Size / colour stock bin", [["", variants.length ? "Whole PO (legacy aggregate)" : "Whole PO"], ...variants.map((v) => [`${v.size}::${v.color}`, `${v.size} · ${v.color} · ${qty(v.quantity)} pairs`])]).replace(" required", "");
}
function suppliers() {
  const balances = state.supplierBalances || {};
  return heading(
    "Suppliers & purchases",
    "Receive material bills, manage purchase returns and track supplier payables offline.",
    btn("+ Add supplier", "supplier", "", true) + btn("Record purchase", "purchase") + btn("Supplier payment", "supplier-payment") + btn("Export CSV", "csv-suppliers"),
  ) + searchbar("suppliers and invoices") +
    panel("Supplier register", filtered(state.supplier).length ? table(["Supplier", "Contact", "Purchases", "Paid", "Payable", "Actions"], filtered(state.supplier).map((s) => {
      const b = balances[s.id] || { purchased: 0, paid: 0, payable: 0 };
      return `<tr><td><strong>${esc(s.name)}</strong><small>${s.active === false ? badge("Inactive", "amber") : esc(s.address || "No address recorded")}</small></td><td>${esc(s.phone || "—")}</td><td>${money(b.purchased)}</td><td>${money(b.paid)}</td><td>${badge(money(b.payable), b.payable > 0 ? "amber" : "green")}</td><td><div class="actions">${can("supplier-revise") ? btn("Edit", "supplier-revise", s.id) : ""}${can("supplier-payment") ? btn("Pay", "supplier-payment", s.id) : ""}${can("whatsapp-share") && whatsappPhone(s.phone) ? btn("WhatsApp", "supplier-whatsapp", s.id) : ""}</div></td></tr>`;
    })) : empty("No suppliers yet", "Add a supplier before recording material purchases.", btn("Add supplier", "supplier", "", true))) +
    panel("Purchase register", state.purchase.length ? table(["Purchase", "Supplier", "Invoice", "Date", "Items", "Subtotal", "Adjustments", "Total", "Actions"], filtered(state.purchase).map((p) => `<tr><td><strong>${esc(p.number)}</strong></td><td>${esc(p.supplierName)}</td><td>${esc(p.invoice)}</td><td>${p.date}</td><td>${p.lines.length}</td><td>${money(p.subtotal ?? p.total)}</td><td>${money((p.freight || 0) + (p.tax || 0) - (p.discount || 0))}</td><td>${money(p.total)}</td><td>${can("purchase-return") ? btn("Return", "purchase-return", p.id) : ""}</td></tr>`)) : empty("No purchases recorded", "Record a supplier bill to receive material into stock.")) + supplierActivity();
}
function supplierActivity() {
  const purchases = new Set(state.purchase.map((p) => p.id));
  const rows = state.events.filter((e) => e.kind === "supplier-payment" || e.kind === "supplier-receive" || (e.kind === "purchase-return" && purchases.has(e.data.purchaseId))).toReversed();
  return panel("Supplier account activity", rows.length ? table(["Date", "Entry", "Amount", "Reference", "Correction"], rows.map((e) => `<tr><td>${e.date}</td><td>${esc(e.kind)}</td><td>${money(e.data.amount)}</td><td>${esc(e.data.note || "—")}</td><td>${correctionControl(e)}</td></tr>`)) : '<p class="muted">No supplier payments or returns recorded.</p>');
}
function whatsappPhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = "92" + digits.slice(1);
  return /^\d{8,15}$/.test(digits) ? digits : "";
}
function supplierAccountMessage(supplier, balance) {
  const company = state.config?.companyName || "Factory workspace";
  return `Assalam o Alaikum ${supplier.name},\n\n*Supplier account summary*\n*Purchases:* ${money(balance.purchased)}\n*Paid:* ${money(balance.paid)}\n*Payable:* ${money(balance.payable)}\n\nIf you have any account-related issue, please contact ${company}.\n\nRegards,\n${company}`;
}
function dashboardQuickActions() {
  const actions = [
    ["Receive stock", "Add received material to your local stock register.", "stock"],
    ["New cost sheet", "Set material, labour and overhead for one pair.", "cost"],
    ["Add worker", "Create a piece, daily or monthly staff account.", "worker"],
    ["Create production order", "Start a PO and allocate its departments.", "po"],
  ].filter(([, , action]) => can(action));
  if (!actions.length) return "";
  return panel("Quick actions", `<div class="quick-actions">${actions.map(([title, desc, action]) => `<div class="quick-action"><div><strong>${title}</strong><small>${desc}</small></div>${btn("Open", action, "", action === "po")}</div>`).join("")}</div>`);
}
function offlineSafetyCard() {
  return panel("Offline data safety", `<div class="panel-body offline-card"><div class="offline-status"><span class="dot"></span><strong>Working offline on this computer</strong></div><p>Factory records, licence state and automatic backups stay in this Windows user profile. Internet is not required for daily production work.</p><a href="#settings">View backup and data locations →</a></div>`);
}
function costLine() {
  return `<div class="line-item">${materialSelect()}${number("quantity", "Qty / pair", 1, "0.000001", 0.000001)}${number("wastage", "Waste %", 0)}${btn("Remove", "remove-line")}</div>`;
}
function purchaseLine() {
  return `<div class="line-item purchase-line">${materialSelect()}${number("quantity", "Received quantity", 1, "0.000001", 0.000001)}${number("rate", "Rate / unit (Rs)", 0)}${input("lotCode", "Lot / batch (optional)", "text", "", 'maxlength="80"').replace(" required", "")}${btn("Remove", "remove-line")}</div>`;
}
function stockCountLine() {
  return `<div class="line-item stock-count-line">${materialSelect()}${binSelect()}${input("lotCode", "Lot / batch (optional)", "text", "", 'maxlength="80"').replace(" required", "")}${number("counted", "Physical quantity", 0, "0.000001", 0)}${btn("Remove", "remove-line")}</div>`;
}
function variantLine() {
  return `<div class="line-item variant-line">${input("variantSize", "Size", "text", "", 'maxlength="30"').replace(" required", "")}${input("variantColor", "Colour", "text", "", 'maxlength="50"').replace(" required", "")}${number("variantQuantity", "Pairs", 1, "1", 1).replace(" required", "")}${btn("Remove", "remove-line")}</div>`;
}
function form(action, id) {
  let fields = "",
    title = "",
    save = (p) => call(action, p);
  const wId = ledgerData()?.w.id;
  if (action === "company-profile") {
    const c = state.config;
    title = "Edit factory profile";
    fields = input("companyName", "Factory name", "text", c.companyName) + input("owner", "Owner / responsible person", "text", c.owner) + input("contact", "Phone / contact", "tel", c.contact || "", "").replace(" required", "") + '<label class="full">Factory address<textarea name="address" rows="3" maxlength="500">' + esc(c.address || "") + '</textarea></label>' + '<label>Replace factory logo (optional)<input name="companyLogoFile" type="file" accept="image/png,image/jpeg,image/webp"></label>' + '<label class="check full"><input type="checkbox" name="removeLogo" value="true">Remove current logo</label><p class="hint full">The updated identity appears on screens and future print/PDF documents.</p>';
    save = (p) => call(action, p);
  }

  if (action === "department") {
    title = "Add department";
    fields = input("name", "Department name");
  }
  if (action === "department-revise") {
    const d = find("department", id);
    title = "Edit department";
    fields = input("name", "Department name", "text", d.name) + activeField(d.active !== false) + optionalReason();
    save = (p) => call(action, { ...p, id });
  }
  if (action === "material") {
    title = "Add raw material";
    fields =
      input("name", "Material name") +
      select("unit", "Stock & costing unit", [
        ["kg", "Kilogram (kg)"],
        ["yard", "Yard"],
        ["pcs", "Pieces (pcs)"],
        ["meter", "Meter"],
        ["litre", "Litre"],
        ["pair", "Pair"],
      ]) +
      number("rate", "Cost per unit (Rs)") +
      number("reorder", "Low-stock threshold") +
      '<p class="hint full">Opening quantity is entered through Stock movement → Receive.</p>';
  }
  if (action === "material-revise") {
    const m = find("material", id);
    title = "Edit raw material";
    fields = input("name", "Material name", "text", m.name) + select("unit", "Stock & costing unit", [["kg", "Kilogram (kg)"], ["yard", "Yard"], ["pcs", "Pieces (pcs)"], ["meter", "Meter"], ["litre", "Litre"], ["pair", "Pair"]], m.unit) + number("rate", "Cost per unit (Rs)", m.rate / 100) + number("reorder", "Low-stock threshold", m.reorder) + activeField(m.active !== false) + optionalReason() + '<p class="hint full">New cost sheets use the revised rate. Saved cost sheets and stock history remain unchanged.</p>';
    save = (p) => call(action, { ...p, id });
  }
  if (action === "cost") {
    requireRecords(
      "material",
      "Add raw materials before creating a cost sheet.",
    );
    title = "Create cost sheet";
    fields =
      input("name", "Article name") +
      input("sku", "Article code / Shopify SKU") +
      '<div class="full"><h3>Material consumption for one pair</h3><div id="cost-lines">' +
      costLine() +
      "</div>" +
      btn("+ Add material line", "add-line") +
      "</div>" +
      departmentLabourFields() +
      number("overhead", "Overhead per pair (Rs)") +
      '<div class="total full"><span>Estimated cost per pair</span><strong id="cost-total">Rs 0.00</strong></div>';
    save = (p) => {
      p.departmentLabour = state.department.map((d) => ({ departmentId: d.id, amount: p[`departmentLabour_${d.id}`] }));
      p.lines = [...document.querySelectorAll(".line-item")].map((row) =>
        Object.fromEntries(
          [...row.querySelectorAll("input,select")].map((el) => [
            el.name,
            el.value,
          ]),
        ),
      );
      return call(action, p);
    };
  }
  if (action === "po") {
    requireRecords("cost", "Create a costing sheet first.");
    title = "Create production order";
    fields =
      select(
        "costId",
        "Article / saved cost sheet",
        options(
          state.cost,
          (c) => `${c.sku} · ${c.name} · ${money(c.total)}/pair`,
        ),
      ) +
      number("quantity", "Order quantity (pairs)", 100, "1", 1) +
      dates() +
      input("due", "Due date", "date", state.today) +
      `<div class="full"><h3>Required departments</h3><div class="checks">${state.department.filter(active).map((d) => `<label class="check"><input type="checkbox" name="departments" value="${d.id}" checked>${esc(d.name)}</label>`).join("")}</div></div><div class="full"><h3>Optional size / colour breakdown</h3><div id="variant-lines">${variantLine()}</div>${btn("+ Add size / colour line", "add-variant-line")}<p class="hint">If you add variants, their pair total must exactly equal the PO quantity. Leave the section blank for older-style notes.</p></div><label class="full">Notes<textarea name="notes" placeholder="Example: Black · sizes 40–44 · special packing instructions"></textarea></label>`;
    save = (p) => {
      p.departments = [
        ...document.querySelectorAll("[name=departments]:checked"),
      ].map((el) => el.value);
      p.variants = [...document.querySelectorAll(".variant-line")].map((row) => ({ size: row.querySelector("[name=variantSize]").value, color: row.querySelector("[name=variantColor]").value, quantity: row.querySelector("[name=variantQuantity]").value })).filter((v) => v.size.trim() || v.color.trim());
      return call(action, p);
    };
  }
  if (action === "worker") {
    title = "Add worker / staff";
    fields =
      input("name", "Full name") +
      input("phone", "Phone (optional)", "tel", "", "").replace(
        " required",
        "",
      ) +
      select("basis", "Payment basis", [
        ["piece", "Per piece / pair"],
        ["daily", "Daily wage"],
        ["salary", "Monthly salary"],
      ]) +
      number("rate", "Default rate (Rs)") +
      number("advance", "Opening advance (Rs)") +
      dates();
  }
  if (action === "worker-revise") {
    const w = find("worker", id);
    title = "Edit worker / staff";
    fields = input("name", "Full name", "text", w.name) + input("phone", "Phone (optional)", "tel", w.phone || "", "").replace(" required", "") + select("basis", "Payment basis", [["piece", "Per piece / pair"], ["daily", "Daily wage"], ["salary", "Monthly salary"]], w.basis) + number("rate", "Default rate (Rs)", w.rate / 100) + activeField(w.active !== false) + optionalReason() + '<p class="hint full">Existing assignments and payroll entries keep their saved rates. This rate applies to future work.</p>';
    save = (p) => call(action, { ...p, id });
  }
  if (action === "assignment") {
    requireRecords("po", "Create a production order first.");
    requireRecords("worker", "Add workers first.");
    title = "Assign department work";
    const po = find("po", id) || state.po[0];
    fields =
      poSelect(po.id) +
      select(
        "departmentId",
        "Department",
        options(state.department.filter((d) => po.departments.includes(d.id))),
      ) +
      workerSelect() +
      select("unit", "Assignment unit", [
        ["pair", "Pairs"],
        ["pcs", "Pieces"],
      ]) +
      number("factor", "Pieces per pair (pcs only)", 2, "1", 1) +
      number("quantity", "Quantity to assign", 1, "1", 1) +
      `<label id="assignment-rate-field">Piece-worker rate per selected unit (Rs)<input name="rate" type="number" value="${esc(state.worker[0].rate / 100)}" min="0" step="0.01" required></label>` +
      dates() +
      '<p class="hint full" id="assignment-hint">Daily and salary workers do not earn extra piece pay. Rates are saved on each assignment.</p>';
  }
  if (action === "receipt") {
    const a = find("assignment", id);
    title = "Receive completed work";
    fields =
      `<div class="notice full">${esc(find("worker", a.workerId).name)} · ${esc(find("department", a.departmentId).name)} · ${esc(find("po", a.poId).number)}<small>Quantities below are ${a.unit}. Rejected work stays outstanding for rework; only accepted output earns piece pay.</small></div>` +
      number("accepted", `Accepted ${a.unit}`, 0, "1") +
      number("rejected", `Rejected ${a.unit}`, 0, "1") +
      dates() +
      input("note", "Quality note (optional)").replace(" required", "");
    save = (p) => call(action, { ...p, assignmentId: id });
  }
  if (action === "stock") {
    requireRecords("material", "Add materials first.");
    title = "Record stock movement";
    fields =
      materialSelect() + binSelect() + input("lotCode", "Lot / batch (optional)", "text", "", 'maxlength="80"').replace(" required", "") + reservationSelect() +
      select("type", "Movement type", [
        ["receive", "Receive stock"],
        ["issue", "Issue to PO"],
        ["return", "Return from PO"],
        ["adjust-up", "Adjustment: increase"],
        ["adjust-down", "Adjustment: decrease"],
      ]) +
      number("quantity", "Quantity in material unit", 1, "0.000001", 0.000001) +
      dates() +
      poSelect().replace(" required", "") +
      `<div id="supplier-receive-fields" class="full">${select("supplierId", "Supplier (for received stock)", [["", "No supplier / internal stock"], ...state.supplier.filter(active).map((s) => [s.id, s.name])]).replace(" required", "")}<p class="hint" id="supplier-receive-total">Choose a supplier to add the material value automatically to its payable account.</p></div>` +
      note("Supplier / reference / reason") +
      '<p class="hint full">PO is required for issues and returns. Lot / batch is optional for legacy or untracked stock, but once entered it keeps stock guards and history separate. For received stock, selecting a supplier automatically posts quantity × current material rate to that supplier account.</p>';
  }
  if (action === "warehouse") {
    title = "Add warehouse";
    fields = input("code", "Warehouse code", "text", "", 'maxlength="20"') + input("name", "Warehouse name", "text", "", 'maxlength="100"');
  }
  if (action === "reservation") {
    requireRecords("material", "Add materials before creating a reservation.");
    title = "Reserve raw stock";
    fields = materialSelect() + binSelect() + input("lotCode", "Lot / batch (optional)", "text", "", 'maxlength="80"').replace(" required", "") + number("quantity", "Quantity to reserve", 1, "0.000001", 0.000001) + dates() + note("Reservation note / PO reference");
  }
  if (action === "transfer") {
    requireRecords("material", "Add materials before transferring stock.");
    if (state.bin.filter(active).length < 2) throw Error("Add at least two active bins before transferring stock.");
    title = "Transfer stock between bins";
    fields = materialSelect() + transferBinSelect("sourceBinId", "From bin") + transferBinSelect("destinationBinId", "To bin") + input("lotCode", "Lot / batch (optional)", "text", "", 'maxlength="80"').replace(" required", "") + number("quantity", "Quantity to transfer", 1, "0.000001", 0.000001) + dates() + note("Transfer reference / reason");
  }
  if (action === "bin") {
    title = "Add warehouse bin";
    fields = warehouseSelect() + input("code", "Bin code", "text", "", 'maxlength="20"') + input("name", "Bin name", "text", "", 'maxlength="100"');
  }
  if (action === "stock-count") {
    requireRecords("material", "Add materials before starting a stock count.");
    title = "Start stock count";
    fields = '<div class="full"><h3>Count lines</h3><p class="hint">Add each material/bin/lot once. The system quantity is captured when you save the sheet.</p><div id="stock-count-lines">' + stockCountLine() + '</div>' + btn("+ Add count line", "add-stock-count-line") + '</div>' + dates() + note("Count note (optional)") + '<p class="hint full">Submit the complete sheet for Owner/Manager review. Approval posts all line variances together.</p>';
    save = (p) => {
      p.lines = [...document.querySelectorAll(".stock-count-line")].map((row) => Object.fromEntries([...row.querySelectorAll("input,select")].map((el) => [el.name, el.value])));
      return call(action, p);
    };
  }
  if (["finished", "dispatch"].includes(action)) {
    requireRecords("po", "Create a PO first.");
    title =
      action === "finished"
        ? "Receive finished pairs"
        : "Dispatch finished pairs";
    fields =
      poSelect() +
      poVariantSelect(state.po[0]) +
      number("quantity", "Pairs", 1, "1", 1) +
      dates() +
      note(
        action === "dispatch"
          ? "Destination / shop / order reference"
          : "Completion reference",
      );
  }
  if (["advance", "attendance", "salary", "settlement"].includes(action)) {
    requireRecords("worker", "Add workers first.");
    title = {
      advance: "Give worker advance",
      attendance: "Record daily attendance",
      salary: "Post monthly salary",
      settlement: "Settle worker account",
    }[action];
    const basis =
      action === "attendance" ? "daily" : action === "salary" ? "salary" : null;
    if (basis && !state.worker.some((w) => w.basis === basis))
      throw Error(`Add a ${basis} worker first.`);
    fields = workerSelect(basis);
    if (action === "advance")
      fields += number("amount", "Advance paid (Rs)", 0) + dates() + note();
    if (action === "attendance")
      fields +=
        select("days", "Day worked", [
          ["1", "Full day"],
          ["0.5", "Half day"],
          ["0", "Absent"],
        ]) + dates();
    if (action === "salary")
      fields +=
        input(
          "month",
          "Completed salary month",
          "month",
          (() => { const d=new Date(state.today+'T12:00:00'); d.setDate(1); d.setMonth(d.getMonth()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })(),
        ) +
        '<p class="hint full">Posts one full monthly salary. Partial-month proration and overtime are not included. The month must have ended.</p>';
    if (action === "settlement")
      fields +=
        '<div class="notice full" id="settlement-balance"></div>' +
        number("amount", "Cash payment (Rs)", 0) +
        number("recovery", "Advance recovery from earnings (Rs)", 0) +
        dates() +
        note("Week / month / payment reference") +
        '<p class="hint full">Review the worker ledger first. Cash + recovery must not exceed unpaid earnings. Giving an advance does not reduce earned wages until recovery is recorded.</p>';
  }
  if (action === "supplier") {
    title = "Add supplier";
    fields = input("name", "Supplier name") + input("phone", "Phone (optional)", "tel", "", "").replace(" required", "") + '<label class="full">Address<textarea name="address" rows="2" maxlength="500"></textarea></label>' + '<label class="full">Notes (optional)<textarea name="notes" rows="2" maxlength="500"></textarea></label>';
  }
  if (action === "supplier-revise") {
    const s = find("supplier", id);
    title = "Edit supplier";
    fields = input("name", "Supplier name", "text", s.name) + input("phone", "Phone (optional)", "tel", s.phone || "", "").replace(" required", "") + `<label class="full">Address<textarea name="address" rows="2" maxlength="500">${esc(s.address || "")}</textarea></label><label class="full">Notes (optional)<textarea name="notes" rows="2" maxlength="500">${esc(s.notes || "")}</textarea></label>` + activeField(s.active !== false) + optionalReason();
    save = (p) => call(action, { ...p, id });
  }
  if (action === "purchase") {
    requireRecords("supplier", "Add a supplier first.");
    requireRecords("material", "Add materials first.");
    title = "Record material purchase";
    fields = select("supplierId", "Supplier", options(state.supplier.filter(active), (s) => s.name)) + input("invoice", "Invoice / bill number") + dates() + '<div class="full"><h3>Materials received</h3><div id="purchase-lines">' + purchaseLine() + '</div>' + btn("+ Add material line", "add-purchase-line") + '<p class="hint">Lot / batch is optional. Enter it when the supplier gives a batch number so stock, returns and counts can be separated safely.</p></div>' + '<div class="form-grid full"><div><h3>Bill adjustments (Rs)</h3>' + number("discount", "Discount", 0, "0.01", 0) + number("freight", "Freight / landed cost", 0, "0.01", 0) + number("tax", "Tax / duty", 0, "0.01", 0) + '</div><p class="hint">Discount is allocated across lines; freight and tax are added to landed cost. The bill total and each line’s landed rate are saved as a historical snapshot.</p></div>' + note("Purchase note (optional)").replace(" required", "") + '<p class="hint full">Material stock is received with the saved invoice quantity and landed valuation rate. Supplier payable uses the full landed bill total.</p>';
    save = (p) => {
      p.lines = [...document.querySelectorAll(".purchase-line")].map((row) => Object.fromEntries([...row.querySelectorAll("input,select")].map((el) => [el.name, el.value])));
      return call(action, p);
    };
  }
  if (action === "purchase-return") {
    requireRecords("purchase", "Record a purchase first.");
    title = "Return purchased material";
    fields = select("purchaseId", "Purchase", state.purchase.map((p) => [p.id, `${p.number} · ${p.supplierName} · ${p.invoice}`]), id) + purchaseMaterialSelect(id) + number("quantity", "Return quantity", 1, "0.000001", 0.000001) + dates() + note("Return reason");
  }
  if (action === "supplier-payment") {
    requireRecords("supplier", "Add a supplier first.");
    title = "Record supplier payment";
    const supplierId = id || state.supplier.find((s) => (state.supplierBalances[s.id]?.payable || 0) > 0)?.id || state.supplier[0]?.id;
    fields = select("supplierId", "Supplier", options(state.supplier, (s) => `${s.name} · ${money(state.supplierBalances[s.id]?.payable || 0)} payable`), supplierId) + number("amount", "Cash paid (Rs)", 0) + dates() + note("Payment reference");
  }
  showForm(
    title,
    fields,
    save,
    action === "settlement" ? "Record payment & recovery" : "Save record",
  );
  if (
    ["advance", "attendance", "salary", "settlement"].includes(action) &&
    wId &&
    $(`[name=workerId] option[value="${wId}"]`)
  )
    $("[name=workerId]").value = wId;
  updateForm();
}
function updateForm() {
  const receiveFields = $("#supplier-receive-fields");
  if (receiveFields && $("[name=type]")) {
    const receiving = $("[name=type]").value === "receive";
    receiveFields.hidden = !receiving;
    const supplier = $("[name=supplierId]")?.value;
    const material = $("[name=materialId]") && find("material", $("[name=materialId]").value);
    const quantity = Number($("[name=quantity]")?.value || 0);
    if ($("#supplier-receive-total")) {
      $("#supplier-receive-total").textContent = supplier && material
        ? `Automatic supplier payable: ${money(Math.round(quantity * material.rate))} (${qty(quantity)} ${material.unit} × ${money(material.rate)}).`
        : "Choose a supplier to add the material value automatically to its payable account.";
    }
    const noteField = $("[name=note]");
    if (noteField) noteField.required = receiving ? Boolean(supplier) : true;
  }
  const assignmentRate = $("#assignment-rate-field");
  if (assignmentRate && $("[name=workerId]")) {
    const worker = find("worker", $("[name=workerId]").value);
    const inputEl = assignmentRate.querySelector("input");
    const isPiece = worker?.basis === "piece";
    assignmentRate.firstChild.textContent = isPiece
      ? "Piece-worker rate per selected unit (Rs)"
      : "Piece rate (not used for this worker)";
    inputEl.required = isPiece;
    inputEl.disabled = !isPiece;
    if (!isPiece) inputEl.value = "0";
    else if (Number(inputEl.value) === 0 && worker?.rate) inputEl.value = worker.rate / 100;
  }
  if ($("#cost-total")) {
    let total = 0;
    document.querySelectorAll(".line-item").forEach((row) => {
      const m = find("material", row.querySelector("select").value);
      total += Math.round(
        m.rate *
          Number(row.querySelector("[name=quantity]").value) *
          (1 + Number(row.querySelector("[name=wastage]").value) / 100),
      );
    });
    const departmentLabour = [...document.querySelectorAll('[name^="departmentLabour_"]')]
      .reduce((sum, field) => sum + Number(field.value || 0), 0);
    const legacyLabour = $("[name=labour]");
    const overhead = $("[name=overhead]");
    total += Math.round((departmentLabour + Number(legacyLabour?.value || 0)) * 100);
    total += Math.round(Number(overhead?.value || 0) * 100);
    $("#cost-total").textContent = money(total);
  }
  if ($("#settlement-balance")) {
    const b = state.balances[$("[name=workerId]").value];
    $("#settlement-balance").innerHTML =
      `Current unpaid earnings: <strong>${money(b.payable)}</strong><br>Advance remaining: <strong>${money(b.advanceDue)}</strong>`;
  }
  const purchaseId = $("[name=purchaseId]")?.value;
  const purchase = $("[name=purchaseId]") && $("[name=materialId]") && find("purchase", purchaseId);
  if (purchase) {
    const selectEl = $("[name=materialId]");
    const current = selectEl.value;
    selectEl.innerHTML = purchase.lines.map((line) => `<option value="${esc(line.materialId)}">${esc(line.name)} (${esc(line.unit)}) · ${qty(line.quantity)} received</option>`).join("");
    selectEl.value = purchase.lines.some((line) => line.materialId === current) ? current : purchase.lines[0]?.materialId || "";
  }
}
function workIssued(workerId) {
  const rows = state.assignment.filter(
    (a) => a.workerId === workerId && a.date >= from && a.date <= to,
  );
  return rows.length
    ? table(
        ["Date / PO", "Department", "Issued", "Rate / unit"],
        rows.map(
          (a) =>
            `<tr><td>${a.date}<br>${esc(find("po", a.poId)?.number)}</td><td>${esc(find("department", a.departmentId)?.name)}</td><td>${qty(a.quantity)} ${a.unit}</td><td>${a.basis === "piece" ? money(a.rate) : esc(a.basis)}</td></tr>`,
        ),
      )
    : '<p class="muted">No work issued in this period.</p>';
}
function newDocumentNumber() {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return `SNX-${String(state.today || "").replace(/\D/g, "")}-${String(bytes[0]).slice(-4)}${String(bytes[1]).slice(-4)}`;
}
function receiptLayout(title, body, documentNo) {
  const company = state.config?.companyName || "Factory workspace";
  return `<div class="print-preview"><div class="print-brand">${state.config?.companyLogo ? `<img src="${esc(state.config.companyLogo)}" alt="Factory logo">` : ""}<div><h2>SoleNexa</h2><p>${esc(company)}<br><strong>${title}</strong></p></div></div><p class="document-number">Document No. <strong>${esc(documentNo)}</strong></p>${body}<div class="signature">Worker / receiver signature</div><small>Document No. <strong>${esc(documentNo)}</strong> · Generated ${state.today} · Keep this slip for your record.</small><div class="powered">Software powered by <strong>IQ Links</strong></div></div>`;
}
function printPreview(title, body, options = {}) {
  printFormat = options.format || "thermal";
  shareReportText = options.shareText || "";
  const documentNo = newDocumentNumber();
  const html = receiptLayout(title, body, documentNo);
  $("#print-area").innerHTML = html;
  const d = $("#modal");
  d.classList.toggle("report-dialog", printFormat === "a4");
  d.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${printFormat === "a4" ? "A4 report preview" : `Print preview · ${paper} mm`}</h2>${btn("Close", "close")}</div><div class="dialog-body">${html}<div class="dialog-foot">${btn("Save PDF", "pdf-now", "", true)}${btn(printFormat === "a4" ? "Print A4 report" : "Print slip", "print-now")}${shareReportText ? btn("Share via WhatsApp", "share-whatsapp") : ""}</div></div>`;
  d.showModal();
}
function reportGraph(reportPos) {
  const totals = reportPos.reduce((t, p) => {
    const s = state.poStats[p.id] || { finished: 0, departments: [] };
    const accepted = (s.departments || []).reduce((n, d) => n + Number(d.accepted || 0), 0);
    const rejected = state.assignment.filter((a) => a.poId === p.id).reduce((n, a) => n + state.events.filter((e) => e.kind === "receipt" && e.target === a.id).reduce((x, e) => x + Number(e.data?.rejected || 0), 0), 0);
    return { accepted: t.accepted + accepted, rejected: t.rejected + rejected, finished: t.finished + Number(s.finished || 0) };
  }, { accepted: 0, rejected: 0, finished: 0 });
  const max = Math.max(totals.accepted, totals.rejected, totals.finished, 1);
  const bar = (label, value, color) => `<div class="report-bar-row"><span>${label}</span><div class="report-bar-track"><i style="width:${Math.round((value / max) * 100)}%;background:${color}"></i></div><strong>${qty(value)}</strong></div>`;
  return `<section class="report-graph"><h3>Production condition</h3><p class="muted">Cumulative accepted, rejected and finished quantities for the selected production orders.</p>${bar("Accepted department-pairs", totals.accepted, "#116fae")}${bar("Rejected units", totals.rejected, "#d97706")}${bar("Finished pairs", totals.finished, "#0f9f81")}</section>`;
}
function reportDoc(period) {
  const end = new Date(state.today + "T00:00:00");
  const days = period === "daily" ? 1 : period === "weekly" ? 7 : 30;
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  const filterDepartment = $("[name=reportDepartment]")?.value || "";
  const filterWorker = $("[name=reportWorker]")?.value || "";
  const filterPo = $("[name=reportPo]")?.value || "";
  const requestedFrom = $("[name=reportFrom]")?.value || "";
  const requestedTo = $("[name=reportTo]")?.value || "";
  const fromDate = requestedFrom || start.toISOString().slice(0, 10);
  const toDate = requestedTo || state.today;
  if (fromDate > toDate) throw Error("Choose a valid report date range.");
  const reportPos = state.po.filter((p) => (!filterPo || p.id === filterPo) && (!filterDepartment || p.departments?.includes(filterDepartment)) && (!filterWorker || state.assignment.some((a) => a.poId === p.id && a.workerId === filterWorker)));
  const reportPoIds = new Set(reportPos.map((p) => p.id));
  const events = state.events.filter((e) => {
    const assignment=state.assignment.find(a=>a.id===(e.data?.assignmentId || e.target));
    const poId=assignment?.poId || e.data?.poId || (find('po',e.target)?.id);
    return e.date>=fromDate && e.date<=toDate && (!filterWorker || e.target===filterWorker || assignment?.workerId===filterWorker) && (!filterPo || poId===filterPo) && (!filterDepartment || assignment?.departmentId===filterDepartment || (!assignment && reportPoIds.has(poId)));
  });
  const activity = events.length ? table(["Date", "Type", "Details", "Amount"], events.toReversed().map((e) => `<tr><td>${e.date}</td><td>${esc(e.kind)}</td><td>${esc(e.data?.note || e.data?.type || "Recorded")}</td><td>${["earning", "salary", "settlement", "advance"].includes(e.kind) ? money(e.data.amount) : "—"}</td></tr>`)) : `<p>No activity recorded in this period.</p>`;
  const staff = table(["Staff", "Method", "Unpaid wages", "Advance due"], state.worker.filter((w) => !filterWorker || w.id === filterWorker).map((w) => { const b = state.balances[w.id]; return `<tr><td>${esc(w.name)}</td><td>${esc(w.basis)}</td><td>${money(b?.payable)}</td><td>${money(b?.advanceDue)}</td></tr>`; }));
  const stock = table(["Material", "Unit", "On hand", "Reorder"], state.material.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.unit)}</td><td>${qty(state.stocks[m.id])}</td><td>${qty(m.reorder)}</td></tr>`));
  const costing = table(["PO", "Estimated", "Actual", "Variance"], reportPos.map((p) => { const c = state.poCosts[p.id]; return `<tr><td>${esc(p.number)}<small>${esc(p.article)}</small></td><td>${money(c.estimated.total)}</td><td>${money(c.actual.total)}</td><td>${money(c.variance.total)}</td></tr>`; }));
  const production = table(["PO", "Accepted", "Rejected", "Finished"], reportPos.map((p) => { const s = state.poStats[p.id]; const assignments = state.assignment.filter((a) => a.poId === p.id); const rejected = assignments.reduce((sum, a) => sum + state.events.filter((e) => e.kind === "receipt" && e.target === a.id).reduce((n, e) => n + e.data.rejected, 0), 0); return `<tr><td>${esc(p.number)}</td><td>${qty(s.departments.reduce((n, d) => n + d.accepted, 0))}</td><td>${qty(rejected)}</td><td>${qty(s.finished)}</td></tr>`; }));
  const totals = reportPos.reduce((t, p) => { const s = state.poStats[p.id] || { finished: 0, departments: [] }; return { accepted: t.accepted + (s.departments || []).reduce((n, d) => n + Number(d.accepted || 0), 0), finished: t.finished + Number(s.finished || 0) }; }, { accepted: 0, finished: 0 });
  const shareText = `SoleNexa ${period.toUpperCase()} FACTORY REPORT\nFactory: ${state.config.companyName || "Factory workspace"}\nPeriod: ${fromDate} to ${toDate}\nProduction orders: ${reportPos.length}\nAccepted department-pairs (cumulative): ${totals.accepted}\nFinished pairs (cumulative): ${totals.finished}\nLow-stock materials: ${state.material.filter((m) => Number(state.stocks[m.id] || 0) <= Number(m.reorder || 0)).length}`;
  printPreview(`${period.toUpperCase()} FACTORY REPORT`, `<p>${fromDate} to ${toDate}</p><p>Activity is filtered by the selected period. Production, costing and stock below are cumulative current balances. PO costs exclude unallocated daily/salary wages and actual overhead; variance is provisional.</p>${reportGraph(reportPos)}<h3>Factory activity</h3>${activity}<h3>PO costing: estimated vs actual</h3>${costing}<h3>Production completion & rejection</h3>${production}<h3>Staff accounts</h3>${staff}<h3>Raw material stock</h3>${stock}`, { format: "a4", shareText });
}
async function printDoc(action, id) {
  if (action === "print-label") {
    const [poId, variantKey] = String(id).split("|");
    const p = find("po", poId), v = (state.poStats[p.id].variantStats || []).find((item) => item.key === variantKey);
    if (!p || !v) throw Error("This size / colour label is no longer available.");
    const code = `${p.sku}-${v.size}-${v.color}`.toUpperCase().replace(/[^0-9A-Z .\-$/+%]/g, "-");
    printPreview("SIZE / COLOUR LABEL", `<div class="label-preview"><h2>${esc(p.article)}</h2><p><strong>${esc(v.size)} · ${esc(v.color)}</strong></p>${code39Svg(code)}<p class="label-code">${esc(code)}</p><small>PO ${esc(p.number)} · ${qty(v.available)} pairs available</small></div>`);
    return;
  }
  if (action === "print-assignment") {
    const a = find("assignment", id),
      p = find("po", a.poId);
    const qrPayload = `SNX1|${a.id}`;
    let qrMarkup;
    try {
      qrMarkup = window.qrcode ? assignmentQr(qrPayload) : await call("qr-code", { value: qrPayload });
    } catch {
      qrMarkup = assignmentQr(qrPayload);
    }
    printPreview(
      "WORK ASSIGNMENT",
      `<div class="assignment-qr-box">${qrMarkup}<p>After completing this assignment, return this slip to the supervisor for scanning.</p></div>` + table(
        ["Field", "Details"],
        [
          ["Slip", a.id.slice(0, 8).toUpperCase()],
          ["Date", a.date],
          ["Worker", find("worker", a.workerId).name],
          ["PO", p.number],
          ["Article", p.article],
          ["Department", find("department", a.departmentId).name],
          ["Assigned", `${a.quantity} ${a.unit}`],
          ["Pairs equivalent", qty(a.quantity / a.factor)],
          [
            "Rate",
            a.basis === "piece" ? money(a.rate) + ` / ${a.unit}` : a.basis,
          ],
          [
            "Potential piece bill",
            a.basis === "piece"
              ? money(a.quantity * a.rate)
              : "Per attendance / salary",
          ],
          ["Notes", p.notes],
        ].map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`),
      ) + "<p>Piece bill earned on accepted output only.</p>",
    );
  }
  if (action === "print-ledger") {
    const l = ledgerData();
    printPreview(
      "WORKER ACCOUNT",
      `<p>${esc(l.w.name)}<br>${from} to ${to}</p><h3>Work issued</h3>` +
        workIssued(l.w.id) +
        "<h3>Account entries</h3>" +
        table(
          ["Date / entry", "Amount"],
          l.rows.map(
            (e) =>
              `<tr><td>${e.date}<br>${esc(e.kind)}<br>${esc(e.data.note)}${e.kind === "settlement" ? "<br>Recovery: " + money(e.data.recovery) : ""}</td><td>${money(e.data.amount)}</td></tr>`,
          ),
        ) +
        `<p>Opening wages: ${money(l.opening)}<br>Closing wages: ${money(l.closing.payable)}<br>Advance due: ${money(l.closing.advanceDue)}</p>`,
    );
  }
  if (action === "print-settlement") {
    const e = state.events.find((e) => e.id === id);
    printPreview(
      "PAYMENT RECEIPT",
      `<p>${esc(find("worker", e.target).name)}<br>${e.date}<br>Receipt ${e.id.slice(0, 8).toUpperCase()}</p>` +
        table(
          ["Entry", "Amount"],
          [
            ["Cash paid", money(e.data.amount)],
            ["Advance recovered", money(e.data.recovery)],
          ].map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`),
        ) +
        `<p>${esc(e.data.note)}</p>`,
    );
  }
  if (action === "print-cost") {
    const c = find("cost", id);
    printPreview(
      "COST PER PAIR",
      `<p>${esc(c.name)} · ${esc(c.sku)}</p>` +
        table(
          ["Material / consumption", "Amount"],
          c.lines.map(
            (l) =>
              `<tr><td>${esc(l.name)}<br>${qty(l.quantity)} ${esc(l.unit)} + ${l.wastage}% waste</td><td>${money(l.amount)}</td></tr>`,
          ),
        ) +
        `<p>Labour ${money(c.labour)}<br>Overhead ${money(c.overhead)}<br><strong>Per pair ${money(c.total)}</strong></p>`,
    );
  }
}
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action,
    id = el.dataset.id;
  try {
    if (action === "orders") {
      location.hash = "#orders";
      return;
    }
    if (action === "po" && !state.cost.length) {
      toast("Create a costing sheet first. Opening Costing sheets…", "error");
      location.hash = "#costs";
      return;
    }
    if(action==='logout'){await call('logout',{forgetUser:true});state=null;$('#modal').close();return boot();}
    if(action==='cancel-assignment') {
      return showForm("Cancel assignment", '<div class="notice full">No posted receipt exists for this assignment, so its unfinished capacity can be safely reallocated. The assignment record will remain in history.</div><label class="full">Cancellation reason<textarea name="reason" rows="3" maxlength="500" required placeholder="Explain why this unfinished work is being cancelled"></textarea></label>', async (p) => { await call("cancel-assignment", { id, reason: p.reason }); await refresh(); });
    }
    if(action==='correct-event') {
      const event = state.events.find((item) => item.id === id);
      if (!event || !["stock", "receipt", "attendance", "settlement", "purchase-return", "supplier-payment", "supplier-receive"].includes(event.kind) || event.data.correctedBy) throw Error("This entry is not available for correction.");
      return showForm("Correct " + event.kind + " entry", '<div class="notice full">The original entry stays in the audit history. SoleNexa will add a linked compensating reversal and mark it corrected.</div><label class="full">Correction reason<textarea name="reason" rows="3" maxlength="500" required placeholder="Explain what was wrong and who approved the correction"></textarea></label>', async (p) => { await call("correct-event", { eventId: id, reason: p.reason }); await refresh(); });
    }
    if(action==='user-link') return showForm('Link worker login',select('workerId','Labour profile',[['','Unlink profile'],...state.worker.map(w=>[w.id,w.name])]).replace(' required','')+'<p>Only this profile’s work and account will be visible to this login.</p>',p=>call('link-worker',{...p,id}));
    if(action==='licence-renew')return showForm('Set activation period','<p class="hint full">Use the fixed IQ Links offline activation key and choose the new validity period for this computer.</p>'+input('key','Activation key','password','','autocomplete="off" placeholder="Enter activation key"')+input('validityDays','Validity days','number','','min="1" max="3660" step="1" placeholder="Example: 365"'),p=>call('activate',p));
    if(action==='user-new') return showForm('Create staff login',input('username','Username')+select('role','Access role',['owner','manager','supervisor','storekeeper','accountant','worker'].map(r=>[r,r]))+input('password','Password (8+ characters)','password'),p=>call('create-user',p));
    if(action==='password-self' || action==='user-reset') return showForm(action==='password-self'?'Change your password':'Reset account password',(action==='password-self'?input('currentPassword','Current password','password'):'')+input('password','New password (8+ characters)','password'),async p=>{await call(action==='password-self'?'change-password':'reset-password',{...p,id});if(action==='password-self'){state=null;setTimeout(boot,0);}});
    if(action==='user-disable' || action==='user-enable'){await call('set-user-active',{id,active:action==='user-enable'});return loadAccess();}
    if(action==='material-history') return showRevisionHistory('material',id);
    if(action==='worker-history') return showRevisionHistory('worker',id);
    if(action==='department-history') return showRevisionHistory('department',id);
    if (action.startsWith("csv-")) {
      const kind = action.slice(4);
      const file = await call("export-csv", { kind });
      if (file) toast("CSV saved: " + file);
      return;
    }
    if(action==='reservation-release') {
      const reservation = find('reservation', id);
      if (!reservation) throw Error('Reservation was not found.');
      return showForm('Release stock reservation', `<div class="notice full">${esc(reservation.number)} · ${esc(reservation.materialName)} · ${qty(reservationRemaining(reservation))} remaining. Release it when the planned issue is no longer needed.</div>` + number('quantity','Quantity to release',reservationRemaining(reservation),'0.000001',0.000001) + note('Release reason'), async (p) => { await call('reservation-release',{id,quantity:p.quantity,note:p.note}); await refresh(); });
    }
    if (action === "page-prev" || action === "page-next") {
      const key = id;
      const total = key === "stock" ? state.events.filter((e) => e.kind === "stock").length : ledgerData()?.total || 0;
      const max = Math.max(0, Math.ceil(total / 50) - 1);
      pages[key] = action === "page-prev" ? Math.max(0, pages[key] - 1) : Math.min(max, pages[key] + 1);
      return render();
    }
    if (action === "close") return $("#modal").close();
    if (action === "add-line") {
      $("#cost-lines").insertAdjacentHTML("beforeend", costLine());
      return updateForm();
    }
    if (action === "add-purchase-line") {
      $("#purchase-lines").insertAdjacentHTML("beforeend", purchaseLine());
      return updateForm();
    }
    if (action === "add-stock-count-line") {
      $("#stock-count-lines").insertAdjacentHTML("beforeend", stockCountLine());
      return updateForm();
    }
    if (action === "add-variant-line") {
      $("#variant-lines").insertAdjacentHTML("beforeend", variantLine());
      return updateForm();
    }
    if (action === "remove-line") {
      el.closest(".line-item").remove();
      return updateForm();
    }
    if (action === "filter-ledger") {
      const f = $("[name=from]").value,
        t = $("[name=to]").value;
      if (!f || !t || f > t) throw Error("Choose a valid date range.");
      from = f;
      to = t;
      pages.ledger = 0;
      workerFilter = $("[name=workerFilter]").value;
      location.hash = "ledger/" + workerFilter;
      return render();
    }
    if (action === "print-now") {
      document.body.classList.toggle("paper58", printFormat !== "a4" && paper === "58");
      document.body.classList.toggle("paperA4", printFormat === "a4");
      el.disabled = true;
      try {
        if (window.sole) await call("print", { paper, format: printFormat });
        else window.print();
      } finally {
        el.disabled = false;
      }
      return;
    }
    if (action === "pdf-now") {
      el.disabled = true;
      try {
        const file = await call("pdf", { paper, format: printFormat });
        if (file) toast("PDF saved: " + file);
      } finally {
        el.disabled = false;
      }
      return;
    }
    if (action === "share-whatsapp") {
      if (!shareReportText) throw Error("Open a report before sharing it.");
      await call("whatsapp-share", { text: shareReportText });
      toast("WhatsApp opened with the report summary. Review it before sending.");
      return;
    }
    if (action === "supplier-whatsapp") {
      const supplier = find("supplier", id);
      const phone = whatsappPhone(supplier?.phone);
      if (!supplier || !phone) throw Error("Add a valid WhatsApp contact number for this supplier first.");
      await call("whatsapp-share", { phone, text: supplierAccountMessage(supplier, state.supplierBalances?.[supplier.id] || { purchased: 0, paid: 0, payable: 0 }) });
      toast("WhatsApp opened with this supplier's account summary. Review it before sending.");
      return;
    }
    if (["report-daily", "report-weekly", "report-monthly"].includes(action)) {
      return reportDoc(action.replace("report-", ""));
    }
    if (action === "theme-light" || action === "theme-dark") return;
    if (action.startsWith("print-")) return printDoc(action, id);
    if (action === "delete-all-data") {
      return showForm("Permanently delete factory data", '<div class="error full">This removes factory records, users, audit history, settings, stock, costing, payroll and production data from this local database. This cannot be undone.</div><label class="full">Type DELETE ALL FACTORY DATA<input name="confirmation" required spellcheck="false" autocomplete="off" placeholder="DELETE ALL FACTORY DATA"></label>', async (p) => { const confirmation = String(p.confirmation || "").trim(); if (confirmation !== "DELETE ALL FACTORY DATA") throw Error("Type DELETE ALL FACTORY DATA exactly."); const pin = await requestFactoryPin(); await call("delete-all-data", { confirmation, pin }); state=null; await boot(); });
    }
    if (action === "stock-count-submit" || action === "stock-count-approve") {
      await call(action, { id });
      await refresh();
      toast(action === "stock-count-submit" ? "Stock count submitted for approval." : "Stock count approved and variance posted.");
      return;
    }
    if (action === "stock-count-reject") {
      return showForm("Reject stock count", '<label class="full">Reason<textarea name="reason" rows="3" maxlength="500" required placeholder="Explain why this count must be repeated"></textarea></label>', async (p) => { await call(action, { id, reason: p.reason }); await refresh(); });
    }
    if (["backup", "restore"].includes(action)) {
      const result = await call(action);
      if (result) {
        if(action === "restore") { state=null; await boot(); } else await refresh();
        toast(
          action === "backup"
            ? "Backup saved: " + result
            : "Backup restored. Previous data kept as a recovery copy.",
        );
      }
      return;
    }
    form(action, id);
  } catch (error) {
    toast(error.message, "error");
  }
});
function printWorkerCompletionSlip(receipt) {
  const a = find("assignment", receipt.target),
    p = find("po", a.poId),
    w = find("worker", a.workerId),
    accepted = Number(receipt.data?.accepted || 0),
    balance = state.balances[a.workerId];
  const details=[["Completed now", `${qty(accepted)} ${esc(a.unit)}`], ["Assignment total", `${qty(a.quantity)} ${esc(a.unit)}`], ["Earned on this receipt", a.basis==='piece' ? money(accepted*a.rate) : 'Paid through attendance / monthly salary'], ["Current unpaid labour", balance ? money(balance.payable) : 'See accounts department'], ["Receipt ID", esc(receipt.id.slice(0, 8).toUpperCase())]];
  printPreview("WORK COMPLETION RECEIPT", `<p>${esc(w.name)} · ${esc(p.number)} · ${esc(p.article)}</p>${table(["Field", "Details"], details.map(row=>`<tr><td>${row[0]}</td><td>${row[1]}</td></tr>`))}<p class="acknowledgement">Keep this receipt as proof of completed work and accepted pairs.</p>`);
}
function insertNumpadValue(e) {
  if (!/^Numpad(?:[0-9]|Decimal)$/.test(e.code) || /[0-9.]|,/.test(e.key)) return false;
  const field = e.target.closest("input,textarea");
  if (!field || field.disabled || field.readOnly || field.type === "file") return false;
  const value = e.code === "NumpadDecimal" ? "." : e.code.slice(-1);
  if (field.type === "number" && value === "." && field.value.includes(".")) {
    e.preventDefault();
    return true;
  }
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  field.value = field.value.slice(0, start) + value + field.value.slice(end);
  field.setSelectionRange(start + value.length, start + value.length);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  e.preventDefault();
  return true;
}
document.addEventListener("keydown", async (e) => {
  if (insertNumpadValue(e)) return;
  if (e.key === "Enter") {
    const code = scanBuffer;
    scanBuffer = "";
    clearTimeout(scanTimer);
    if (code.startsWith("SNX1|")) {
      e.preventDefault();
      try {
        const receipt = await call("scan-receipt", { code });
        await refresh();
        printWorkerCompletionSlip(receipt);
        toast("Work completed and worker receipt is ready.");
      } catch (error) {
        toast(error.message, "error");
      }
    }
    return;
  }
  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && !e.target.closest("input,textarea,select")) {
    scanBuffer += e.key;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { scanBuffer = ""; }, 250);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    query = e.target.value;
    const pos = e.target.selectionStart;
    render();
    $("#search").focus();
    $("#search").setSelectionRange(pos, pos);
  }
  if (e.target.closest("#modal")) updateForm();
});
document.addEventListener("change", (e) => {
  if (e.target.name === "paper") paper = e.target.value;
  if (e.target.name === "poId" && $("[name=departmentId]")) {
    const p = find("po", e.target.value);
    $("[name=departmentId]").innerHTML = options(
      state.department.filter((d) => p.departments.includes(d.id)),
    );
  }
  if (e.target.name === "poId" && $("[name=variantKey]")) {
    const p = find("po", e.target.value), variants = p?.variants || [];
    $("[name=variantKey]").innerHTML = `<option value="">${variants.length ? "Whole PO (legacy aggregate)" : "Whole PO"}</option>` + variants.map((v) => `<option value="${esc(`${v.size}::${v.color}`)}">${esc(`${v.size} · ${v.color} · ${qty(v.quantity)} pairs`)}</option>`).join("");
  }
  if (e.target.name === "workerId" && $("[name=rate]") && $("#assignment-hint"))
    $("[name=rate]").value = find("worker", e.target.value).rate / 100;
  updateForm();
});
window.addEventListener("hashchange", () => {
  query = "";
  render();
  $("#main").focus();
});
boot();

let idleTimer;
function resetIdleTimer(){clearTimeout(idleTimer);if(state)idleTimer=setTimeout(async()=>{try{await call('logout');}catch{}state=null;$('#modal').close();boot();toast('Signed out after 15 minutes of inactivity.');},15*60*1000);}
['pointerdown','keydown'].forEach(name=>document.addEventListener(name,resetIdleTimer,{passive:true}));
