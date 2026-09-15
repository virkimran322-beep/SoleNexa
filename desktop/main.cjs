const { app, BrowserWindow, ipcMain, dialog, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { Store } = require("./store.cjs");
const { Security } = require("./security.cjs");
const { LicenceManager } = require("./licence.cjs");
const licensingConfig = require("./licensing-config.json");
const paperSize = (width) =>
  width === "58"
    ? { width: 58000, height: 250000 }
    : { width: 80000, height: 300000 };
let store, security, licence,
  win,
  currentUser = null;
const entry = path.join(__dirname, "../src/index.html");
const smoke = process.argv.includes("--smoke-test") && !app.isPackaged;
if (smoke) {
  const data = path.resolve(__dirname, "../artifacts/desktop-smoke-data");
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
      licence = new LicenceManager({publicKey:fs.readFileSync(path.join(__dirname,'licence-public.pem'),'utf8'),file:path.join(app.getPath('userData'),'licence.json')});
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
          if(action==='activate-online') {
            const endpoint=licensingConfig.activationUrl;
            if(!endpoint || new URL(endpoint).protocol!=='https:')throw Error('Online activation is not configured. Request a signed licence from IQ Links.');
            if(typeof payload?.code!=='string' || payload.code.length>200)throw Error('Enter an activation code.');
            const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:payload.code,deviceId:licence.deviceId}),signal:AbortSignal.timeout(15000),redirect:'error'});
            const data=await response.json();
            if(!response.ok)throw Error(data.error || 'Activation server rejected the request.');
            return {ok:true,data:security.run('activate',{key:data.token})};
          }
          if (!["info","backup","restore","print","pdf"].includes(action)) return {ok:true,data:security.run(action,payload)};
          security.authorize(action);
          if (action === "info")
            return { ok: true, data: { dbPath, version: app.getVersion() } };

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
              security = new Security(store, Date.now, licence);
            }
            return { ok: true, data: { recovery } };
          }
          if (action === "print") {
            return await new Promise((resolve) =>
              win.webContents.print(
                { silent: false, printBackground: false },
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
              pageSize: paperSize(payload?.paper),
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
          const out = path.resolve(__dirname, "../artifacts");
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
      dialog.showErrorBox("SoleNexa could not start", e.message);
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => {
    if (store) store.close();
  });
}
