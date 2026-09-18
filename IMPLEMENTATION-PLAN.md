# SoleNexa — implementation plan and progress

Status: [x] ✓ completed and checked; [ ] ✗ remaining (not complete).

Current milestone: v0.2.3 offline pilot. Live factory rollout is not yet signed off.

## Product
Offline Windows desktop software for a footwear factory with a Shopify store. Factory workflow: raw materials → per-pair costing → production PO → department/worker assignments → accepted output → finished stock → dispatch. Worker advances, attendance and payments feed worker ledgers.

## Working assumptions
- Currency PKR; factory-local calendar dates. Production orders are called PO here, distinct from supplier purchases.
- PO quantities are pairs. A department assignment explicitly records pairs or pcs and pieces-per-pair (default 2); capacity is checked in pairs. Departments are configurable: Upper, Bottom, Insole, Heel, Finishing.
- Piece workers earn on accepted output, not on issuance. Each assignment snapshots its rate. Receipt tracks accepted, rejected and remaining quantity. Rejected work can be reworked; it does not earn twice.
- Daily workers earn from dated attendance at the rate captured that day. Weekly settlement ends Saturday. Monthly salaries use one explicit full-month accrual; attendance/proration policy requires factory confirmation before partial-month salaries are supported.
- Advances are separate from earnings; recovery is explicit, never automatically all deducted. Payments cannot exceed accrued unsettled earnings less recovery. Ledger entries are append-only.
- Material costing supports kg, yard, pcs and other configured units; consumption uses the material's own unit. No implicit kg↔yard conversion. Costing includes material wastage, an aggregate labour allowance and overhead per pair. PO cost is snapshotted. Department-by-department cost estimates are a follow-up.
- Actual stock changes only through receipts, PO issues, returns, adjustments and finished output/dispatch. Costing and assigning work alone do not consume stock.
- Local computer access controls protect the first single-operator build. Multi-user permissions and network use are a separate phase.
- Shopify connection, bidirectional stock sync and conflict handling belong to the later online phase; no credentials are required for this offline release.

## Delivery steps
### 1. Planning and design
- [x] Gather factory workflow and select logo.
- [x] Read supplied GitHub visual reference and UI/UX Pro Max skill.
- [x] Define workflow assumptions, data boundaries and this progress checklist.
- [x] Save desktop design rules and reference in project.

### 2. Offline foundation
- [x] Electron desktop shell with sandboxed renderer and narrow IPC bridge.
- [x] Local SQLite database with transactions, foreign keys and schema version.
- [x] Formal transactional schema migration ledger with pre-upgrade recovery copy and unsupported-version protection.
- [x] Dashboard/navigation with real empty states, no fake production data.
- [x] IQ Links animated splash, offline activation gate, first-run factory identity setup and owner sign-in.
- [x] Local user records with hashed passwords and role choices; fine-grained role enforcement remains a later iteration.
- [x] Light-only IQ Links application branding; night mode removed.
- [x] English-only UI, reports and print output.
- [x] A4 factory reports with production graph and optional WhatsApp summary handoff.

### 3. Factory records and costing
- [x] Materials with units, rates, reorder thresholds and stock ledger.
- [x] Cost sheets with per-pair material quantities, wastage, labour, overhead.
- [x] Production PO with article, size/colour notes, dates and cost snapshot.
- [x] Configurable departments; staff records and payment basis.

### 4. Production and inventory
- [x] Split department assignments against PO without over-allocation.
- [x] Accepted/rejected output and automatic piece earnings.
- [x] Raw stock receipt/issue/return/adjustment with negative stock prevention.
- [x] Finished goods receipt gated by department output; dispatch ledger.
- [x] Worker assignment slip with PO, department, quantity, unit, rate.

### 5. Labour accounts
- [x] Worker opening advances, subsequent advances and ledger.
- [x] Daily attendance with no duplicate worker/date.
- [x] Monthly salary accrual with no duplicate worker/month.
- [x] Date-range ledger, issued-work list and weekly/monthly settlement preview.
- [x] Explicit advance recovery and payment with overpayment guards.
- [x] Thermal worker account/settlement layouts and Windows print-dialog integration (58/80mm); physical output still pending.

### 6. Recovery, delivery and verification
- [x] Export backup and validated restore with pre-restore backup implemented; backup integrity/persistence covered by tests. Native restore-dialog acceptance remains below.
- [x] Restore candidates validate SQLite integrity, foreign keys, supported records, event headers/payloads and migration ledger before replacement.
- [x] Automatic verified backups run at startup, after restore and after posted changes; Settings exposes health, retention count and latest verification time.
- [x] Core tests: costing, allocation, receipts, stock, attendance, salary, settlement, persistence.
- [x] UI interaction and visual verification on desktop and narrow viewport.
- [x] Light-first blue factory ERP redesign with dashboard hero, modern cards, sidebar, tables, forms and responsive states.
- [x] Packaged Windows application and installer. `release/SoleNexa Setup 0.1.0.exe` built for Windows x64; SHA256: `302268A99A525BAD44527BFCBA7D671075DFACF12C630BE3048CDB7AE4D9BD14`.
- [x] User guide with setup, workflow, backup and known limitations.
- [x] Technical audit report covering Windows compatibility, installer, protected storage, backups, isolation and deployment.
- [ ] Factory acceptance on actual computer and thermal printer (requires hardware).

### 7. Next offline iteration — before routine live use
- [x] Master-data editing/rate revisions with change history.
- [x] Audited corrections, assignment cancellation/reallocation and transaction reversals.
- [x] Automated offline factory trial from material receipt through dispatch and Saturday settlement.
- [x] Department-wise labour costing and estimated-versus-actual PO costing report.
- [x] Daily, weekly and monthly factory PDF reports covering activity, staff accounts and raw-material stock.
- [x] Large-history pagination, CSV exports and report filters for department, worker, PO and date range.
- [x] Dedicated square app icon added; code-signing certificate is still required for signed distribution.
- [ ] Native backup/restore dialogue acceptance, factory data trial and payroll policy confirmation.

### Later stages — not part of first offline release
- [x] Offline supplier purchasing, accounts payable, purchase returns and supplier CSV exports.
- [x] Landed-cost foundation: purchase discount, freight and tax are allocated to line-level historical valuation snapshots; supplier payable and returns use the landed total/rate.
- [x] Optional lot/batch traceability on purchases, stock movements, returns and reviewed stock counts; legacy untracked stock remains compatible.
- [x] Offline stock reservations with reservation-aware issue guards and audited consume/release events.
- [x] Offline warehouse transfers between active bins with atomic linked stock events, lot support and reserved-stock protection.
- [x] Multi-line offline stock count sheets with duplicate-line guards, stale-stock checks and atomic approval adjustments.
- [x] Offline inventory valuation policy with accountant approval, weighted-average/FIFO reports and closed-period backdate protection.
- [ ] Accountant approval and implementation of the final inventory valuation method (weighted average, FIFO or another approved policy).
- [x] Structured size/colour PO breakdown with exact pair-total validation; legacy POs remain compatible.
- [x] Independent finished-stock and dispatch bins for new PO size/colour variants; legacy PO-level stock remains compatible.
- [ ] Barcode scanning; offline Code 39 label preview/printing is implemented for new variant POs. Physical scanner acceptance remains pending.
- [ ] Permission roles, audit reversal UI, approval workflows and multi-user concurrency.
- [ ] Payroll proration, overtime, leave and statutory deductions per confirmed policies.
- [ ] Shopify order import, SKU mapping, secure token storage and online sync.
- [ ] Off-site automatic backups and signed update distribution.

## Verification log

- 2026-09-16: Phase 2A audited corrections, assignment cancellation, Electron correction dialog, responsive UI and Windows NSIS/portable build checks passed.
- 2026-09-16: Full offline supplier-to-payroll trial passed for purchase receive/return/payment, PO issue, piece accepted/rework earnings, daily attendance, completed-month salary, finished dispatch and settlement. Fixed blank supplier dialogs, invoice-aware purchase-return material selection and unnecessary piece-rate validation for daily/salary assignments; 51 automated tests pass.
- 2026-09-16: Stock movement receive now offers active suppliers with automatic quantity × material-rate payable posting, audited linked correction, and browser verification; 52 automated tests pass.
- 2026-09-16: Phase 2B department costing, PO estimated-vs-actual report, production/rejection summaries, dashboard alerts, 35-test suite, redesigned light-first Electron UI, responsive, smoke, and Windows NSIS/portable build checks passed.
- 2026-09-12: 11 automated Node tests passed, including safe database-version rejection; JavaScript syntax checks passed.
- Electron desktop smoke passed with isolated data: IPC snapshot succeeds, 5 default departments, dashboard heading rendered, Node not exposed to renderer. Result: artifacts/desktop-smoke.json.
- Browser UI walkthrough: TEST Leather (yard) → cost sheet (0.5 yard at Rs 100 + 10% waste + Rs 25 labour + Rs 10 overhead = Rs 90/pair) → 100-pair PO → TEST Ali with Rs 100 advance → 40-pair Upper assignment at Rs 20 → accepted output earns Rs 800.
- UI settlement: Rs 750 cash + Rs 50 recovery leaves zero wages payable and Rs 50 advance. Assignment and weekly work/account print previews checked.
- UI finished inventory: receive 40 pairs, dispatch 30, remaining stock 10 pairs.
- Visual checks at 1280px and 375px; fixed table-induced page overflow. No browser error logs at the inspected checkpoint.
- Browser test data resides only in .preview-data; development desktop smoke data only in artifacts. Both excluded from installer. The factory installation starts empty.
- Actual thermal printing, clean-machine installation and business acceptance have not been verified. A checked code item does not imply factory/printer acceptance.
- Installer build is unsigned; the dedicated square executable icon is included. Install and printer checks still require the factory computer.
- 2026-09-12: Installer rebuilt with IQ Links logo, animated splash, activation gate, first-run factory setup, owner account flow, local hashed-password login and Day/Night mode.
- 2026-09-12: Added visible IQ Links splash motion, powered-by footer on every print document, Save PDF export and daily/weekly/monthly factory report actions.
- 2026-09-12: Fresh preview flow verified: activation → factory name/owner/contact/address → owner account → sign in → dashboard. Wrong/empty activation is rejected. Demo data remained in preview storage only.
- 2026-09-15: Material, worker and department revisions added with before/after history and change reasons. Existing cost, PO and assignment snapshots remain unchanged. 27 automated tests and the Electron UI regression passed.

## Phase 1 update — 2026-09-15
See PHASE-1.md for verified changes and remaining acceptance work. Version 0.2.3 currently uses the owner-requested fixed offline activation key plus validity days, controlled master-data revisions and audited corrections. Public online activation, factory acceptance and printer acceptance remain pending.

- 2026-09-18: Full isolated browser and backend factory-flow audit passed with 53 automated tests. Security, correction dependency, QR receipt, report filtering, PO costing allocation, salary-month default, backup/restore PIN and profile-logo issues found during the audit were fixed.
- 2026-09-18: Added formal SQLite migration runner (current schema v2), pre-upgrade recovery copies, semantic backup validation and migration rollback/preservation tests. See `COMPREHENSIVE-IMPLEMENTATION-PLAN.md` for the documentation-driven roadmap.
