# Licensing implementation plan — pending Phase 1 work

## Required behavior

- IQ Links issues a separate licence for each customer installation.
- Factory operations continue offline after activation within an explicitly chosen licence term.
- The app contains a public verification key only. Issuing credentials and private signing keys stay outside the app and source repository.
- A signed licence contains customer ID, installation ID, product, expiry and licence ID.
- Online activation registers a device against the installation allowance. Device transfer and revocation require an IQ Links administrator.
- Connection failures must show retry/status without deleting factory records.
- Existing factory databases retain records during migration; replacing the licence must not recreate the database.

## Work sequence

- [ ] Confirm production hosting/account and customer licence terms.
- [x] Implement signed-licence verification and tests for alteration, expiry, wrong device and clock rollback.
- [x] Implement authenticated issuance/activation service, durable device registration and administrator operations.
- [x] Add activation status, expiry and transfer instructions to desktop UI.
- [x] Test offline restart, network failure, expired licence, transferred device and concurrent activation limits.
- [ ] Deploy HTTPS endpoint and provision signing credentials outside source control.
- [ ] End-to-end acceptance on a second physical machine.

Version 0.2.2 uses signed, device-bound offline licence files and no longer accepts the shared pilot key. A hosting target and licence policy are still needed before enabling online activation. Until then, IQ Links creates a licence from the Device ID shown by the app and sends the signed licence text to the customer.
