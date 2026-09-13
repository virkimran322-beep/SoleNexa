# SoleNexa desktop design

The supplied GitHub design extraction is a visual reference, not a request to reproduce GitHub's marketing website. Apply dark #0d1117 canvas, #151b23 panels, #f0f6fc text, #9198a1 secondary text, #3d444d borders, green primary actions and blue links. Use the approved solenexa-logo.png unmodified with preserved proportions.

UI/UX Pro Max's initial design-system search returned a marketing hero pattern, unsuitable for factory operations. A narrower `data dense dashboard desktop` style search returned the verified Data-Dense Dashboard pattern. Use its compact readable tables, persistent navigation, summary cards, visible status labels and operational filters. The user's colour reference takes precedence over suggested palettes.

Use locally available Segoe UI/system fonts for the offline initial build. No CDN fonts or remote assets. 14–16px body text, 12px minimum metadata, tabular numerals for quantities/money. Borders 6–12px radius, 8px spacing rhythm, obvious keyboard focus. Native labelled form controls and dialog, retained field values on errors, reduced-motion support. Desktop-first, adaptable navigation and scrollable data tables on narrow windows.

Dashboard uses real data only, with a guided empty state. Separate issue/assignment from accepted output and earnings. All financial totals are PKR with two decimal places; all stock quantities show units. Open PO detail contains departmental progress and printable work slips. Ledger distinguishes advance, earning, recovery and cash payment.

Technical references: https://www.electronjs.org/docs/latest/tutorial/security and https://nodejs.org/api/sqlite.html (consulted during implementation).
