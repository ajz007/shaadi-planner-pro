# Shaadi Planner Pro family launch

## Offer and customer flow

Sell one Family Pass at ₹2,999 for one wedding, including its functions, digital invitations, household RSVPs, family collaboration, logistics, budget and Excel export. The public showcase uses fictional data. After signing in, a customer can preview their invitation with the couple's names, wedding date and first function. This draft stays in the browser tab through checkout. The paid workspace inherits those details. A buyer with a supported Excel workbook can create their wedding through the import instead.

Razorpay checkout is tied to the signed-in workspace account. The receipt email is a contact address. A verified capture records payment and grants one Family Pass in the same transaction. One pass is consumed in the same transaction as blank creation or import confirmation. An existing pending order can be resumed from wedding setup, and a captured but unused pass appears there after sign-in. Family members can still join a wedding for free, and guests can RSVP without a login.

New Family Pass orders include the English All-in-One ZIP. Include `all-in-one-en-v1` in `SHAADI_SHOP_PRODUCTS` and use the approved S3 object at `shop/all-in-one-en-v1/Shaadi_Planner_Pro_All_in_One_English_v1.0.zip`. New pass orders are paused when the package is unavailable. Keep `complete-en-v1` and `essentials-en-v1` loaded alongside it for earlier orders with those bundles. The purchase page and receipt use the same private download link. A full refund closes download access.

## Before enabling live Family Pass orders

- [ ] Review the implemented access and refund policy with the seller before publishing the branch. Confirm the support inbox and the provider's backup retention and restore process. Use the [support workflow](#support-workflow) for postponements, deletion and refunds.
- [ ] Confirm the production website and checkout configuration in Razorpay. Subscribe the live `/api/excel/webhook` endpoint to `payment.captured` and `refund.processed`. Verify the matching secret. Confirm SES production sending in the configured region, receipt delivery to an unverified inbox and replies reaching support.
- [ ] Verify Google sign-in from a fresh account and a distinct invited family account. Verify a signed-out guest can reply to the sandbox wedding without reaching any other household's details.
- [ ] Run the staging purchase walkthrough below. Keep test-mode and live-mode passes isolated. Keep existing weddings accessible and identify any pilot accounts that need an additional grant. Use the support command below to grant complimentary passes to verified pilot accounts.
- [ ] Pilot with real families after policies and access are ready. On a phone, follow the invitation through an RSVP, a travel request and organizer review. Verify WhatsApp forwards open the correct household invitation. Keep household details out of link preview metadata. Review whether a custom preview affects sharing before adding one.
- [ ] Check the funnel from draft to checkout, payment, first invitation sent and first RSVP. Use aggregate funnel events without personal invitation details. The invitation footer points to the showcase with a campaign marker. Offer existing workbook buyers a link to the online planner and identify the supported workbook edition. Test a discount only after measuring use of that path.

## Configuration and staging walkthrough

`SHAADI_FAMILY_PASS_REQUIRED=1` enforces Family Pass creation rules for both blank and imported weddings. `SHAADI_FAMILY_PASS_ACCEPT_ORDERS=1` opens new Family Pass checkout when enforcement and the existing commerce mode are configured. Set both with Razorpay test credentials on staging. Keep the hosted test checkout code private. Once the launch checks are complete, use live credentials, set `SHAADI_FAMILY_PASS_POLICY_READY=1` and explicitly enable new orders on production. To pause new pass sales, clear only `SHAADI_FAMILY_PASS_ACCEPT_ORDERS` so return visits and already purchased passes keep working. These flags are separate from the download shop's sales switch.

1. From the showcase, sign in and confirm the personalized invitation opens. Try to create a wedding and upload an import without a pass. Confirm access is denied by the server.
2. Start checkout from two tabs and confirm they refer to the same pending order. Cancel it and return to setup. Pay in test mode and close the tab before the browser confirms. Sign back in and confirm the captured payment is available from setup. Repeated capture events must produce one pass.
3. Use the pass to create a blank wedding. Confirm the names and first function are present. From a separate account, open a family invite for that wedding without paying. Try creating a second wedding with the first account and confirm it requires a new pass.
4. Use another test pass to import the supported English workbook. Repeat import confirmation and confirm it returns the same wedding. Confirm an invalid import leaves the pass unused, and concurrent creation attempts cannot consume a single pass twice.
5. In staging, verify full refunds of an unused pass and of an activated wedding. Repeat webhook delivery. Confirm an unused pass disappears, the owner of a refunded wedding can export, and collaborator, schedule, invitation music and private RSVP links stop working. Verify an unrelated download order is unaffected.
6. On a disposable staging wedding, verify that expiry closes access before the cleanup worker deletes the live wedding. Verify an expired or removed pass cannot be used to create another wedding.
7. Open checkout as a workbook buyer without an account, confirm payment and verify the download and emailed recovery link still work independently.

## Support workflow

- **Complimentary passes.** From the intended environment, use the app's existing database and commerce mode variables and run `shaadi-planner grant-family-pass test <account-uuid> <support-case>` (or `go run ./cmd/shaadi-planner grant-family-pass test <account-uuid> <support-case>` from source). Match the explicit mode to that environment. Verify the account UUID, record approval under the support case, and keep personal details out of the case reference. Repeating the same case returns the original grant, even after it has been used. Each grant works only in its recorded mode.

- **Postponement.** Verify the requester is the owner of the paid workspace and record the support case. Before access ends, update the wedding date in the existing wedding record. The deadline follows the wedding date in its saved time zone. The organizer should review function times and issue fresh links if the original links have already expired.
- **Early deletion.** Verify ownership, offer the workbook export, and obtain explicit confirmation that the requester wants permanent removal. Use the wedding ID and verified owner account ID to select the exact record before deleting it. The database cascades the deletion to wedding data and keeps the consumed pass and order record. For a guest correction or deletion request, verify the request separately and coordinate with the organizer.
- **Refund.** The proposed policy allows requests for unused passes within seven days and review of duplicates, failed activation and service issues. After approval, issue the refund in the Razorpay dashboard and check the processed webhook. Full refunds revoke the pass. If activated, editing and all guest and collaborator access end. The owner can export until 30 days after processing or the original deadline, whichever comes first.
- **Backups.** Confirm retention and run a restore drill before enabling live orders. Keep a verified record of early deletions and ensure restored data is cleaned before a restored instance serves traffic. Avoid promising a fixed backup purge time until it has been verified.

Planner packages, an invitation-only tier and any free guest allowance can be assessed after the family pilot.
