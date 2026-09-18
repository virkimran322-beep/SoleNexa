# SoleNexa Technical Audit Report

Date: 2026-09-18
Product: SoleNexa 0.2.3
Company: IQ Links
Mode: Offline Windows x64 desktop application

## Executive result

The application uses a sandboxed Electron renderer, a narrow IPC bridge, SQLite with foreign keys and transactional business actions, fixed-key local activation with a selected validity period, role-based authorization, and local application-data storage. Existing factory records are not stored beside the executable and are not removed by normal uninstall.

The audited offline release is suitable for controlled factory-laptop acceptance. Physical Windows installation, thermal printing, real factory data, payroll-policy confirmation and owner sign-off remain operational acceptance steps rather than code claims.

## Findings and changes

### Factory profile editing

- The Owner can update factory name, owner, contact, address and logo from Settings.
- Profile updates are transactional and audited by the security layer; existing production, payroll and cost snapshots are not rewritten.
- An empty replacement-logo field preserves the current logo; explicit removal clears it.

### Windows and startup

- Electron packages the runtime, so Node.js or a separate VC++ runtime is not required for normal use.
- The build targets Windows x64 and uses Electron 44 with the built-in `node:sqlite` runtime.
- Renderer Node integration is disabled, context isolation and sandboxing are enabled, navigation and permission requests are denied, and only the narrow preload API is exposed.
- Startup failures now write a privacy-safe diagnostic entry and show a meaningful error dialog instead of silently crashing.
- Unexpected runtime exceptions and rejected promises are recorded without passwords, licence tokens, or customer payloads.

### Installer and upgrades

- NSIS installer is one-click disabled and allows installation-directory selection.
- Assisted NSIS pages use the SoleNexa/IQ Links square icon plus branded blue sidebar and header artwork; the installer remains a native Windows wizard.
- Desktop shortcut and Start Menu integration are enabled by electron-builder defaults.
- Existing versions can be upgraded in place; the database is outside the installation directory.
- The custom uninstall step asks for confirmation and clearly states that factory data and backups are preserved. The uninstaller does not delete the application-data database.
- Installer failures are handled by NSIS/electron-builder logs; application startup failures are recorded under the application-data logs directory.

### Data storage and recovery

The database is stored at:

`%APPDATA%\\SoleNexa\\data\\solenexa.sqlite`

Licence state is stored at:

`%APPDATA%\\SoleNexa\\activation.json`

Automatic rolling backups are stored at:

`%APPDATA%\\SoleNexa\\backups`

The application keeps the latest seven automatic startup/restore backups. Manual backups can be exported to a user-selected location from Settings. Safe diagnostic logs are stored at `%APPDATA%\\SoleNexa\\logs\\desktop.log`.

When a valid local licence is present beside a newly created or reset database, startup reconciles the database activation flag before rendering factory setup. This prevents the setup form from appearing with a false “Activate SoleNexa before factory setup” error.

Backups use SQLite `VACUUM INTO`, integrity/version/foreign-key validation, semantic record/event checks and a pre-restore recovery copy. Startup, restore and posted changes schedule verified automatic backups with a seven-copy retention policy. Settings shows the latest backup health, count and verification time. Restore requires explicit confirmation and restores the current database if the replacement copy fails. The database now has a numbered transactional migration ledger (schema v2); an existing older database receives a `migration-backups` recovery copy before upgrade, and a failed migration is rolled back.

### Authentication and isolation

The offline database stores a salted scrypt factory PIN hash. A new Security instance starts locked, so reopening the app requires the PIN before user sign-in. Protected writes verify the PIN in the backend; the renderer cannot bypass this by changing its UI. Merely requesting a PIN does not count as a failed attempt; wrong PIN entries use a persistent five-attempt lockout. Idle expiry locks the PIN again. The hash is removed from every renderer snapshot and mutation response. Permanent deletion requires Owner authorization, the PIN and the exact confirmation phrase, then resets local factory records for fresh setup while retaining local activation.

- Passwords use salted scrypt hashes; legacy SHA-256 hashes migrate after successful login.
- Five failed logins create persistent lockout; sessions expire after 15 minutes idle.
- Owner, Manager, Supervisor, Storekeeper, Accountant and Worker permissions are enforced in the shared backend path.
- Worker sessions receive only their own work and account data.
- Offline activation verifies the fixed IQ Links key, validity period, activation-file integrity fields and clock rollback; no Device ID or server is required.
- Each installed Windows user profile has a separate `%APPDATA%` database.
- The current offline product supports one factory database per Windows user/profile. It does not yet provide a factory switcher or multiple factory IDs inside one database. A separate customer/factory should use a separate Windows user/profile or separate computer until a multi-factory module is implemented.

### Secrets and deployment

The current offline build packages no private licensing credentials. Activation files, SQLite data and release output are excluded from source control. Online activation and Shopify are not enabled in this offline release.

## Test evidence

- 67/67 automated Node tests pass, including a full supplier-to-payroll factory trial, automatic supplier payable on direct stock receipt, offline purchasing, landed-cost allocation, purchase returns, lot-isolated stock/return guards, reservation consume/release guards, atomic warehouse-transfer guards, multi-line stock-count approval guards, FIFO/weighted-average valuation and period-close guards, BOM planned-versus-actual usage, scrap and WIP guards, incoming/in-process/final inspection approval guards, correction balance guards, structured size/colour PO validation, independent variant stock/dispatch guards, audited supplier corrections, QR completion/duplicate-scan guards, PIN-only fast reopen without password storage, fresh-database activation reconciliation, English-only language enforcement and Security-layer CSV dispatch.
- Browser QA also verified A4 report preview, production-condition graph, and visible WhatsApp share action. WhatsApp requires internet only when the owner explicitly chooses to open the external share page; factory data entry remains offline.
- Licensing, security, lockout, sessions, worker isolation, costing, production, stock, payroll, reversals, CSV safety, persistence and backup tests pass.
- Electron UI regression passes activation, setup, owner login, worker isolation, accessibility labels, Phase 2C controls, 800px overflow and narrow-layout checks.
- Dashboard production shortcuts now route correctly: “Open production” opens the orders page, and “Create production order” opens costing when prerequisites are missing with a clear error toast.
- Detailed browser QA on a fresh isolated fake factory database completed the material-to-dispatch workflow, setup and activation, PIN recovery, every main module route, form opening, dashboard shortcuts, profile editor, theme controls, report preview, CSV export, search empty states, revision history and validation guards. It fixed a missing active-record helper in stock/selection forms, updated the costing total calculator for department labour fields, corrected PO detail department-cost row rendering, added the missing Security-layer CSV export dispatch, made PIN retry safe for payload-less actions such as backup/restore, raised compact action hit areas to 44px, restored supplier form rendering, filtered purchase returns to the selected invoice and made piece rate optional for daily/salary assignments.
- The 2026-09-18 full-flow audit verified a Rs 10,000 supplier invoice, Rs 4,000 supplier payment, 100 kg receipt, 10 kg PO issue, a 10-pair assignment with rejected/reworked output, finished receipt, dispatch, Rs 50 advance and a fully balanced Rs 150 cash plus Rs 50 recovery settlement. Piece, daily and monthly earnings reconciled to Rs 200, Rs 1,500 and Rs 30,000 respectively.
- This audit fixed native backup/restore PIN forwarding, false PIN-failure counting, PIN lock after idle expiry, PIN-hash response exposure, QR completion-slip function scope, profile-logo normalization, completed-month salary default, report department/date filtering and duplicate PO charging of factory-wide daily/salary wages. Daily and salary wages remain visible as unallocated factory labour until a PO allocation policy is implemented.
- Warehouse/bin foundation now gives every stock movement a controlled bin (legacy movements map to Main stock), isolates negative-stock guards per bin, and supports draft → submitted → approved stock counts with audited variance events. Lot/batch, reservations and atomic transfers are implemented; multi-line count sheets remain a future sub-phase.
- Offline Phase 1 dashboard usability polish adds context-aware Quick Actions and a clear local-data safety card; no network or synchronization dependency was introduced.
- Stock receive now optionally links an active supplier and posts the automatic material-rate payable as an audited supplier-receive event; purchase-linked receipts remain unchanged to prevent double counting.
- Purchase records now preserve subtotal, discount, freight, tax, landed total, line-level landed amount and landed rate snapshots. Supplier payable is based on the landed total, and purchase returns reverse the landed rate. The Settings page keeps the final inventory valuation method visibly unconfigured until the owner/accountant approves weighted average, FIFO or another policy; no silent valuation assumption is made.
- Optional lot records now link purchase lines and stock events to a material-specific batch code. Lot-specific stock guards, returns and stock-count variance approvals preserve the legacy untracked-stock path and keep lot balances separate.
- Reservations now reserve only free stock in a bin/lot. Unreserved issues cannot consume reserved quantity; a linked issue consumes the reservation, while release creates a separate audited event. Worker snapshots exclude lot and reservation data.
- Transfers now move material between active bins in one transaction, preserve optional lot identity, and reject quantities that are reserved. The two linked transfer legs cannot be corrected independently, preventing a partial correction from unbalancing stock; a complete transfer-reversal workflow remains future work.
- Stock count sheets now support up to 200 unique material/bin/lot lines. Each line captures expected and counted quantities at creation; approval rechecks every line and posts all variances in the same transaction, so a stale line rolls back the complete approval.
- Inventory valuation now supports an Accountant-approved weighted-average or FIFO policy. The local snapshot exposes current per-material quantity, average rate and value from landed stock rates; completed inventory periods can be closed and inventory entries backdated into them are rejected.
- PO snapshots now expose BOM-based material plans and actual issue/return/scrap usage. Scrap is an explicit negative stock movement linked to a PO, protected from reserved quantities; provisional WIP is remaining material issued after returns and scrap.
- Quality inspections are separate audited records with role-based submit/approve/reject controls. They do not silently alter stock or worker receipts; operational disposition posting remains a future controlled integration step.
- The 2026-09-18 landed-cost regression covers proportional allocation, rounding residuals, supplier payable totals, landed-rate returns and historical line valuation without changing older purchase records.
- Desktop smoke test passes IPC, activation gate, sandboxed renderer and startup behavior.
- Windows x64 NSIS and portable artifacts rebuild successfully with the square SoleNexa icon and branded installer artwork.

## Installation and upgrade instructions

1. Use `SoleNexa Setup 0.2.3.exe` on the factory laptop.
2. Choose the installation folder when prompted and keep the desktop/Start Menu shortcuts enabled.
3. Do not delete `%APPDATA%\\SoleNexa` during an upgrade or uninstall if records may be needed.
4. Enter `IQ-LINKS-OWNER-2026` and the package validity days.
5. Complete factory setup and create the owner account.
6. Open Settings and confirm the displayed database, automatic-backup and log locations.

The portable executable is intended for controlled testing or USB use. It has the same application features but does not create a normal installed shortcut/uninstall entry.

## Second-laptop and multi-user conditions

A second laptop starts with a blank database because its Windows application-data folder is different. It asks for the fixed activation key and validity days before setup. To move existing records, export a validated backup on the original laptop and restore it on the new laptop. Never copy activation files casually between factories.

Different Windows users on the same laptop have separate application-data locations. They do not automatically share a factory database. Within one database, role authorization controls what each signed-in account can see and change.

## Known limitations

- Physical Windows 10/11 laptop acceptance and thermal printer output are still pending.
- The installer is unsigned and may show Unknown Publisher or be blocked by Windows Smart App Control until a trusted code-signing certificate/reputation is available.
- Payroll proration, overtime, leave and statutory deductions require factory policy confirmation.
- One offline database represents one factory per Windows user/profile; no in-app multi-factory switcher exists yet.
- Online activation, Shopify synchronization, shared online concurrency and off-site backups are not deployed.

## Recommended acceptance checklist

- Install on a clean Windows 10/11 x64 laptop.
- Confirm first activation with the fixed key and validity days.
- Create a small factory, receive material, run a PO, assign work, receive accepted/rejected output, receive finished stock, dispatch and settle labour.
- Export a manual backup, restore it under a separate Windows user, and verify the recovery copy.
- Upgrade over the installed build and verify the original database remains.
- Uninstall only after confirming the warning and verify `%APPDATA%\\SoleNexa` remains available for reinstall.
- Complete physical printer and owner sign-off before routine live use.
