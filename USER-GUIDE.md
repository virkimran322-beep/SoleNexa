# SoleNexa — factory pilot guide

## Install on Windows
1. Copy `release/SoleNexa Setup 0.2.3.exe` to the factory computer.
2. Run the installer, choose the location, and open the SoleNexa desktop shortcut. If Windows blocks the installer, use the portable `.exe` in the release folder; it runs without an installation step.
3. The packaged build targets Windows 10/11 64-bit. No Node.js, development tools or internet are needed on the factory computer. Windows may identify the publisher as unknown because the pilot build is unsigned; code signing with an IQ Links certificate is required for a trusted publisher warning to disappear.
4. Start with a small trial order and verify your printer and payment rules before entering live factory accounts.

## First launch and access
1. Every installation opens with the animated **Software powered by IQ Links** splash screen.
2. Copy the Device ID shown on screen and send it to IQ Links. Paste the signed licence supplied for that computer. A licence copied from another computer will not work.
3. Enter factory name, owner/responsible person, contact, address and optional factory logo. IQ Links remains the application brand; the factory logo is used for factory identity and can be used on future print documents.
4. Create the first Owner username and password. Passwords are stored as one-way hashes.
5. Sign in. Owner can create Owner, Manager, Supervisor, Storekeeper, Accountant and Worker accounts. Each role only sees the screens and actions needed for its work.

The app verifies IQ Links' digital signature, computer identity, licence expiry and offline access date. IQ Links' private signing key stays outside the installer and GitHub repository.

Use **Settings & backup → Factory appearance** to switch Day mode/Night mode. Night mode is the default. The app stores this preference locally.

The installer does not contain test data. Your data is saved under the Windows user's application-data directory, not beside the executable. Settings shows the exact database path. Keep using the same Windows account. Closing/reopening the app preserves your records.

## Daily workflow (Roman Urdu)
1. **Raw materials → Add material:** leather, sole, adhesive waghera ka naam, unit (kg/yard/pcs), rate aur low-stock threshold enter karein. Rate material ki isi unit ka hai.
2. **Stock movement → Receive:** opening stock ya supplier se aane wali quantity enter karein. Reference mein supplier/invoice likhein. Costing banana khud stock issue nahi karta.
3. **Costing sheets → New cost sheet:** article aur SKU, har material ki one-pair consumption aur waste %, labour estimate aur overhead enter karein. Total per-pair cost live nazar aayegi. Saved sheet aur PO costing historical snapshot hain.
4. **Workers & staff → Add worker:** piece/daily/salary basis, rate aur opening advance enter karein. Piece rate assignment ke waqt change kar sakte hain. Daily rate per day aur salary per full month hai.
5. **Production orders → Create production order:** cost sheet select karein, e.g. 100 pairs, due date aur required departments choose karein. Size/colour breakdown notes mein likhein. Yahan PO se murad factory production order hai.
6. **Work assignments → Assign work:** PO, department, worker aur quantity dein. 100 pairs ke Upper mein 40 pairs Ali ko dene ke baad 60 pairs us department mein baqi hain. Bottom ka apna separate allocation hai. Pcs use karte waqt pieces-per-pair set karein (normally 2).
7. **Slip:** assigned quantity aur rate ki thermal slip review karke print karein. Assignment bill potential amount hai; earned wages accepted output par banti hain.
8. **Receive:** worker se accepted aur rejected quantities record karein. Rejected work outstanding rehta hai; rework ke baad accepted quantity record karein. Usse pehle payment earn nahi hoti.
9. **Raw material stock:** material PO ko issue karein; bacha hua material Return from PO se wapas karein. Physical stock ki correction ke liye adjustment aur reason enter karein.
10. **Finished inventory:** sab required departments ka accepted work complete hone par ready pairs receive karein. Phir shop/customer dispatch quantity aur reference enter karein. Dispatch available stock se zyada nahi ho sakta.

## Saturday and monthly accounts
- Daily worker: Attendance mein full day, half day ya absent enter karein. Worker/date duplicate allowed nahi.
- Piece worker: accepted departmental work ka earning entry khud ledger mein aata hai.
- Salary worker: month end ke baad Post salary se full month accrue karein. Duplicate month allowed nahi. Mid-month joiners, leave, overtime aur proration abhi included nahi.
- Labour accounts mein worker aur From/To dates choose karke **Apply dates** karein. Weekly Sunday–Saturday, monthly first–last day use karein.
- **Give advance** cash advance ko alag record karta hai. Advance automatically wages se nahi katta.
- **Settle account** mein actual cash payment aur advance recovery alag enter karein. Example: earned Rs 800, advance Rs 100, cash Rs 750, recovery Rs 50 → wage balance zero, advance Rs 50 baqi.
- Payment slip immutable recorded settlement se print hoti hai. Ledger selected dates ka account aur issued work print karta hai.
- This application records your payments; it does not send money or connect to a bank.

## Thermal printer
Windows mein printer ka official driver install hona chahiye. Settings → Thermal printing mein 58/80mm choose karein; Windows print dialog mein wohi paper width set karein. Preview → Print slip opens Windows printer selection. Actual hardware margins/cutter/roll length factory printer par verify honge. Printing cancellation does not undo the saved work/payment. You can reprint its slip.

## PDF reports
Dashboard ke **Reports & exports** panel se Daily, Weekly ya Monthly report PDF save karein. Report mein factory activity, staff ke unpaid wages/advance balances aur raw-material stock shamil hota hai. Kisi bhi slip ya ledger preview mein **Save PDF** se us document ki PDF file save ki ja sakti hai. Har saved/printed document ke end par **Software powered by IQ Links** footer aata hai.

## Backups and recovery
Settings → Export database backup. Har Saturday settlement ke baad USB/external storage par naya backup save karein. Existing backup filename overwrite nahi hota—new filename choose karein.

Restore a backup pehle database integrity aur version check karta hai, phir explicit confirmation mangta hai. Restore se pehle current database ki `pre-restore-<timestamp>.sqlite` copy data directory mein save hoti hai. Backup single SQLite file hai. Live database ko app khuli hone par manually copy na karein; in-app Export use karein.

## Pilot boundaries / next steps
- One local database per computer; multi-computer shared data is planned for the online phase.
- No live Shopify sync yet. Shopify SKU can be saved as article code; dispatch reference may contain the shop order number.
- Size/colour are PO notes, not independently counted SKU stock. Supplier payable accounts and purchase-order receiving are future modules.
- Material/worker master rates and saved cost sheets currently have no edit/version UI. Use a new cost sheet for a revised recipe; master-data amendments and audited reversals are the next development step. Do not edit the database directly.
- Posted records have no delete/cancel/reassignment UI in this pilot. Review entries before saving. Erroneous live financial records require an audited correction feature before routine factory rollout.
- Monthly payroll is full-month only; no overtime, paid leave, deductions or tax rules.
- History screens currently load local records in memory (stock history shows most recent 100). Large-history pagination/report exports are future work.
- App uses system fonts offline. Approved logo appears in the workspace; the executable/installer still uses the default application icon.
- Physical printer acceptance, factory computer acceptance and production accounting sign-off remain unchecked in IMPLEMENTATION-PLAN.md.

## Development
Node 24+ and pnpm: `pnpm install`, `pnpm start`, `pnpm test`, `pnpm dist`.
Run Electron's install script if the package manager has skipped its binary setup: `node node_modules/electron/install.js`.
`node tools/preview.cjs` starts the development browser preview at `http://127.0.0.1:4173`. Preview data is stored separately in `.preview-data/preview.sqlite`, and is excluded from the installer.
`electron . --smoke-test` runs the hidden development desktop check with isolated data and writes `artifacts/desktop-smoke.json`.

Technical implementation references: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Node SQLite](https://nodejs.org/api/sqlite.html).

## Version 0.2.0: user access
Owner: open Users & security to create owner, manager, supervisor, storekeeper, accountant or worker accounts, reset passwords and disable accounts. Password button changes your own password and signs you out. Sessions expire after 15 minutes; five failed logins lock that username for five minutes. Managers manage production and materials; supervisors issue/receive work; storekeepers manage stock; accountants manage payroll. Worker accounts currently show identity only. Only owners can access the user/audit register and database backup/restore. Existing passwords upgrade automatically at login. This is still local offline activation; online device licensing is pending.

## Version 0.2.1: worker portal
Owner: create a worker login in Users & security, click Link labour profile and select an existing Workers & staff record. Each profile can link to one login. Worker login shows only personal assignments, accepted quantities, unpaid earnings, advance and account history. Change profile allows unlinking. Workers cannot post or change records.

## Version 0.2.2: device licence
Every computer shows its own Device ID before setup. IQ Links issues a digitally signed licence for that ID, customer and validity period. The previous shared pilot key is rejected. Settings shows the customer, device, expiry and offline access date; use Import renewed licence when IQ Links sends a renewal. Factory data remains stored if a licence expires.

## Version 0.2.3: master-data revisions
Manager can open Raw materials or Workers & staff and choose Edit. Storekeeper can revise material values and Accountant can revise worker values. Owner can also rename departments in Settings. Enter a reason when possible. New cost sheets and future assignments use the revised values; saved cost sheets, production orders, assignments and payroll entries keep their original snapshots. History shows the before and after values for each change.
