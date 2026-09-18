# Licensing implementation plan — offline edition

## Required behavior

- Each computer activates locally with the fixed IQ Links key and a selected validity period.
- Factory operations continue offline after activation within an explicitly chosen licence term.
- The app requires no server, internet connection, Device ID or customer-specific token.
- Activation data is stored in the Windows application-data folder and is separate from the factory SQLite database.
- Expiry, validity range and clock rollback are checked locally; renewal never recreates the database.
- Existing factory databases retain records during migration; replacing the licence must not recreate the database.

## Work sequence

- [ ] Confirm production hosting/account and customer licence terms.
- [x] Implement fixed-key offline activation, expiry, tamper and clock rollback tests.
- [x] Add activation status and renewal controls without Device ID UI.
- [x] Test first activation, offline restart, expired period and renewal.
- [ ] Deploy HTTPS endpoint and provision signing credentials outside source control.
- [ ] End-to-end acceptance on a second physical machine.

The current offline edition uses `IQ-LINKS-OWNER-2026` plus 1–3660 validity days. A determined reverse-engineer can inspect a client-only fixed key; this is a deliberate trade-off for simple offline customer handover. Online licensing remains a separate future product phase and is not required by the current build.
