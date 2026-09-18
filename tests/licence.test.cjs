const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ACTIVATION_KEY, LicenceManager, verifyLicence } = require('../desktop/licence.cjs');
const { Store } = require('../desktop/store.cjs');
const { Security } = require('../desktop/security.cjs');

function fixture(t) {
  let now = Date.now();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sole-activation-'));
  const file = path.join(dir, 'activation.json');
  const manager = new LicenceManager({ file, now: () => now });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { manager, file, now: () => now, advance: (days) => { now += days * 86400000; } };
}

test('fixed offline key activates and survives restart without a device id', (t) => {
  const f = fixture(t);
  const active = f.manager.activate(ACTIVATION_KEY, 365);
  assert.equal(active.active, true);
  assert.equal(active.validityDays, 365);
  assert.equal(Object.hasOwn(active, 'deviceId'), false);
  const restarted = new LicenceManager({ file: f.file, now: f.now });
  assert.equal(restarted.ensure().active, true);
});

test('wrong key and invalid validity periods are rejected', (t) => {
  const f = fixture(t);
  assert.throws(() => f.manager.activate('wrong-key', 365), /invalid/i);
  for (const days of [0, -1, 1.5, 3661, '']) assert.throws(() => f.manager.activate(ACTIVATION_KEY, days), /Validity days/);
});

test('expiry blocks access and the same key renews the local period', (t) => {
  const f = fixture(t);
  f.manager.activate(ACTIVATION_KEY, 1);
  f.advance(2);
  assert.equal(f.manager.status().active, false);
  assert.match(f.manager.status().reason, /expired/i);
  assert.equal(f.manager.activate(ACTIVATION_KEY, 30).validityDays, 30);
});

test('tampering and clock rollback fail closed', (t) => {
  const f = fixture(t);
  f.manager.activate(ACTIVATION_KEY, 30);
  f.advance(1);
  assert.equal(f.manager.ensure().active, true);
  f.advance(-2);
  assert.match(f.manager.status().reason, /backwards/i);
  const data = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  data.validityDays = 31;
  fs.writeFileSync(f.file, JSON.stringify(data));
  assert.match(f.manager.status().reason, /dates|validity/i);
  assert.throws(() => verifyLicence(data, f.now()), /dates|validity|backwards/i);
});

test('activation reconciles a fresh factory database before setup', (t) => {
  const f = fixture(t);
  f.manager.activate(ACTIVATION_KEY, 365);
  const store = new Store(':memory:');
  t.after(() => store.close());
  const security = new Security(store, f.now, f.manager);
  assert.equal(store.config().activated, false);
  assert.equal(security.run('status').activated, true);
  assert.doesNotThrow(() => security.run('setup-company', { companyName: 'Fresh Factory', owner: 'Owner', pin: '123456', pinConfirm: '123456' }));
});
