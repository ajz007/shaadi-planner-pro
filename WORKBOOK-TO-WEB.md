# Shaadi Planner Pro workbook-to-web plan

The English v1.3.1 launch package defines the first release's planning workflows. The filled Aarav and Meera wedding is the walkthrough and the fixture for checking the web calculations. Keep the original Excel download with the blank workbook, filled workbook, Quick Start and 14-day checklist.

## Screen and behavior map

| Workbook tab | Web screen | Required behavior for the editable planner |
|---|---|---|
| Start Here | Setup and section index | Offer Upload my workbook, Start a blank wedding and Explore the sample. Show the setup sequence and link to the existing guides. |
| Dashboard | Wedding overview | Derive planned and paid totals, guest statuses, vendor balances, rooms, tasks and readiness from current records. Use the wedding timezone for due dates and countdown. |
| Settings | Wedding settings | Store the wedding name, date, city, overall budget target and family leads. Label the target separately from the sum of budget categories. |
| Functions & Events | Function list | Store ceremony, date/time, venue, owner, status, headcount estimate and function budget. Keep expected counts separate from accepted RSVPs. |
| Guest List | Guest Master | Stable ID per person, optional household, primary contact, side, RSVP, invitation and travel fields. Validate linked records when editing or deleting guests. |
| RSVP Follow-up | Household follow-ups | Select the primary guest by ID and derive current household, contact and status from Guest Master. Track next action, date and owner. |
| Accommodation | Room assignments | Link occupants by guest ID. Check occupancy, duplicates and capacity, and preserve check-in, check-out and ownership. |
| Transportation | Pickup and drop schedule | Link passengers by guest ID. Derive headcounts and contact from the current guest records, and flag unconfirmed drivers. |
| Budget vs Actual | Budget categories | Show planned amount, actual paid and remaining per category, with due dates and owners. Reconcile the workbook's existing actuals with vendor payments before combining those totals. |
| Vendor Comparison | Quotes and decisions | Compare scope, quotes and negotiated prices. Preserve the chosen vendor when moving into payment tracking. |
| Vendor Payments | Contracts and balances | Derive outstanding amount from contract value and paid amounts. Surface positive balances due within 14 days. |
| Family Responsibilities | Assigned tasks | Track owner, priority, status, progress, due date and related work. Derive open and overdue counts. |
| Wedding Timeline | Day-by-day run sheet | Sort activities by date and time, track ownership and dependencies, and export a shareable run sheet. |
| Emergency Contacts | Contact directory | Keep contacts private to organizers and produce a minimal offline list for the people running the wedding. |
| Outfits & Jewellery | Outfit and packing list | Track function, person, fitting or packing status, cost, owner and due date. |
| Gifts | Gift tracker | Track purchases, giving and receipts, with quantity × unit cost and separate status and ownership. |

Lists & Codes becomes validation data for dropdowns and room capacities. Guidance from the hidden Read Me belongs in Start Here.

## Start from Excel

Put **Upload my Shaadi Planner workbook** beside **Start a blank wedding** on Start Here. Include **Download the blank Excel planner** so people can fill it at their own pace and return to upload it. Keep **Explore the sample** available before sign-in. Use the filled sample to demonstrate the upload interaction in the clickable prototype. Accept real files only in the private organizer workspace.

1. **Choose the filled .xlsx file.** Support the English v1.3.1 launch workbook first. Identify the edition from its sheet names and headers, independent of the filename. Show a clear unsupported-version message for other layouts and add older or localized editions after testing representative files.
2. **Review the import.** Show the wedding name and per-section row counts. Report issues using the sheet name and row number, with guidance to fix the workbook and upload again. Support partially filled workbooks. Distinguish unused rows and prefilled template IDs from real records.
3. **Create the wedding.** Import records from every supported data-entry tab, including settings, functions, guests, follow-ups, accommodation, transport, budget, vendors, tasks, timeline, contacts, outfits and gifts. Preserve guest and function IDs. Resolve guest references by ID across sheets and flag missing or ambiguous matches. Rebuild calculated totals and statuses from the imported records. Preserve the workbook's wedding-level RSVP values separately from future person-by-function replies.
4. **Open the populated dashboard.** Show the imported sections and any follow-up items. Save the wedding in one transaction after confirmation. If validation or saving fails, leave the wedding uncreated. A retry of the same confirmation should return the same wedding.

For Excel-first families, retain the full workbook download and provide Excel exports from the web workspace. The first release treats upload as a way to create a wedding and export as a snapshot of the web data. Label those roles clearly. Add re-import into an existing wedding only with a preview of added, updated and conflicting rows, using stable record IDs where available. Preserve newer online RSVPs and organizer edits unless the organizer explicitly resolves a conflict.

Keep uploads private, limit file size, and parse the supported cells without executing workbook formulas or following external links. Remove temporary uploads after processing and avoid logging guest names, phone numbers or cell contents.

### Import acceptance checks

- The filled sample creates 14 guests, four functions and four room assignments, with guest links resolving across follow-ups, rooms and transport. The rebuilt dashboard shows nine confirmed guests and ₹2,87,000 paid.
- A partially filled template creates records only for populated rows. Duplicate guest IDs, missing linked guests and unsupported headers produce actionable errors before confirmation.
- Uploading and reviewing a file leaves the wedding list unchanged. Confirming once creates one wedding, and repeating the same confirmation returns it.

## Implementation order

1. **Workbook-backed preview.** Land on the filled wedding's dashboard. Make every visible workbook section navigable. Display the filled records, let users search each section and follow guest IDs from rooms, transport and follow-ups to Guest Master. Keep the sample RSVP experiment in its own workspace so its four synthetic guests cannot alter the filled planner.
2. **Clickable onboarding and editing prototype.** Design both routes to the dashboard. The blank route covers settings, adding a function and assigning a task. The workbook route covers upload, review and confirmation using the fictional sample.
3. **Private workspace and workbook migration.** Use Go and PostgreSQL. Add wedding membership and enforce it on every organizer operation. Implement editable settings, functions and family tasks, and make their dashboard summaries live. Map and save the workbook's planning records as structured data. Test workbook-created weddings before offering the migration to customers.
4. **Guest operations and exports.** Build linked Guest Master, follow-up, room and transport editing and verify that changing a guest propagates to those screens. Export guest records and operational lists for Excel.
5. **Budget, vendors and remaining trackers.** Verify dashboard formulas against the filled example. Carry over budget versus actuals, comparison and payments, followed by the timeline, contacts, outfits and gifts. Validate the differences between the workbook's overall target and category total, and its budget actuals and vendor ledger. Keep both distinctions visible until there is a confirmed reconciliation rule.
6. **Paid guest communication.** Put guest links inside the actual wedding's RSVP workflow. Use separate person-by-function invitations, no-login guest replies and organizer overrides. Test manual sharing first, then consider reminders and usage-capped messaging after validating opt-in, delivery and pricing.

The preview uses workbook values saved with the example. Time-sensitive figures such as days to wedding and upcoming payments require a defined calculation date in the editable planner. Test formula parity with a fixed date, then test with the wedding's current local date.
