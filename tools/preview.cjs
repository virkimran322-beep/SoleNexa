// Development preview only. Uses a separate database; never factory userData.
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const { Store } = require("../desktop/store.cjs");
const {Security}=require("../desktop/security.cjs");
const {randomBytes}=require("node:crypto");
const {LicenceManager}=require("../desktop/licence.cjs");
const sessions=new Map();
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);
const store = new Store(path.join(root, ".preview-data", "preview.sqlite"));
const server = http.createServer(async (req, res) => {
  const host = `127.0.0.1:${port}`;
  if (req.headers.host !== host) {
    res.writeHead(403);
    return res.end();
  }
  if (req.method === "POST" && req.url === "/api") {
    if (req.headers.origin !== `http://${host}`) {
      res.writeHead(403);
      return res.end();
    }
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1000000) throw Error("Request too large.");
      }
      const { action, payload } = JSON.parse(body);
      let token=/(?:^|; )sole=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
      if(!sessions.has(token)) {
        token=randomBytes(24).toString('hex');
        if(sessions.size>100) sessions.delete(sessions.keys().next().value);
        sessions.set(token,new Security(store,Date.now,new LicenceManager({publicKey:fs.readFileSync(path.join(root,'desktop/licence-public.pem'),'utf8'),file:path.join(root,'.preview-data/licence.json')})));
        res.setHeader('Set-Cookie', 'sole='+token+'; HttpOnly; SameSite=Strict; Path=/');
      }
      const security=sessions.get(token);
      if (["backup", "restore", "pdf", "print"].includes(action))
        throw Error(
          "Backup and restore are available in the installed desktop app.",
        );
      const data=action==='info' ? (security.authorize(action),{dbPath:'Separate development database',version:'0.2.0'}) : security.run(action,payload);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, data }));
    } catch (e) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }
  const allowed = {
    "/": "src/index.html",
    "/index.html": "src/index.html",
    "/style.css": "src/style.css",
    "/app.js": "src/app.js",
    "/iq-links-logo.png": "iq-links-logo.png",
    "/solenexa-logo.png": "solenexa-logo.png",
  };
  const file = allowed[req.url?.split("?")[0]];
  if (!file) {
    res.writeHead(404);
    return res.end("Not found");
  }
  res.setHeader(
    "Content-Type",
    file.endsWith(".css")
      ? "text/css"
      : file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".png")
          ? "image/png"
          : "text/html",
  );
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(path.join(root, file)).pipe(res);
});
server.listen(port, "127.0.0.1", () =>
  console.log(`SoleNexa preview: http://127.0.0.1:${port}`),
);
