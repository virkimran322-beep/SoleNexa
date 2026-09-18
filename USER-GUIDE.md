# SoleNexa — factory pilot guide

## Install on Windows
1. Copy `release/SoleNexa Setup 0.2.3.exe` to the factory computer. The installer is an assisted Windows wizard with IQ Links/SoleNexa branded artwork.
2. Run the installer, choose the location, and open the SoleNexa desktop shortcut. If Windows blocks the installer, use the portable `.exe` in the release folder; it runs without an installation step.
3. The packaged build targets Windows 10/11 64-bit. No Node.js, development tools or internet are needed on the factory computer. Windows may identify the publisher as unknown because the pilot build is unsigned; code signing with an IQ Links certificate is required for a trusted publisher warning to disappear.
4. Start with a small trial order and verify your printer and payment rules before entering live factory accounts.

## First launch and access
1. Every installation opens with the animated **Software powered by IQ Links** splash screen.
2. Enter the fixed IQ Links activation key `IQ-LINKS-OWNER-2026` and the validity days for the package (1–3660). Every new laptop must be activated once; no internet or Device ID is required.
3. Enter factory name, owner/responsible person, contact, address and optional factory logo. IQ Links remains the application brand; the factory logo is used for factory identity and can be used on future print documents.
4. Create the first Owner username and password. Passwords are stored as one-way hashes.
5. Sign in. Owner can create Owner, Manager, Supervisor, Storekeeper, Accountant and Worker accounts. Each role only sees the screens and actions needed for its work.

The offline app stores activation locally, checks the fixed key, validity period and clock rollback, and keeps factory data on that computer. The key is intentionally simple for offline customer handover and can be discovered by a determined reverse-engineer.

The offline edition uses English throughout the app, reports and print previews. Factory name, owner, contact and address are shown exactly as saved.

For worker completion, print the assignment slip from Work assignments. The slip contains an offline QR code. A keyboard-wedge QR scanner connected to the Windows laptop can scan the returned slip; SoleNexa verifies the assignment, posts the outstanding quantity as accepted once, and opens a worker completion receipt. Partial or rejected quantities must continue through the manual Receive action.

The installer does not contain test data. Your data is saved under the Windows user's application-data directory, not beside the executable. Settings shows the exact database path. Keep using the same Windows account. After the first successful sign-in, SoleNexa remembers only that account's local ID—not its password—so closing/reopening normally needs only the factory PIN. Use **Sign out** when another person needs to sign in; this clears the remembered account and asks for username/password again.

## Daily workflow (Roman Urdu)
1. **Raw materials → Add material:** leather, sole, adhesive waghera ka naam, unit (kg/yard/pcs), rate aur low-stock threshold enter karein. Rate material ki isi unit ka hai.
2. **Stock movement → Receive:** opening stock ya supplier se aane wali quantity enter karein. Supplier list se supplier choose karne par quantity × current material rate us supplier ke payable account mein automatically add hota hai; internal/opening stock ke liye supplier blank rakhein. Reference mein supplier/invoice likhein. Costing banana khud stock issue nahi karta.
3. **Suppliers & purchases → Add supplier:** supplier ka naam, contact aur address save karein. **Record purchase** mein invoice number, received material, quantity aur actual rate enter karein; har line raw-material stock mein receive hoti hai aur payable supplier account mein add hoti hai.
4. **Suppliers & purchases → Return:** purchase select karke material aur returned quantity dein. Return current stock se zyada nahi ho sakta; stock aur supplier payable dono reduce hote hain. **Supplier payment** outstanding payable se zyada record nahi ho sakti.
5. **Costing sheets → New cost sheet:** article aur SKU, har material ki one-pair consumption aur waste %, labour estimate aur overhead enter karein. Total per-pair cost live nazar aayegi. Saved sheet aur PO costing historical snapshot hain.
6. **Workers & staff → Add worker:** piece/daily/salary basis, rate aur opening advance enter karein. Piece rate assignment ke waqt change kar sakte hain. Daily rate per day aur salary per full month hai. Daily/salary worker ko assignment dete waqt piece-rate field disabled hoti hai; unki earning attendance ya completed-month salary se hi banti hai.
7. **Production orders → Create production order:** cost sheet select karein, e.g. 100 pairs, due date aur required departments choose karein. Optional size/colour lines add karein; agar lines add hon to unka total PO pairs ke barabar hona zaroori hai. Notes mein extra packing detail likhein. Yahan PO se murad factory production order hai.
8. **Work assignments → Assign work:** PO, department, worker aur quantity dein. 100 pairs ke Upper mein 40 pairs Ali ko dene ke baad 60 pairs us department mein baqi hain. Bottom ka apna separate allocation hai. Pcs use karte waqt pieces-per-pair set karein (normally 2).
9. **Slip:** assigned quantity aur rate ki thermal slip review karke print karein. Assignment bill potential amount hai; earned wages accepted output par banti hain.
10. **Receive:** worker se accepted aur rejected quantities record karein. Rejected work outstanding rehta hai; rework ke baad accepted quantity record karein. Usse pehle payment earn nahi hoti.
11. **Raw material stock:** material PO ko issue karein; bacha hua material Return from PO se wapas karein. Physical stock ki correction ke liye adjustment aur reason enter karein.
12. **Finished inventory:** sab required departments ka accepted work complete hone par ready pairs receive karein. Variant PO mein size/colour stock bin select karke finished pairs receive ya dispatch karein; legacy PO mein Whole PO mode use hota hai. Dispatch available stock se zyada nahi ho sakta.
13. **Barcode label:** variant stock table mein **Preview label** se SKU-size-colour ka Code 39 label preview karein. Existing preview se Save PDF ya Print slip use kar sakte hain; scanner aur physical paper acceptance factory hardware par verify hogi.

## Saturday and monthly accounts
- Daily worker: Attendance mein full day, half day ya absent enter karein. Worker/date duplicate allowed nahi.
- Piece worker: accepted departmental work ka earning entry khud ledger mein aata hai.
- Salary worker: month end ke baad Post salary se full month accrue karein. Duplicate month allowed nahi. Mid-month joiners, leave, overtime aur proration abhi included nahi.
- Labour accounts mein worker aur From/To dates choose karke **Apply dates** karein. Weekly Sunday–Saturday, monthly first–last day use karein.
- **Give advance** cash advance ko alag record karta hai. Advance automatically wages se nahi katta.
- **Settle account** mein actual cash payment aur advance recovery alag enter karein. Example: earned Rs 800, advance Rs 100, cash Rs 750, recovery Rs 50 → wage balance zero, advance Rs 50 baqi.
- Supplier payment ya purchase return mein galti ho to supplier activity mein **Correct** use karein. Original entry history mein rehti hai, reason/PIN ke baad compensating reversal stock aur payable ko correct karta hai.
- Payment slip immutable recorded settlement se print hoti hai. Ledger selected dates ka account aur issued work print karta hai.
- This application records your payments; it does not send money or connect to a bank.

## Thermal printer
Windows mein printer ka official driver install hona chahiye. Settings → Thermal printing mein 58/80mm choose karein; Windows print dialog mein wohi paper width set karein. Preview → Print slip opens Windows printer selection. Actual hardware margins/cutter/roll length factory printer par verify honge. Printing cancellation does not undo the saved work/payment. You can reprint its slip.

## PDF reports
Dashboard ke **Reports & exports** panel se Daily, Weekly ya Monthly report PDF save karein. Report mein factory activity, staff ke unpaid wages/advance balances aur raw-material stock shamil hota hai. Kisi bhi slip ya ledger preview mein **Save PDF** se us document ki PDF file save ki ja sakti hai. Har saved/printed document ke end par **Software powered by IQ Links** footer aata hai.

## Factory profile

Owner **Settings → Edit factory profile** se factory name, owner name, contact, address aur logo update kar sakta hai. Logo replace na karne par existing logo preserve rehta hai; **Remove current logo** se logo clear hota hai. Ye identity future screens aur print/PDF documents par apply hoti hai; historical production aur financial snapshots unchanged rehte hain.

## Factory PIN

Factory setup ke waqt owner 6-digit PIN set karta hai. App close karke dobara kholne aur 15-minute idle session expiry ke baad PIN unlock screen aati hai. Factory profile, master data, production, stock, payroll, users, backup/restore aur corrections par PIN confirmation hoti hai. Galat PIN attempts par temporary lockout lagta hai.

**Delete all factory data permanently** sirf owner Settings se use kare. Is action ke liye PIN aur exact text `DELETE ALL FACTORY DATA` type karna hota hai. Ye local factory records, users, audit history, payroll aur settings permanently clear karta hai; activation key/device licence alag rehti hai aur factory setup dobara karna hota hai.

## Backups and recovery
Settings → Export database backup. Har Saturday settlement ke baad USB/external storage par naya backup save karein. Existing backup filename overwrite nahi hota—new filename choose karein.

Restore a backup pehle database integrity, supported version, foreign-key references, record/event payloads aur migration ledger check karta hai, phir explicit confirmation mangta hai. Restore se pehle current database ki `pre-restore-<timestamp>.sqlite` copy data directory mein save hoti hai. App startup, restore aur posted changes ke baad automatic verified backup banta hai; latest 7 copies retain hoti hain aur Settings mein health/time show hota hai. App upgrade se pehle purani schema ki recovery copy `data\migration-backups` mein banti hai. Backup single SQLite file hai. Live database ko app khuli hone par manually copy na karein; in-app Export use karein.

## Pilot boundaries / next steps
- One local database per computer; multi-computer shared data is planned for the online phase.
- No live Shopify sync yet. Shopify SKU can be saved as article code; dispatch reference may contain the shop order number.
- New POs can keep a validated size/colour breakdown, and Finished inventory keeps separate planned/finished/dispatched/on-hand balances for each variant. Older POs remain at PO level. Supplier purchases can include discount, freight and tax; SoleNexa stores the resulting landed amount and rate on the purchase lines, uses the landed total for supplier payable, and uses the landed rate for returns. The final accounting valuation method (weighted average, FIFO or another approved policy) still requires accountant approval. Barcode scanning and Code 39 label preview/printing are available offline for new variant POs.
- Purchases and stock movements can optionally include a lot/batch code. When used, stock guards, purchase returns and physical counts are isolated to that lot. Leave it blank for older or untracked stock; existing records remain compatible.
- Raw stock can be reserved from a warehouse bin for a planned issue. Reserved quantity is excluded from other issues until it is consumed by an issue linked to the reservation or released by an authorized user. Reservation consume/release actions remain in the local audit history.
- Inventory also supports warehouse transfers. Choose an active source bin, destination bin, material and optional lot, then record the move. SoleNexa posts the outgoing and incoming stock events together, so a completed transfer cannot leave one side updated without the other. Reserved stock is not available for transfer.
- Material, worker and department master records can be revised with an active/inactive status. Inactive records remain in history but cannot be selected for new transactions.
- Posted records are never deleted. Owner and Manager can correct eligible stock, receipt, attendance and settlement entries with a mandatory reason; SoleNexa keeps the original and adds a linked compensating reversal. Unfinished assignments can be cancelled and safely reallocated, but assignments with received work cannot be cancelled.
- Monthly payroll is full-month only; no overtime, paid leave, deductions or tax rules.
- History screens remain local and paginate at 50 rows per page. Dashboard PDF reports support optional department, worker, PO and date-range filters; Settings provides CSV exports for materials, workers, stock, POs and ledgers.
- App uses system fonts offline. Approved logo appears in the workspace; the executable/installer uses the square SoleNexa/IQ Links launcher icon; Windows may still show Unknown Publisher until code signing is configured.
- Physical printer acceptance, factory computer acceptance and production accounting sign-off remain unchecked in IMPLEMENTATION-PLAN.md.

## Development
Node 24+ and pnpm: `pnpm install`, `pnpm start`, `pnpm test`, `pnpm dist`.
Run Electron's install script if the package manager has skipped its binary setup: `node node_modules/electron/install.js`.
`node tools/preview.cjs` starts the development browser preview at `http://127.0.0.1:4173`. Preview data is stored separately in `.preview-data/preview.sqlite`, and is excluded from the installer.
`electron . --smoke-test` runs the hidden development desktop check with isolated data and writes `artifacts/desktop-smoke.json`.

Technical implementation references: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Node SQLite](https://nodejs.org/api/sqlite.html).

## Version 0.2.0: user access
Owner: open Users & security to create owner, manager, supervisor, storekeeper, accountant or worker accounts, reset passwords and disable accounts. Password button changes your own password and signs you out. Sessions expire after 15 minutes; five failed logins lock that username for five minutes. Managers manage production and materials; supervisors issue/receive work; storekeepers manage stock; accountants manage payroll. Linked worker accounts show only their own assignments and account. Only owners can access the user/audit register and database backup/restore. Existing passwords upgrade automatically at login. Offline activation uses the fixed IQ Links key and the validity days entered at activation; renew from Settings after expiry.

## Version 0.2.1: worker portal
Owner: create a worker login in Users & security, click Link labour profile and select an existing Workers & staff record. Each profile can link to one login. Worker login shows only personal assignments, accepted quantities, unpaid earnings, advance and account history. Change profile allows unlinking. Workers cannot post or change records.

## Version 0.2.2: offline activation
Every new computer asks for `IQ-LINKS-OWNER-2026` and a validity period before setup. Settings shows the local expiry and allows the same key plus a new number of days to renew. Factory data remains stored if a period expires.

## Version 0.2.3: master-data revisions
Manager can open Raw materials or Workers & staff and choose Edit. Storekeeper can revise material values and Accountant can revise worker values. Owner can also rename departments in Settings. Enter a reason when possible. New cost sheets and future assignments use the revised values; saved cost sheets, production orders, assignments and payroll entries keep their original snapshots. History shows the before and after values for each change.
