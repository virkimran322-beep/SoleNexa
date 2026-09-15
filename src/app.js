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
  paper = "80";
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
  settings: "Settings & backup",
  access: "Users & security",
};
const find = (kind, id) => state[kind].find((x) => x.id === id);
const btn = (name, action, id = "", primary = false) =>
  `<button type="button" ${primary ? 'class="primary"' : ""} data-action="${action}" data-id="${esc(id)}">${name}</button>`;
const badge = (s, c = "") => `<span class="badge ${c}">${esc(s)}</span>`;
const empty = (title, desc, action = "") =>
  `<div class="empty">${icon(route)}<h3>${title}</h3><p>${desc}</p>${action}</div>`;
const table = (heads, rows) =>
  `<div class="table-wrap"><table><thead><tr>${heads.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
const panel = (title, body, action = "") =>
  `<section class="panel"><div class="panel-head"><h2>${title}</h2>${action}</div>${body}</section>`;
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
async function call(action, payload) {
  const r = window.sole
    ? await window.sole.call(action, payload)
    : await fetch("/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      }).then((r) => r.json());
  if (!r.ok) {
    if (/Session expired|Account changed|Licence required/.test(r.error)) { state=null; $('#modal')?.close(); boot(); }
    throw Error(r.error);
  }
  return r.data;
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
      if (data.companyLogoFile) {
        const f = e.target.querySelector("[name=companyLogoFile]").files[0];
        data.companyLogo = f
          ? await new Promise((ok, fail) => {
              const r = new FileReader();
              r.onload = () => ok(r.result);
              r.onerror = fail;
              r.readAsDataURL(f);
            })
          : "";
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
  if(status.licence) {
    gate("Activate SoleNexa", "Send this device ID to IQ Links to receive its signed licence.",
      input("deviceId","Device ID","text",status.licence.deviceId,"readonly")+
      `<p class="hint">${esc(status.licence.reason || "Activation required")}</p><label>Signed licence<textarea name="key" rows="5" required spellcheck="false" placeholder="Paste the complete licence from IQ Links"></textarea></label>`,
      "activate","Verify licence",boot);
    return;
  }
  gate(
    "Activate SoleNexa",
    "Enter the private activation key supplied by IQ Links to unlock this installation.",
    input("key", "Activation key", "password", "", 'autocomplete="off"'),
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
      `<label>Factory logo (optional)<input name="companyLogoFile" type="file" accept="image/png,image/jpeg,image/webp"></label><p class="hint">This logo is saved locally and can be changed later.</p>`,
    "setup-company",
    "Continue to user account",
    ownerGate,
  );
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
    document.body.classList.toggle("light", s.theme === "light");
    if (!s.activated) activationGate(s);
    else if (!s.setupComplete && !s.companyName) firstCompanyGate();
    else if (!s.setupComplete) ownerGate();
    else loginGate(s);
  } catch (e) {
    $("#main").innerHTML =
      `<div class="error">Could not start SoleNexa: ${esc(e.message)}</div>`;
  }
}
function toast(message) {
  $("#toast").textContent = message;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").textContent = ""), 5500);
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
        return `<tr><td><a href="#orders/${p.id}">${esc(p.number)}</a><small>${esc(p.article)}</small></td><td>${qty(p.quantity)}</td><td>${qty(s.finished)}${progress(s.finished, p.quantity)}</td><td>${s.finished >= p.quantity ? badge("Complete", "green") : badge(p.due < state.today ? "Overdue" : "In progress", p.due < state.today ? "amber" : "blue")}</td></tr>`;
      }),
    );
  }
  return table(
    ["PO / article", "Quantity", "Finished", "Due date", "Status", ""],
    items.map((p) => {
      const s = state.poStats[p.id];
      return `<tr><td><a href="#orders/${p.id}">${esc(p.number)}</a><small>${esc(p.article)} · ${esc(p.sku)}</small></td><td>${qty(p.quantity)} pairs</td><td>${qty(s.finished)} / ${qty(p.quantity)}${progress(s.finished, p.quantity)}</td><td>${esc(p.due)}</td><td>${s.finished >= p.quantity ? badge("Completed", "green") : badge(p.due < state.today ? "Overdue" : "In production", p.due < state.today ? "amber" : "blue")}</td><td><a href="#orders/${p.id}">Open →</a></td></tr>`;
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
    `<div class="metrics">${metric("Open production orders", open.length, `${qty(open.reduce((s, p) => s + p.quantity - state.poStats[p.id].finished, 0))} pairs to finish`, "orders")}${metric("Finished stock", qty(finished), "Pairs available for dispatch", "inventory")}${metric("Labour payable", money(payable), `${state.worker.length} workers & staff`, "workers")}${metric("Low-stock materials", low.length, "At or below reorder level", "materials")}</div><div class="grid"><div>${panel("Production overview", state.po.length ? orderRows(state.po.toReversed().slice(0, 6)) : empty("Your first production run starts here", "Add materials and a cost sheet, then create your first PO.", btn("Add raw material", "material", "", true)), '<a href="#orders">All orders →</a>')}${panel(
      "Recent factory activity",
      state.events.length
        ? `<div class="panel-body">${state.events
            .toReversed()
            .slice(0, 5)
            .map(
              (e) =>
                `<div class="activity">${icon(["earning", "advance", "settlement", "salary", "attendance"].includes(e.kind) ? "ledger" : "production")}<div><strong>${esc(e.kind.replaceAll("-", " "))}</strong> · ${esc(find("worker", e.target)?.name || find("material", e.target)?.name || find("po", e.target)?.number || "Work receipt")}<small>${esc(e.data.note || e.data.type || "Recorded")} · ${e.date}</small></div></div>`,
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
    )}${panel("Reports & exports", `<div class="panel-body"><p>Owner ke liye factory activity, staff accounts aur stock ka PDF export.</p><div class="actions">${btn("Daily report PDF", "report-daily", "", true)}${btn("Weekly report PDF", "report-weekly")}${btn("Monthly report PDF", "report-monthly")}</div></div>`)}${panel("Saturday settlement", `<div class="panel-body"><p>Review accepted work and daily attendance before paying your team.</p><p class="muted">Advance recoveries are shown separately from cash payments.</p><a href="#ledger">Open labour accounts →</a></div>`)}</div></div>`
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
            ],
            items.map(
              (m) =>
                `<tr><td><strong>${esc(m.name)}</strong></td><td>${esc(m.unit)}</td><td>${money(m.rate)}</td><td>${qty(state.stocks[m.id])} ${esc(m.unit)}</td><td>${qty(m.reorder)}</td><td>${state.stocks[m.id] <= m.reorder ? badge("Low stock", "amber") : badge("In stock", "green")}</td></tr>`,
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
        ["Date", "Material", "Movement", "Quantity", "Reference"],
        state.events
          .filter((e) => e.kind === "stock")
          .toReversed()
          .slice(0, 100)
          .map(
            (e) =>
              `<tr><td>${e.date}</td><td>${esc(find("material", e.target)?.name)}</td><td>${esc(e.data.type)}</td><td>${qty(e.data.quantity)} ${esc(find("material", e.target)?.unit)}</td><td>${esc(e.data.note)}<small>${esc(find("po", e.data.poId)?.number || "")}</small></td></tr>`,
          ),
      ),
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
          return `<tr><td><strong>${esc(find("worker", a.workerId)?.name)}</strong><small>${esc(find("department", a.departmentId)?.name)}</small></td><td>${esc(find("po", a.poId)?.number)}</td><td>${qty(a.quantity)} ${a.unit}</td><td>${qty(accepted)} / ${qty(a.quantity)}</td><td>${a.basis === "piece" ? money(a.rate) : esc(a.basis)}</td><td><div class="actions">${accepted < a.quantity ? btn("Receive", "receipt", a.id) : badge("Complete", "green")}${btn("Slip", "print-assignment", a.id)}</div></td></tr>`;
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
      `<div class="metrics">${metric("Order quantity", qty(p.quantity), "Pairs", "orders")}${metric("Cost / pair", money(p.costSnapshot.total), "At order creation", "costs")}${metric("Estimated PO cost", money(p.costSnapshot.total * p.quantity), "Materials + labour + overhead", "costs")}${metric("Finished", qty(s.finished), `${qty(s.available)} pairs on hand`, "inventory")}</div><div class="grid">${panel("Department progress", `<div class="panel-body">${s.departments.map((d) => `<div class="department"><div><strong>${esc(d.name)}</strong><small>${qty(d.assigned)} pairs assigned · ${qty(p.quantity - d.assigned)} unassigned</small></div><div>${qty(d.accepted)} / ${qty(p.quantity)} accepted${progress(d.accepted, p.quantity)}</div></div>`).join("")}</div>`)}${panel("Order notes", `<div class="panel-body"><p>${esc(p.notes || "No size / colour notes added.")}</p><small>Quantities are pairs. Pcs assignments use an explicit pieces-per-pair conversion.</small></div>`)}</div>` +
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
            ],
            filtered(state.worker).map(
              (w) =>
                `<tr><td><strong>${esc(w.name)}</strong><small>${esc(w.phone || "No phone recorded")}</small></td><td>${badge(w.basis)}</td><td>${money(w.rate)}<small>per ${w.basis === "salary" ? "month" : w.basis === "daily" ? "day" : "assignment unit"}</small></td><td>${money(state.balances[w.id].advanceDue)}</td><td>${money(state.balances[w.id].payable)}</td><td><a href="#ledger/${w.id}">Account →</a></td></tr>`,
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
    rows,
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
                  "",
                ],
                l.rows.map(
                  (e) =>
                    `<tr><td>${e.date}</td><td>${badge(e.kind)}</td><td>${esc(e.data.note)}</td><td>${["earning", "attendance", "salary"].includes(e.kind) ? money(e.data.amount) : "—"}</td><td>${e.kind === "advance" ? money(e.data.amount) : "—"}</td><td>${e.kind === "settlement" ? money(e.data.recovery) : "—"}</td><td>${e.kind === "settlement" ? money(e.data.amount) : "—"}</td><td>${e.kind === "settlement" ? btn("Slip", "print-settlement", e.id) : ""}</td></tr>`,
                ),
              )
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
      "Receive completed pairs into stock, then record shop or customer dispatches.",
      btn("Dispatch pairs", "dispatch") +
        btn("Receive finished pairs", "finished", "", true),
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
        ["Date", "PO", "Movement", "Pairs", "Reference"],
        state.events
          .filter((e) => ["finished", "dispatch"].includes(e.kind))
          .toReversed()
          .map(
            (e) =>
              `<tr><td>${e.date}</td><td>${esc(find("po", e.target)?.number)}</td><td>${e.kind}</td><td>${qty(e.data.quantity)}</td><td>${esc(e.data.note)}</td></tr>`,
          ),
      ),
    )
  );
}
const securedActions=['material','cost','po','worker','assignment','receipt','stock','finished','dispatch','department','advance','attendance','salary','settlement','backup','restore'];
const can=a=>state?.permissions?.includes('*') || state?.permissions?.includes(a);
function visibleRoutes(){
 const r=state?.currentUser?.role;
 if(r==='owner') return Object.keys(labels);
 if(r==='manager') return ['dashboard','materials','costs','orders','production','workers','inventory'];
 if(r==='supervisor') return ['dashboard','orders','production'];
 if(r==='storekeeper') return ['dashboard','materials','inventory'];
 if(r==='accountant') return ['dashboard','workers','ledger'];
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
function accessPage(){return heading('Users & security','Manage factory access and review the latest 200 security and activity events.',btn('+ Add user','user-new','',true))+panel('Access register','<div id="access-content" class="panel-body" aria-live="polite">Loading access records…</div>');}
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
    (state.licence ? panel('IQ Links licence', '<div class="panel-body"><p><strong>'+esc(state.licence.customer || '')+'</strong></p><p>Device: <code>'+esc(state.licence.deviceId)+'</code></p><p>Expires: '+esc(new Date(state.licence.expiresAt).toLocaleDateString())+' · Offline access until: '+esc(new Date(state.licence.offlineUntil).toLocaleDateString())+'</p>'+btn('Import renewed licence','licence-renew')+'</div>') : '')+
    `<div class="setting">${panel("Factory appearance", `<div class="panel-body"><p>IQ Links remains the software brand. Your factory logo is used for factory identity and saved locally.</p>${btn("Day mode", "theme-light")}${btn("Night mode", "theme-dark")}</div>`)}${panel("Production departments", `<div class="panel-body"><div class="checks">${state.department.map((d) => badge(d.name)).join("")}</div>${btn("+ Add department", "department")}<p class="hint">New departments can be selected on future POs. Existing POs retain their required departments.</p></div>`)}${panel(
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
    )}${panel("Protect your factory records", `<div class="panel-body"><p>Save a backup to a USB drive regularly, especially after Saturday settlement. The backup contains all costing, production, stock and labour records.</p>${btn("Export database backup", "backup")}${btn("Restore a backup", "restore")}<p class="hint">Restoring asks for confirmation and first saves your current database as a recovery copy.</p><div id="data-path" class="hint"></div></div>`)}${panel("Shopify · Online phase", `<div class="panel-body"><p>${badge("Not connected", "amber")}</p><p>The offline edition records factory output and dispatches locally. Live Shopify orders and inventory sync will be added in the online phase.</p><small>Use your Shopify SKU as the article code where possible.</small></div>`)}</div>`
  );
}
function render() {
  const parts = location.hash.slice(1).split("/");
  route = labels[parts[0]] ? parts[0] : "dashboard";
  if (!visibleRoutes().includes(route)) route="dashboard";
  selected = parts[1] || "";
  $("#crumb").textContent = labels[route];
  $("#date").textContent = state.today;
  const brand = $("#brand-logo");
  if (brand) brand.src = "../iq-links-logo.png";
  $("#nav").innerHTML = Object.entries(labels).filter(([key])=>visibleRoutes().includes(key))
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
        if ($("#data-path"))
          $("#data-path").textContent = "Data location: " + i.dbPath;
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
      await onSave(Object.fromEntries(new FormData(e.target)));
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
function requireRecords(kind, msg) {
  if (!state[kind].length) throw Error(msg);
}
function workerSelect(basis) {
  return select(
    "workerId",
    "Worker",
    options(
      state.worker.filter((w) => !basis || w.basis === basis),
      (w) => `${w.name} · ${w.basis}`,
    ),
  );
}
function materialSelect() {
  return select(
    "materialId",
    "Material",
    options(state.material, (m) => `${m.name} (${m.unit})`),
  );
}
function poSelect(id = "") {
  return select(
    "poId",
    "Production order",
    state.po.map((p) => [p.id, `${p.number} · ${p.article}`]),
    id,
  );
}
function costLine() {
  return `<div class="line-item">${materialSelect()}${number("quantity", "Qty / pair", 1, "0.000001", 0.000001)}${number("wastage", "Waste %", 0)}${btn("Remove", "remove-line")}</div>`;
}
function form(action, id) {
  let fields = "",
    title = "",
    save = (p) => call(action, p);
  const wId = ledgerData()?.w.id;
  if (action === "department") {
    title = "Add department";
    fields = input("name", "Department name");
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
      number("labour", "Labour estimate per pair (Rs)") +
      number("overhead", "Overhead per pair (Rs)") +
      '<div class="total full"><span>Estimated cost per pair</span><strong id="cost-total">Rs 0.00</strong></div>';
    save = (p) => {
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
      `<div class="full"><h3>Required departments</h3><div class="checks">${state.department.map((d) => `<label class="check"><input type="checkbox" name="departments" value="${d.id}" checked>${esc(d.name)}</label>`).join("")}</div></div><label class="full">Size / colour breakdown and notes<textarea name="notes" placeholder="Example: Black · sizes 40–44 · 20 pairs each"></textarea></label>`;
    save = (p) => {
      p.departments = [
        ...document.querySelectorAll("[name=departments]:checked"),
      ].map((el) => el.value);
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
      number(
        "rate",
        "Piece-worker rate per selected unit (Rs)",
        state.worker[0].rate / 100,
      ) +
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
      materialSelect() +
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
      note("Supplier / reference / reason") +
      '<p class="hint full">PO is required for issues and returns. For receipts, write the supplier and invoice reference.</p>';
  }
  if (["finished", "dispatch"].includes(action)) {
    requireRecords("po", "Create a PO first.");
    title =
      action === "finished"
        ? "Receive finished pairs"
        : "Dispatch finished pairs";
    fields =
      poSelect() +
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
          state.today.slice(0, 7),
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
    total +=
      Math.round(Number($("[name=labour]").value) * 100) +
      Math.round(Number($("[name=overhead]").value) * 100);
    $("#cost-total").textContent = money(total);
  }
  if ($("#settlement-balance")) {
    const b = state.balances[$("[name=workerId]").value];
    $("#settlement-balance").innerHTML =
      `Current unpaid earnings: <strong>${money(b.payable)}</strong><br>Advance remaining: <strong>${money(b.advanceDue)}</strong>`;
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
function receiptLayout(title, body) {
  const company = state.config?.companyName || "Factory workspace";
  return `<div class="print-preview"><div class="print-brand">${state.config?.companyLogo ? `<img src="${esc(state.config.companyLogo)}" alt="Factory logo">` : ""}<div><h2>SoleNexa</h2><p>${esc(company)}<br><strong>${title}</strong></p></div></div>${body}<div class="signature">Worker / receiver signature</div><small>Generated ${state.today} · Keep this slip for your record.</small><div class="powered">Software powered by <strong>IQ Links</strong></div></div>`;
}
function printPreview(title, body) {
  const html = receiptLayout(title, body);
  $("#print-area").innerHTML = html;
  const d = $("#modal");
  d.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">Print preview · ${paper} mm</h2>${btn("Close", "close")}</div><div class="dialog-body">${html}<div class="dialog-foot">${btn("Save PDF", "pdf-now", "", true)}${btn("Print slip", "print-now")}</div></div>`;
  d.showModal();
}
function reportDoc(period) {
  const end = new Date(state.today + "T00:00:00");
  const days = period === "daily" ? 1 : period === "weekly" ? 7 : 30;
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  const fromDate = start.toISOString().slice(0, 10);
  const events = state.events.filter((e) => e.date >= fromDate && e.date <= state.today);
  const activity = events.length ? table(["Date", "Type", "Details", "Amount"], events.toReversed().map((e) => `<tr><td>${e.date}</td><td>${esc(e.kind)}</td><td>${esc(e.data?.note || e.data?.type || "Recorded")}</td><td>${["earning", "salary", "settlement", "advance"].includes(e.kind) ? money(e.data.amount) : "—"}</td></tr>`)) : `<p>No activity recorded in this period.</p>`;
  const staff = table(["Staff", "Method", "Unpaid wages", "Advance due"], state.worker.map((w) => { const b = state.balances[w.id]; return `<tr><td>${esc(w.name)}</td><td>${esc(w.basis)}</td><td>${money(b?.payable)}</td><td>${money(b?.advanceDue)}</td></tr>`; }));
  const stock = table(["Material", "Unit", "On hand", "Reorder"], state.material.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.unit)}</td><td>${qty(state.stocks[m.id])}</td><td>${qty(m.reorder)}</td></tr>`));
  printPreview(`${period.toUpperCase()} FACTORY REPORT`, `<p>${fromDate} to ${state.today}</p><h3>Factory activity</h3>${activity}<h3>Staff accounts</h3>${staff}<h3>Raw material stock</h3>${stock}`);
}
function printDoc(action, id) {
  if (action === "print-assignment") {
    const a = find("assignment", id),
      p = find("po", a.poId);
    printPreview(
      "WORK ASSIGNMENT",
      table(
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
    if(action==='logout'){await call('logout');state=null;$('#modal').close();return boot();}
    if(action==='user-link') return showForm('Link worker login',select('workerId','Labour profile',[['','Unlink profile'],...state.worker.map(w=>[w.id,w.name])]).replace(' required','')+'<p>Only this profile’s work and account will be visible to this login.</p>',p=>call('link-worker',{...p,id}));
    if(action==='licence-renew')return showForm('Import renewed licence','<label class="full">Signed licence<textarea name="key" rows="5" required></textarea></label>',p=>call('activate',p));
    if(action==='user-new') return showForm('Create staff login',input('username','Username')+select('role','Access role',['owner','manager','supervisor','storekeeper','accountant','worker'].map(r=>[r,r]))+input('password','Password (8+ characters)','password'),p=>call('create-user',p));
    if(action==='password-self' || action==='user-reset') return showForm(action==='password-self'?'Change your password':'Reset account password',(action==='password-self'?input('currentPassword','Current password','password'):'')+input('password','New password (8+ characters)','password'),async p=>{await call(action==='password-self'?'change-password':'reset-password',{...p,id});if(action==='password-self'){state=null;setTimeout(boot,0);}});
    if(action==='user-disable' || action==='user-enable'){await call('set-user-active',{id,active:action==='user-enable'});return loadAccess();}
    if (action === "close") return $("#modal").close();
    if (action === "add-line") {
      $("#cost-lines").insertAdjacentHTML("beforeend", costLine());
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
      workerFilter = $("[name=workerFilter]").value;
      location.hash = "ledger/" + workerFilter;
      return render();
    }
    if (action === "print-now") {
      document.body.classList.toggle("paper58", paper === "58");
      el.disabled = true;
      try {
        if (window.sole) await call("print");
        else window.print();
      } finally {
        el.disabled = false;
      }
      return;
    }
    if (action === "pdf-now") {
      el.disabled = true;
      try {
        const file = await call("pdf", { paper });
        if (file) toast("PDF saved: " + file);
      } finally {
        el.disabled = false;
      }
      return;
    }
    if (["report-daily", "report-weekly", "report-monthly"].includes(action)) {
      return reportDoc(action.replace("report-", ""));
    }
    if (action === "theme-light" || action === "theme-dark") {
      const theme = action.endsWith("light") ? "light" : "dark";
      await call("theme", { theme });
      document.body.classList.toggle("light", theme === "light");
      toast(theme === "light" ? "Day mode enabled." : "Night mode enabled.");
      return;
    }
    if (action.startsWith("print-")) return printDoc(action, id);
    if (["backup", "restore"].includes(action)) {
      const result = await call(action);
      if (result) {
        await refresh();
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
    toast(error.message);
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
