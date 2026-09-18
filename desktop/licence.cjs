const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ACTIVATION_KEY = "IQ-LINKS-OWNER-2026";
const DAY = 86400000;
const keyHash = (value) => createHash("sha256").update(String(value)).digest("hex");
const normalizeKey = (value) => String(value || "").trim().toUpperCase();

function validDays(value) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 3660)
    throw Error("Validity days must be a whole number from 1 to 3660.");
  return days;
}

function verifyLicence(data, now = Date.now()) {
  if (!data || typeof data !== "object") throw Error("Activation data is invalid.");
  if (data.keyHash !== keyHash(ACTIVATION_KEY)) throw Error("Activation key is invalid.");
  if (!Number.isInteger(data.validityDays) || data.validityDays < 1 || data.validityDays > 3660)
    throw Error("Activation validity is invalid.");
  for (const name of ["issuedAt", "expiresAt", "lastSeen"])
    if (!Number.isSafeInteger(data[name]) || data[name] <= 0) throw Error("Activation dates are invalid.");
  if (data.expiresAt <= data.issuedAt) throw Error("Activation dates are invalid.");
  if (data.expiresAt !== data.issuedAt + data.validityDays * DAY) throw Error("Activation dates are invalid.");
  if (data.lastSeen > now + 300000) throw Error("Clock moved backwards. Correct the computer date and time.");
  if (now >= data.expiresAt) throw Error("Activation period has expired. Enter the activation key and validity days to continue.");
  return data;
}

class LicenceManager {
  constructor({ file, now = Date.now }) { this.file = file; this.now = now; }
  read() {
    try { return JSON.parse(fs.readFileSync(this.file, "utf8")); }
    catch (e) {
      if (e.code === "ENOENT") return {};
      throw Error("Activation data could not be read. Enter the activation key again.");
    }
  }
  write(data) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }
  status() {
    try {
      const data = this.read();
      if (!data.keyHash) return { active: false, reason: "Activation required." };
      const valid = verifyLicence(data, this.now());
      if (this.now() - valid.lastSeen > 60000) this.write({ ...valid, lastSeen: this.now() });
      return { active: true, expiresAt: valid.expiresAt, validityDays: valid.validityDays };
    } catch (e) { return { active: false, reason: e.message }; }
  }
  ensure() {
    const status = this.status();
    if (!status.active) throw Error(`Activation required: ${status.reason}`);
    return status;
  }
  activate(key, days) {
    if (normalizeKey(key) !== ACTIVATION_KEY) throw Error("Activation key is invalid.");
    const validityDays = validDays(days), now = this.now(), previous = this.read();
    if (previous.lastSeen > now + 300000) throw Error("Correct the computer date and time before activating.");
    this.write({ version: 2, keyHash: keyHash(ACTIVATION_KEY), issuedAt: now, expiresAt: now + validityDays * DAY, lastSeen: now, validityDays });
    return this.ensure();
  }
}

module.exports = { ACTIVATION_KEY, LicenceManager, verifyLicence, normalizeKey };
