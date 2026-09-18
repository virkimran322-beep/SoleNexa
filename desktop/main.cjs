const { app, BrowserWindow, ipcMain, dialog, session, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { Store } = require("./store.cjs");
const { Security } = require("./security.cjs");
const { LicenceManager } = require("./licence.cjs");
const qrGenerator = require("../src/qrcode.js");
const paperSize = (width, format) =>
  format === "a4"
    ? { width: 210000, height: 297000 }
    : width === "58"
    ? { width: 58000, height: 250000 }
    : { width: 80000, height: 300000 };
let store, security, licence,
  win,
  currentUser = null,
  automaticBackupPath = "";
const entry = path.join(__dirname, "../src/index.html");function safeLog(event, error) {
  try {
    const dir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(dir, { recursive: true });
    const detail = error ? String(error.message || error).replace(/[\r\n]/g, " ").slice(0, 500) : "";
    fs.appendFileSync(path.join(dir, "desktop.log"), `${new Date().toISOString()} ${event}${detail ? `: ${detail}` : ""}\n`, "utf8");
  } catch {}
}
function createAutomaticBackup(database) {
  const dir = path.join(app.getPath("userData"), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const destination = path.join(dir, `auto-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
  database.backup(destination);
  const files = fs.readdirSync(dir).filter((name) => /^auto-.*\.sqlite$/.test(name)).map((name) => ({ name, time: fs.statSync(path.join(dir, name)).mtimeMs })).sort((a, b) => b.time - a.time);
  for (const file of files.slice(7)) fs.rmSync(path.join(dir, file.name), { force: true });
  return destination;
}
process.on("uncaughtException", (error) => {
  safeLog("uncaught-exception", error);
  if (app.isReady()) dialog.showErrorBox("SoleNexa error", "The application encountered an unexpected error. Your data was not intentionally deleted. Please restart SoleNexa and contact IQ Links if it continues.");
});
process.on("unhandledRejection", (error) => safeLog("unhandled-rejection", error));const smoke = process.argv.includes("--smoke-test");
if (smoke) {
  const data = app.isPackaged
    ? path.join(app.getPath("temp"), `SoleNexa-desktop-smoke-${process.pid}`)
    : path.resolve(__dirname, "../artifacts/desktop-smoke-data");
  fs.mkdirSync(data, { recursive: true });
  app.setPath("userData", data);
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      const dbPath = path.join(
        app.getPath("userData"),
        "data",
        "solenexa.sqlite",
      );
      store = new Store(dbPath);
      automaticBackupPath = createAutomaticBackup(store);
      safeLog("startup");
      licence = new LicenceManager({file:path.join(app.getPath('userData'),'activation.json')});
      security = new Security(store,Date.now,licence);
      session.defaultSession.setPermissionRequestHandler((_w, _p, cb) =>
        cb(false),
      );
      win = new BrowserWindow({
        width: 1400,
        height: 920,
        minWidth: 760,
        minHeight: 580,
        show: !smoke,
        title: "SoleNexa",
        backgroundColor: "#0d1117",
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      win.setMenuBarVisibility(false);
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (e) => e.preventDefault());
      ipcMain.handle("sole:call", async (event, action, payload) => {
        try {
          if (
            event.sender !== win.webContents ||
            event.senderFrame !== win.webContents.mainFrame ||
            event.senderFrame.url.split("#")[0] !== pathToFileURL(entry).href
          )
            throw Error("Unauthorized window.");
          if (!["info","backup","restore","print","pdf","export-csv","whatsapp-share","qr-code"].includes(action)) return {ok:true,data:security.run(action,payload)};
          security.authorize(action, payload);
          if (action === "info")
            return { ok: true, data: { dbPath, backupDir: path.dirname(automaticBackupPath), logsDir: path.join(app.getPath("userData"), "logs"), version: app.getVersion() } };

          if (action === "export-csv") {
            const kind = String(payload?.kind || "");
            const result = await dialog.showSaveDialog(win, { title: "Export SoleNexa CSV", defaultPath: `SoleNexa-${kind}-${Date.now()}.csv`, filters: [{ name: "CSV spreadsheet", extensions: ["csv"] }] });
            if (result.canceled) return { ok: true, data: null };
            fs.writeFileSync(result.filePath, security.run("export-csv", { kind }), "utf8");
            return { ok: true, data: result.filePath };
          }
          if (action === "whatsapp-share") {
            const text = String(payload?.text || "").trim();
            if (!text || text.length > 4000) throw Error("Report summary is empty or too long.");
            const phone = String(payload?.phone || "").replace(/\D/g, "");
            if (phone && !/^\d{8,15}$/.test(phone)) throw Error("Supplier WhatsApp number is invalid.");
            await shell.openExternal(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`);
            return { ok: true, data: true };
          }
          if (action === "qr-code") {
            const value = String(payload?.value || "").trim();
            if (!value || value.length > 200) throw Error("QR payload is empty or too long.");
            const qr = qrGenerator(0, "M");
            qr.addData(value);
            qr.make();
            return { ok: true, data: qr.createSvgTag(4, 0) };
          }
          if (action === "backup") {
            const result = await dialog.showSaveDialog(win, {
              title: "Save SoleNexa backup",
              defaultPath: `SoleNexa-${Date.now()}.sqlite`,
              filters: [{ name: "SoleNexa backup", extensions: ["sqlite"] }],
            });
            return {
              ok: true,
              data: result.canceled ? null : store.backup(result.filePath),
            };
          }
          if (action === "restore") {
            const result = await dialog.showOpenDialog(win, {
              title: "Choose SoleNexa backup",
              properties: ["openFile"],
              filters: [{ name: "SoleNexa backup", extensions: ["sqlite"] }],
            });
            if (result.canceled) return { ok: true, data: null };
            const source = result.filePaths[0];
            Store.validateBackup(source);
            const answer = await dialog.showMessageBox(win, {
              type: "warning",
              buttons: ["Cancel", "Restore backup"],
              defaultId: 0,
              cancelId: 0,
              message: "Replace current factory data with this backup?",
              detail:
                "Current data will first be saved beside the database as a pre-restore backup.",
            });
            if (answer.response !== 1) return { ok: true, data: null };
            const recovery = path.join(
              path.dirname(dbPath),
              `pre-restore-${Date.now()}.sqlite`,
            );
            store.backup(recovery);
            store.close();
            try {
              fs.copyFileSync(source, dbPath);
            } catch (e) {
              fs.copyFileSync(recovery, dbPath);
              throw e;
            } finally {
              store = new Store(dbPath);
              automaticBackupPath = createAutomaticBackup(store);
              safeLog("restore-complete");
              security = new Security(store, Date.now, licence);
            }
            return { ok: true, data: { recovery } };
          }
          if (action === "print") {
            return await new Promise((resolve) =>
              win.webContents.print(
                { silent: false, printBackground: false, pageSize: paperSize(payload?.paper, payload?.format) },
                (success, reason) =>
                  resolve(
                    success
                      ? { ok: true, data: true }
                      : { ok: false, error: reason || "Printing cancelled." },
                  ),
              ),
            );
          }
          if (action === "pdf") {
            const result = await dialog.showSaveDialog(win, {
              title: "Save SoleNexa PDF",
              defaultPath: `SoleNexa-${Date.now()}.pdf`,
              filters: [{ name: "PDF document", extensions: ["pdf"] }],
            });
            if (result.canceled) return { ok: true, data: null };
            const pdf = await win.webContents.printToPDF({
              printBackground: true,
              marginsType: "none",
              pageSize: paperSize(payload?.paper, payload?.format),
            });
            fs.writeFileSync(result.filePath, pdf);
            return { ok: true, data: result.filePath };
          }
          return { ok: true, data: store.command(action, payload) };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      });
      await win.loadFile(entry);
      if (smoke) {
        try {
          const result = await win.webContents.executeJavaScript(`(async()=>{
          const result=await window.sole.call('status');
          for(let i=0;i<30&&!document.querySelector('h1');i++)await new Promise(r=>setTimeout(r,100));
          return {ipc:result.ok,activated:result.data?.activated,heading:document.querySelector('h1')?.textContent,nodeExposed:typeof window.require!=='undefined'};
        })()`);
          if (
            !result.ipc ||
            result.activated !== false ||
            result.heading !== "Activate SoleNexa" ||
            !result.heading ||
            result.nodeExposed
          )
            throw Error(
              "Desktop smoke check failed: " + JSON.stringify(result),
            );
          const out = app.isPackaged
            ? path.join(app.getPath("userData"), "artifacts")
            : path.resolve(__dirname, "../artifacts");
          fs.mkdirSync(out, { recursive: true });
          fs.writeFileSync(
            path.join(out, "desktop-smoke.json"),
            JSON.stringify(result, null, 2),
          );
          console.log("Desktop smoke passed:", JSON.stringify(result));
          app.quit();
        } catch (e) {
          console.error(e);
          app.exit(1);
        }
      }
    })
    .catch((e) => {
      safeLog("startup-failed", e);
      dialog.showErrorBox("SoleNexa could not start", e.message);
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => {
    if (store) store.close();
  });
}
