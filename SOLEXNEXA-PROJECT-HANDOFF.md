# SoleNexa Project Handoff Plan

Last updated: 2026-09-18
Project: SoleNexa  
Company branding: IQ Links  
Repository: https://github.com/virkimran322-beep/SoleNexa.git  
Latest pushed commit: pending current D-09 verification
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
- [x] Light-only branded interface; night mode removed.
- [x] English-only interface; Urdu language support was removed after review.
- [x] Daily, weekly and monthly reports use A4 PDF/print output, include a production-condition graph, and offer WhatsApp summary sharing from the installed desktop app.
- [x] Assignment slips include offline QR codes; scanner completion verifies the assignment, prevents duplicate scans, posts outstanding accepted work and opens a worker acknowledgement receipt.
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
- [x] Numbered transactional schema migration runner with pre-upgrade recovery copies and semantic restore validation.
- [x] Automatic verified backups after startup, restore and posted changes with seven-copy retention and Settings health status.
- [x] Warehouse/bin foundation with per-bin stock guards and reviewed stock-count variance adjustments.
- [x] Purchase landed-cost foundation: discount, freight and tax allocation, historical line valuation snapshots, landed supplier payable and landed-rate returns.
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

### Offline licensing

- [x] Fixed IQ Links activation key: `IQ-LINKS-OWNER-2026`.
- [x] Validity days required on first activation and renewal.
- [x] Activation stored locally per Windows application-data folder.
- [x] Expiry, tamper, invalid period and clock rollback checks.
- [x] Device ID, online service, private signing key and per-device licence issuance removed from the current offline runtime.
- [x] Existing factory SQLite data remains separate and is preserved when activation expires.

### Phase 2 completed item

- [x] Material, worker and department master-data editing.
- [x] Revision reason field.
- [x] Before/after revision history.
- [x] Old cost-sheet, PO and assignment snapshots remain unchanged.
- [x] New cost sheets use revised material rates.
- [x] Future assignments use revised worker rates.
- [x] Manager, Storekeeper and Accountant revision permissions.
- [x] UI edit and history dialogs.
- [x] Offline supplier register, material purchasing, linked stock receipts, purchase returns and supplier payable ledger.
- [x] Supplier invoice duplication, over-return, overpayment and inactive-supplier guards.
- [x] Structured size/colour breakdown on new production POs with exact quantity validation; existing POs remain compatible.
- [x] Independent finished-stock and dispatch balances for new size/colour PO variants; legacy PO-level stock remains compatible.
- [x] Offline Code 39 barcode label preview for new size/colour variants using the existing print/PDF flow.
- [x] Audited supplier return and supplier payment corrections with linked compensating reversals and balance preservation.
- [x] Optional fast reopen flow remembers only the last active user ID; after factory PIN, password is not requested again. Explicit sign-out clears the remembered account.
- [x] Owner-only factory profile editing for name, owner, contact, address and logo.
- [x] Six-digit factory PIN at setup, startup unlock and protected-change confirmation.
- [x] Owner-only permanent factory-data deletion with PIN and exact typed confirmation.

## Current release files

- [x] [SoleNexa Setup 0.2.3.exe](D:\IQ Links\SoleNexa\release\SoleNexa Setup 0.2.3.exe)
- [x] [SoleNexa 0.2.3.exe](D:\IQ Links\SoleNexa\release\SoleNexa 0.2.3.exe)
- [x] Company metadata: IQ Links.
- [x] Product version: 0.2.3.
- [x] Portable and installer builds completed.
- [x] Windows executable uses the square `assets/solenexa.ico` launcher icon with IQ Links blue/navy branding.
- [x] Assisted installer uses IQ Links/SoleNexa branded sidebar and header artwork (`assets/installer-sidebar.bmp`, `assets/installer-header.bmp`).
- [ ] Code-signing certificate is still required to remove the Windows Unknown Publisher warning.

## Verification completed

- [x] 53 automated Node tests pass, including a full supplier-to-payroll factory trial, automatic supplier payable and correction dependency guards.
- [x] Licensing alteration, copied-device, expiry, seat-limit and clock-rollback tests pass.
- [x] Security, role, password, lockout, session and worker-isolation tests pass.
- [x] Costing, assignment, receipt, inventory, stock and payroll tests pass.
- [x] Master-data revision and historical-snapshot tests pass.
- [x] Automated offline factory trial covers material receipt, PO issue, assignment, accepted/rejected receipt, finished stock, dispatch and settlement.
- [x] Audited stock, receipt, attendance, settlement correction and assignment cancellation tests pass.
- [x] Electron correction dialog, responsive and packaged release checks after Phase 2A changes.
- [x] Electron UI activation test passes with offline activation key and validity confirmation.
- [x] Electron UI setup, owner login and worker login pass.
- [x] Electron UI material edit and revision history dialog pass.
- [x] Reference-inspired light-first ERP dashboard UI, responsive cards, sidebar, tables and forms pass UI regression.
- [x] Dashboard “Open production” and “Create production order” shortcuts route correctly and show themed prerequisite errors.
- [x] Offline Phase 1 dashboard usability polish adds context-aware Quick Actions, a local-data safety card and 44px compact action targets without adding online dependencies.
- [x] Detailed browser QA verified fresh setup/activation, PIN recovery, fake material/stock/worker/costing/PO/assignment data, all main module routes and forms, dashboard shortcuts, profile editor, theme controls, report preview, CSV export, search empty states and revision history; fixed shared selection, costing-total, PO-detail rendering, Security-layer CSV dispatch, payload-less PIN retry, compact button hit-area, empty supplier-dialog and unfiltered purchase-return material issues found during live preview testing.
- [x] 2026-09-18 full-flow audit verified supplier invoice/payment, raw stock receive/issue, costing, PO, assignment, accepted/rejected/reworked output, piece/daily/salary earnings, advance recovery, finished stock, dispatch, filtered A4 report and role isolation on a separate QA database.
- [x] Full-flow fixes cover backup/restore PIN forwarding, false PIN-failure counting, PIN lock after idle expiry, PIN-hash response privacy, correction dependency guards, QR completion-slip scope, logo normalization, previous-month salary default, report filters and PO labour double-counting.
- [x] Documentation-driven continuation started: formal migration ledger is schema v2; existing data is preserved and failed upgrades roll back safely.
- [x] Browser-tested Stock movement → Receive stock with a Supplier selected: automatic quantity × current material rate payable preview and supplier ledger posting verified; linked correction reverses both stock and supplier payable.
- [x] Unauthorized worker escalation is rejected.
- [x] Renderer has no Node.js exposure.
- [x] Activation controls have visible labels, keyboard error focus and 44px action target.
- [x] 1400px and 800px desktop overflow checks pass.
- [x] Packaged application startup smoke test passes.
- [x] Installer and portable metadata report IQ Links and version 0.2.3.
- [x] Package contains the offline activation verifier only; no private signing credentials.
- [ ] Clean physical factory laptop installation acceptance.
- [ ] Physical 58mm/80mm thermal printer acceptance.
- [ ] Real factory data trial and owner sign-off.

## Remaining work — recommended order

### Phase 2A — audited corrections and production controls

- [x] Add audited correction records for wrong stock, receipt, attendance and settlement entries.
- [x] Add cancellation/reversal instead of deleting posted records.
- [x] Add assignment cancellation and safe reallocation for unfinished work.
- [x] Require a reason and owner/manager authorization for financial corrections.
- [x] Add correction history to reports and audit register.

How to implement:

1. Never delete an existing event from the database.
2. Add compensating reversal events linked to the original event ID.
3. Keep original values visible and mark the original record corrected.
4. Restrict correction actions to Owner and Manager where appropriate.
5. Add backend tests first for double reversal, over-reversal, permissions and balance preservation.
6. Add Electron UI tests for correction confirmation, reason field and audit display.

### Phase 2B — costing and management visibility

- [x] Add department-wise labour costing to cost sheets.
- [x] Add estimated-versus-actual PO costing report.
- [x] Show material, labour, overhead and variance separately.
- [x] Add production completion and rejection summaries.
- [x] Add dashboard alerts for overdue POs, low stock and unpaid labour.

How to implement:

1. Preserve existing cost-sheet totals for old POs.
2. Store department estimates as snapshots when a PO is created.
3. Calculate PO actual labour from accepted piece output. Show daily and salary wages as factory-wide unallocated labour until an explicit PO allocation policy exists.
4. Show estimated, actual and variance values in PDF and dashboard views.
5. Test zero-output, partial-output, rejected-output and mixed worker-basis cases.

### Phase 2C — master data and exports

- [x] Add active/inactive status for materials, workers and departments.
- [x] Prevent inactive records from being selected in new transactions.
- [x] Add CSV export for materials, workers, stock, POs and ledgers.
- [x] Add pagination for large history tables.
- [ ] Warehouse lot/batch traceability, reservations, transfers and multi-line count sheets remain future operational sub-phases.
- [x] Add report filters for department, worker, PO and date range.
- [ ] Add native backup/restore file-dialog acceptance on a physical computer.

### Phase 3 — factory readiness

- [ ] Test installation on a second physical Windows 10/11 x64 laptop.
- [ ] Test first activation with the fixed key and validity days on that laptop.
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
- `desktop/licence.cjs` — fixed-key local activation, validity and clock-rollback verification.
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
- `TECHNICAL-AUDIT.md` — Windows, installer, storage, security and deployment audit report.

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

After building, verify the installer and portable files have the expected version, IQ Links metadata, working startup, offline activation verifier and no private credentials. Do not commit `.licensing-private`, activation databases, `.license` files, SQLite data, `release` output or test artifacts.

## Licence issuance workflow

1. Customer installs the app on the factory computer.
2. Enter `IQ-LINKS-OWNER-2026` and the package validity days (1–3660).
3. Complete the factory setup and owner account.
4. On a new computer, repeat activation once; no Device ID or internet is required.

The fixed offline key is intentionally simple for handover and is not equivalent to cryptographic DRM.

## Current limitations

- Release is Windows x64. It has not been accepted on every laptop.
- Installer is unsigned, so Windows may show an Unknown Publisher warning.
- Windows executable uses the square SoleNexa/IQ Links icon; IQ Links branding is also present inside the app, splash, printed footer and executable metadata.
- Online activation hosting is not deployed because production hosting/domain and licence policy are not yet selected.
- Shopify live synchronization is not implemented.
- New POs can use independent size/colour quantity and stock bins. Older POs without structured variants remain aggregate article/SKU stock.
- Payroll proration, overtime, leave and statutory deductions require factory policy confirmation.
- History tables now paginate at 50 rows per page. Dashboard PDF reports support optional department, worker, PO and date-range filters; Settings provides CSV exports for materials, workers, stock, POs and ledgers.

## Safe continuation rule

Before implementing the next phase, inspect the current files and run the existing tests. Preserve all user data and existing snapshots. Use `apply_patch` for source edits. Update this handoff file and the relevant plan/user guide after each completed phase. Do not claim a phase complete until backend, UI, responsive, packaged and security checks pass.
