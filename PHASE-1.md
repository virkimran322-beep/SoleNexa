# Phase 1 — access, security and UI

Only verified work is checked. Zero defects cannot be guaranteed by testing.

- [x] Shared backend authorization for desktop and preview
- [x] Owner, manager, supervisor, storekeeper, accountant and worker permissions
- [x] Password hashing upgrade and legacy account migration
- [x] Account creation, disabling, owner reset and password change
- [x] Login history, mutation audit and idle session expiry
- [x] Refined navigation, account controls, access screen and day/night UI
- [x] Regression, unauthorized-access and frontend integration checks
- [x] Device-bound signed offline licensing, expiry and clock-tamper checks
- [x] Installer build and release verification for 0.2.2
- [ ] Factory laptop and physical printer acceptance
- [ ] Public HTTPS activation service deployment (local service and device registration are implemented)

UI direction: structured factory dashboard, restrained teal accent, clear tables, keyboard focus, labelled inputs and reduced motion. Python skill search runtime unavailable; use skill's documented UX defaults.

## Verification — 2026-09-15

- 25 Node tests passed, including licensing, access/security and business regression tests.
- Actual Electron UI: fresh activation, setup, owner login, user creation, worker login, denied escalation, logout and all owner pages passed.
- 1400px and 800px desktop overflow checks passed; dark screenshot visually inspected. Light screenshot captured; full visual/accessibility audit still pending.
- Fixed stale splash overlay, keyboard form submit fallback, header/footer login visibility and missing preview logo route.
- [x] Owner-controlled labour profile linking; worker sees only own assignments and account. Duplicate links rejected; unlink clears personal view.
- Signed licences are bound to one Windows device ID. Altered, copied, expired, revoked and clock-rollback cases are rejected by automated tests.
- Existing SHA-256 password accounts migrate to salted scrypt upon successful sign-in. Backup files contain account hashes and should remain private.

## 0.2.1 worker portal verification
- Owner links profile through actual Electron UI; worker signs in and opens personal screen.
- Backend tests verify cross-worker isolation, duplicate links, invalid links, forbidden self-linking and immediate unlinking.
- Preserved worker rates for authorized assignment forms while keeping payroll balances restricted.
- Public activation hosting and physical acceptance remain unchecked.
