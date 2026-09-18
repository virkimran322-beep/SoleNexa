# SoleNexa Comprehensive Implementation Plan

This plan is derived from `COMPREHENSIVE-PRODUCT-DOCUMENTATION.md` (version 0.2.3 baseline). The attached specification is the product direction; the current repository, existing local data and passing regression suite remain the source of truth.

## Delivery rules

- SoleNexa remains an offline-first Windows desktop application. Online, Shopify and shared multi-user features stay disabled until a separate approved phase.
- Existing records, snapshots and user data must be preserved. Destructive database resets are not part of normal upgrades.
- Every item is implemented in a small, reversible slice: schema/migration, backend rules, authorization/audit, UI, documents, automated tests, UI regression and release smoke test.
- A feature is not marked complete until its acceptance criteria and relevant manual factory scenario are documented.
- Tax, statutory payroll, valuation and fiscal-close calculations remain policy-gated until the owner/accountant approves the business decisions listed below.

## Business decisions required before policy-sensitive modules

- Inventory valuation: weighted average, FIFO or another approved method.
- Fiscal year, currency, chart of accounts and cost centres.
- Supplier invoice allocation, tax, freight, discount and payment approval rules.
- Payroll cycle, overtime, leave, holidays, proration, deductions and statutory rules.
- Approval thresholds and maker-checker responsibilities.
- Supported Windows versions, printer/scanner models and physical acceptance laptop.
- Permanent offline product versus a later shared/online edition.

## Phased worklist

### Phase 0 — decisions and foundation

- [x] Baseline the current repository, local SQLite model, IPC boundary, roles, licensing and release checks.
- [x] Record the offline product boundary and preserve the current append-only correction model.
- [ ] Approve the policy decisions above before enabling accounting, tax or statutory payroll calculations.
- [ ] Create and approve representative acceptance data and screen workflows.

### Phase 1 — production safety and release readiness

- [ ] D-05: formal numbered transactional migrations with pre-upgrade recovery copy.
- [ ] D-03: restore validation for schema, references, JSON payloads, business invariants and balances.
- [ ] D-04: backup health status, scheduled/post-commit backup, retention and restore drill.
- [ ] D-02: Windows-protected encryption for sensitive local data and backup archives, with recoverable owner procedure.
- [ ] D-07: tamper-evident hash chain for high-value audit events.
- [ ] D-20: signed installer/release pipeline and clean-device/upgrade acceptance.
- [ ] Remove or isolate unused online-licensing components while retaining the approved offline activation behavior.

Exit: a clean Windows x64 device can install, activate, operate, back up, restore, upgrade and complete a small order without data loss.

### Phase 2 — inventory, quality and operational UX

- [ ] D-08: warehouse, bin, lot/batch, reservation, stock count and approval workflow.
- [ ] D-09: landed cost, freight/discount/tax policy hooks and valuation controls.
- [ ] D-10: BOM suggestions, planned-versus-actual consumption, WIP and scrap.
- [ ] D-11: incoming, in-process and final quality inspection with defect/disposition workflow.
- [ ] Production board, department queues, routing and controlled work transfer.
- [ ] D-06: normalize high-volume queries, add indexes/pagination and benchmark production-sized data.
- [ ] D-19: universal search, saved views, guided daily queues, role dashboards and approval inbox.

Exit: stock counts reconcile, production variance is explainable, and each operational role can complete its daily queue without spreadsheet workarounds.

### Phase 3 — Accounts and Finance

- [ ] Configurable chart of accounts, balanced journal engine, fiscal periods and close controls.
- [ ] Supplier invoices, allocation, payables ageing, cash/bank, expenses and reconciliation.
- [ ] Customer master, sales orders, invoices, receipts, credit notes and receivables ageing.
- [ ] Inventory/WIP/COGS postings, cost-centre/PO variance, trial balance, P&L, balance sheet and cash-flow reports.
- [ ] Attachment/evidence metadata and approval thresholds for financial documents.

Exit: an accountant can close a pilot month and reconcile operational documents to a balanced trial balance.

### Phase 4 — HR and Payroll

- [ ] Employee master, employment history, restricted documents and separation/final settlement.
- [ ] Attendance calendar, leave, holidays, shifts, overtime and approved exceptions.
- [ ] Payroll periods, calculation, approval, payment, payslip and payroll journals.
- [ ] Freeze approved periods; amend only through adjustment runs; preserve historical pay-rate snapshots.
- [ ] HR reports and worker self-service isolation.

Exit: one complete payroll period runs from approved attendance/piece work to paid payslip and reconciles to finance.

### Phase 5 — commercial and factory extensions

- [ ] Style/product lifecycle, versioned BOM/routing, samples and engineering changes.
- [ ] Customer service, dispatch evidence, returns and demand analysis.
- [ ] Machine register, maintenance and capacity planning.
- [ ] Configurable branded document templates, sequences, reprint reasons and reviewable WhatsApp/email handoff.
- [ ] Quick add, smart defaults, duplicate warnings, controlled import/export, notifications and contextual help.

### Phase 6 — shared/online edition (not part of the current offline build)

- [ ] Only after explicit approval: authenticated shared service, company/site isolation and optimistic concurrency.
- [ ] Encrypted off-site backup, monitoring, signed updates and incident response.
- [ ] Shopify OAuth/SKU mapping/order and dispatch sync with conflict rules.
- [ ] Multi-site/mobile/biometric integrations with authenticated queues and idempotency.

## First implementation slice

The first unchecked implementation item is the formal migration framework. It will:

1. Preserve the existing SQLite data model and records.
2. Introduce a numbered migration ledger and transactional runner.
3. Record the existing schema as the baseline without rewriting user data.
4. Reject newer unsupported schemas with a clear message.
5. Add tests for fresh creation, existing-version upgrade, failed migration rollback and unsupported future versions.

The next slice begins only after this slice passes the full regression and Electron smoke gates.

## Required quality gates after every slice

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

Release builds additionally require NSIS/portable metadata checks, packaged startup, no private credentials, and preservation of local AppData data.
