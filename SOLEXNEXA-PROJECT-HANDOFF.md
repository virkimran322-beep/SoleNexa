# SoleNexa Project Handoff Plan

Last updated: 2026-09-15  
Project: SoleNexa  
Company branding: IQ Links  
Repository: https://github.com/virkimran322-beep/SoleNexa.git  
Latest pushed commit: `a88a95b`  
Workspace: `D:\IQ Links\SoleNexa`

## How to continue in a new chat

Attach this file in the new chat and write:

> SoleNexa project continue karo. Is handoff MD ko follow karo. Pehle current files aur git status verify karo, phir next unchecked phase implement karo. Har phase ke baad complete automated, backend, frontend, Electron UI, responsive aur release testing karo. Issues milen to fix karke dobara test karo.

New chat se project par koi negative effect nahi hona chahiye. Yeh file context ko organized rakhegi aur plan tokens kam karne mein madad karegi. New chat mein hamesha current repository files ko source of truth samjha jaye; is document ko project direction aur progress reference samjha jaye.

## Product scope

SoleNexa footwear production unit ke liye offline Windows desktop ERP hai. Factory workflow:

`Raw materials → per-pair costing → production PO → department assignments → accepted output → finished stock → dispatch → labour accounts and reports`

Factory mein configurable departments, piece/daily/salary workers, advances, weekly Saturday settlement, monthly salary, thermal slips, PDF reports, finished inventory aur Shopify SKU reference support hai. Shopify live sync abhi online phase ka kaam hai.

## Completed work

### Offline foundation

- [x] Electron desktop application with sandboxed renderer and narrow IPC bridge.
- [x] Local SQLite database with transactions, foreign keys and schema validation.
- [x] First-run activation and factory setup flow.
- [x] Factory name, owner, contact, address and optional factory logo.
- [x] Owner account creation and local sign-in.
- [x] IQ Links animated splash and powered-by branding in print documents.
- [x] Night mode and Day mode.
- [x] Windows thermal print dialog integration for 58mm and 80mm paper.
- [x] Print preview and Save PDF support.

### Factory records

- [x] Raw materials with kg, yard, pcs, meter, litre and pair units.
- [x] Material rate and low-stock threshold.
- [x] Stock receive, issue, return and adjustment movements.
- [x] Negative-stock and invalid-date protections.
- [x] Per-pair cost sheets with material wastage, labour estimate and overhead.
- [x] Production orders with quantity, due date, article, SKU and departments.
- [x] PO cost snapshots.
- [x] Configurable production departments.
- [x] Worker records with piece, daily and monthly salary basis.
- [x] Opening advances and later advances.
- [x] Department work assignment against a PO.
- [x] Pair and pcs assignment units with explicit pieces-per-pair factor.
- [x] Accepted/rejected work receipts.
- [x] Piece-worker earnings based only on accepted output.
- [x] Finished inventory receive and dispatch protection.

### Accounts and reports

- [x] Daily attendance for daily workers.
- [x] Monthly salary posting with duplicate-month protection.
- [x] Worker ledger with date filtering.
- [x] Weekly and monthly settlement workflow.
- [x] Separate cash payment and advance recovery.
- [x] Overpayment and duplicate-payment guards.
- [x] Worker assignment slip for thermal printing.
- [x] Worker account and payment slip PDF/print preview.
- [x] Daily, weekly and monthly factory PDF reports.
- [x] Database backup export.
- [x] Validated database restore with pre-restore recovery copy.

### Phase 1 security and access

- [x] Owner, Manager, Supervisor, Storekeeper, Accountant and Worker roles.
- [x] Shared backend authorization for desktop and preview.
- [x] Salted scrypt password hashing.
- [x] Legacy SHA-256 password migration after successful login.
- [x] Persistent login-attempt lockout after five failed attempts.
- [x] Fifteen-minute idle session expiry.
- [x] Account disable/enable, owner reset and self-password change.
- [x] Existing sessions invalidated after account or password changes.
- [x] Activity and login audit history.
- [x] Worker login linked to one labour profile.
- [x] Worker sees only personal assignments, accepted quantities and personal account.
- [x] Worker cannot create or change factory records.

### Device licensing

- [x] Ed25519 signed licence verification.
- [x] Licence bound to the Windows computer Device ID.
- [x] Customer, licence ID, issue date, expiry date and offline-until claims.
- [x] Copied, altered, wrong-product, wrong-device and expired licences rejected.
- [x] Clock rollback protection.
- [x] Local licence issuance database and device seat limits.
- [x] Authenticated local licensing service implementation.
- [x] Administrator issue, revoke and device-transfer operations.
- [x] Public verification key included in the app.
- [x] Private signing key and admin token excluded from GitHub and installer.
- [x] Old shared pilot key is no longer accepted by version 0.2.2+.

### Phase 2 completed item

- [x] Material, worker and department master-data editing.
- [x] Revision reason field.
- [x] Before/after revision history.
- [x] Old cost-sheet, PO and assignment snapshots remain unchanged.
- [x] New cost sheets use revised material rates.
- [x] Future assignments use revised worker rates.
- [x] Manager, Storekeeper and Accountant revision permissions.
- [x] UI edit and history dialogs.

## Current release files

- [x] [SoleNexa Setup 0.2.3.exe](D:\IQ Links\SoleNexa\release\SoleNexa Setup 0.2.3.exe)
- [x] [SoleNexa 0.2.3.exe](D:\IQ Links\SoleNexa\release\SoleNexa 0.2.3.exe)
- [x] Company metadata: IQ Links.
- [x] Product version: 0.2.3.
- [x] Portable and installer builds completed.
- [ ] Windows executable still uses the default Electron icon; a proper square IQ Links `.ico` asset is still required.
- [ ] Code-signing certificate is still required to remove the Windows Unknown Publisher warning.

## Verification completed

- [x] 27 automated Node tests pass.
- [x] Licensing alteration, copied-device, expiry, seat-limit and clock-rollback tests pass.
- [x] Security, role, password, lockout, session and worker-isolation tests pass.
- [x] Costing, assignment, receipt, inventory, stock and payroll tests pass.
- [x] Master-data revision and historical-snapshot tests pass.
- [x] Electron UI activation test passes with signed licence.
- [x] Electron UI setup, owner login and worker login pass.
- [x] Electron UI material edit and revision history dialog pass.
- [x] Unauthorized worker escalation is rejected.
- [x] Renderer has no Node.js exposure.
- [x] Activation controls have visible labels, keyboard error focus and 44px action target.
- [x] 1400px and 800px desktop overflow checks pass.
- [x] Packaged application startup smoke test passes.
- [x] Installer and portable metadata report IQ Links and version 0.2.3.
- [x] Package contains public licence verifier only; no private signing credentials.
- [ ] Clean physical factory laptop installation acceptance.
- [ ] Physical 58mm/80mm thermal printer acceptance.
- [ ] Real factory data trial and owner sign-off.

## Remaining work — recommended order

### Phase 2A — audited corrections and production controls

- [ ] Add audited correction records for wrong stock, receipt, attendance and settlement entries.
- [ ] Add cancellation/reversal instead of deleting posted records.
- [ ] Add assignment cancellation and safe reallocation for unfinished work.
- [ ] Require a reason and owner/manager authorization for financial corrections.
- [ ] Add correction history to reports and audit register.

How to implement:

1. Never delete an existing event from the database.
2. Add compensating reversal events linked to the original event ID.
3. Keep original values visible and mark the original record corrected.
4. Restrict correction actions to Owner and Manager where appropriate.
5. Add backend tests first for double reversal, over-reversal, permissions and balance preservation.
6. Add Electron UI tests for correction confirmation, reason field and audit display.

### Phase 2B — costing and management visibility

- [ ] Add department-wise labour costing to cost sheets.
- [ ] Add estimated-versus-actual PO costing report.
- [ ] Show material, labour, overhead and variance separately.
- [ ] Add production completion and rejection summaries.
- [ ] Add dashboard alerts for overdue POs, low stock and unpaid labour.

How to implement:

1. Preserve existing cost-sheet totals for old POs.
2. Store department estimates as snapshots when a PO is created.
3. Calculate actual labour from accepted output, attendance and salary entries.
4. Show estimated, actual and variance values in PDF and dashboard views.
5. Test zero-output, partial-output, rejected-output and mixed worker-basis cases.

### Phase 2C — master data and exports

- [ ] Add active/inactive status for materials, workers and departments.
- [ ] Prevent inactive records from being selected in new transactions.
- [ ] Add CSV export for materials, workers, stock, POs and ledgers.
- [ ] Add pagination for large history tables.
- [ ] Add report filters for department, worker, PO and date range.
- [ ] Add native backup/restore file-dialog acceptance on a physical computer.

### Phase 3 — factory readiness

- [ ] Test installation on a second physical Windows 10/11 x64 laptop.
- [ ] Test activation with a licence issued for that laptop's Device ID.
- [ ] Test licence renewal and expired-licence behavior without losing data.
- [ ] Test thermal printer output, paper width, margins and cutter behavior.
- [ ] Run a real small production order from material receipt to dispatch.
- [ ] Confirm payroll rules: weekly dates, salary month, overtime, leave and deductions.
- [ ] Confirm backup restoration on a separate Windows user/computer.
- [ ] Obtain factory owner sign-off before routine live use.

### Phase 4 — online and Shopify edition

- [ ] Select production hosting and domain for activation service.
- [ ] Put the licensing service behind HTTPS reverse proxy.
- [ ] Move private signing credentials to secure hosted administration.
- [ ] Enable online activation, renewal, revoke and device transfer.
- [ ] Add Shopify OAuth/token storage without putting credentials in source code.
- [ ] Import Shopify orders and map Shopify SKUs to SoleNexa articles.
- [ ] Sync finished stock and dispatches with conflict handling.
- [ ] Add off-site automatic backups and signed application updates.
- [ ] Add multi-user concurrency and shared online database rules.

## Important business rules to preserve

- PO quantities are pairs.
- Assignment can be pairs or pcs; pcs always needs an explicit pieces-per-pair factor.
- Piece-worker earning starts only on accepted output.
- Rejected output stays outstanding for rework and must not earn twice.
- Daily-worker earning comes from attendance.
- Salary worker earning comes from completed-month salary posting.
- Advances remain separate until explicit recovery is recorded.
- Cash plus recovery cannot exceed unpaid earnings.
- Stock cannot become negative on any date.
- Cost sheets and POs keep historical rate snapshots.
- Posted financial records must be corrected through audited reversals, never silently deleted.
- Worker accounts must only receive their own assignments, earnings and account history.

## Important files

- `desktop/store.cjs` — SQLite schema, business rules and transaction actions.
- `desktop/security.cjs` — authentication, roles, session rules and authorization.
- `desktop/licence.cjs` — signed device licence verification.
- `desktop/licence-public.pem` — public verification key; safe to commit.
- `licensing/issuer.cjs` — licence issuer database and signed-token generation.
- `licensing/server.cjs` — local authenticated licensing service.
- `licensing/admin.cjs` — IQ Links administrator issue/revoke commands.
- `src/app.js` — renderer UI, forms, pages and print/PDF flows.
- `src/style.css` — UI design, dark/day mode, accessibility and responsive layout.
- `tools/phase1-ui.cjs` — real Electron UI regression test.
- `tests/` — backend, security, licensing and business regression tests.
- `USER-GUIDE.md` — factory user guide.
- `IMPLEMENTATION-PLAN.md` — overall checklist.
- `PHASE-1.md` — access/security/UI phase checklist.
- `LICENSING-PLAN.md` — licensing deployment checklist.

## Required testing after every change

Run:

```text
node --test tests/*.test.cjs
node --check desktop/store.cjs
node --check desktop/security.cjs
node --check desktop/licence.cjs
node --check src/app.js
node --check tools/phase1-ui.cjs
node node_modules/electron/cli.js tools/phase1-ui.cjs
node node_modules/electron/cli.js desktop/main.cjs --smoke-test
```

For a release build:

```text
node node_modules/electron-builder/out/cli/cli.js --win nsis portable --x64
```

After building, verify the installer and portable files have the expected version, IQ Links metadata, working startup, public licence verifier and no private credentials. Do not commit `.licensing-private`, activation databases, `.license` files, SQLite data, `release` output or test artifacts.

## Licence issuance workflow

1. Customer installs the app and copies the Device ID shown on the activation screen.
2. IQ Links prepares a request using `licensing/request-example.json`.
3. On the secure IQ Links computer, issue the licence with the local administrator tool.
4. Send the generated signed `.license` text to the customer.
5. Customer pastes it into SoleNexa activation.
6. For another computer, issue a licence for that computer's own Device ID.

The private signing key is stored under `.licensing-private` and must never be sent to customers or pushed to GitHub.

## Current limitations

- Release is Windows x64. It has not been accepted on every laptop.
- Installer is unsigned, so Windows may show an Unknown Publisher warning.
- Windows executable icon is still Electron default; IQ Links branding is present inside the app, splash, printed footer and executable metadata.
- Online activation hosting is not deployed because production hosting/domain and licence policy are not yet selected.
- Shopify live synchronization is not implemented.
- Size/colour stock is currently stored through article/SKU and PO notes, not independent size-colour inventory.
- Payroll proration, overtime, leave and statutory deductions require factory policy confirmation.
- Large-history pagination and CSV exports remain future work.

## Safe continuation rule

Before implementing the next phase, inspect the current files and run the existing tests. Preserve all user data and existing snapshots. Use `apply_patch` for source edits. Update this handoff file and the relevant plan/user guide after each completed phase. Do not claim a phase complete until backend, UI, responsive, packaged and security checks pass.
