# Shaadi Planner Pro workbook-to-web plan

The English v1.3.1 launch package defines the first release's planning workflows. The filled Aarav and Meera wedding is the walkthrough and the fixture for checking the web calculations. Keep the original Excel download with the blank workbook, filled workbook, Quick Start and 14-day checklist.

See [Current roadmap after the sample review](#current-roadmap-after-the-sample-review) for the remaining work and its proposed order.

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

## Original implementation order

1. **Workbook-backed preview.** Land on the filled wedding's dashboard. Make every visible workbook section navigable. Display the filled records, let users search each section and follow guest IDs from rooms, transport and follow-ups to Guest Master. Keep the sample RSVP experiment in its own workspace so its four synthetic guests cannot alter the filled planner.
2. **Clickable onboarding and editing prototype.** Design both routes to the dashboard. The blank route covers settings, adding a function and assigning a task. The workbook route covers upload, review and confirmation using the fictional sample.
3. **Private workspace and workbook migration.** Use Go and PostgreSQL. Add wedding membership and enforce it on every organizer operation. Implement editable settings, functions and family tasks, and make their dashboard summaries live. Map and save the workbook's planning records as structured data. Test workbook-created weddings before offering the migration to customers.
4. **Guest operations and exports.** Build linked Guest Master, follow-up, room and transport editing and verify that changing a guest propagates to those screens. Export guest records and operational lists for Excel.
5. **Budget, vendors and remaining trackers.** Verify dashboard formulas against the filled example. Carry over budget versus actuals, comparison and payments, followed by the timeline, contacts, outfits and gifts. Validate the differences between the workbook's overall target and category total, and its budget actuals and vendor ledger. Keep both distinctions visible until there is a confirmed reconciliation rule.
6. **Paid guest communication.** Put guest links inside the actual wedding's RSVP workflow. Use separate person-by-function invitations, no-login guest replies and organizer overrides. Test manual sharing first, then consider reminders and usage-capped messaging after validating opt-in, delivery and pricing.

The preview uses workbook values saved with the example. Time-sensitive figures such as days to wedding and upcoming payments require a defined calculation date in the editable planner. Test formula parity with a fixed date, then test with the wedding's current local date.

## Current roadmap after the sample review

Reviewed against the local signed-in planner and sample screens on 12 November 2026. The desktop comparison used the imported Aarav & Meera wedding as Test owner. The audit also checked how each sample reads, saves and exports data in the repository.

### What each sample demonstrates

| Surface | Purpose and behavior |
|---|---|
| **Filled workbook preview** (`#dashboard`) | Shows the filled Excel example with a grouped desktop sidebar, workbook tables, search, guest cross-links, section printing and summary cards. Several figures come from the example's saved totals. It uses the sample plan in the current browser. |
| **Alternate planner** (`#focus`) | A browser-only interaction prototype for next actions, drafting tasks, adding activities and comparing schedule overlaps. Its edits use browser storage shared with the workbook preview. |
| **Start Here walkthroughs** (`#start-here`) | Demonstrate a fictional workbook import and a three-step blank wedding setup. The blank draft is temporary. The signed-in import already validates and persists supported Excel workbooks. |
| **RSVP sandbox** (`#rsvp-sandbox`) | The screen titled **Wedding guest coordination** is a local development experiment. It previews and adds guests from a fixed CSV, opens a household RSVP page, allows an organizer to enter replies and exports headcounts. It uses two fixed functions, Sangeet and Reception, and in-memory records that reset when the server restarts. Its routes are enabled in loopback mode. |
| **Private planner** (`#workspace`) | The shared product. Card and Workbook views use the same saved wedding. It includes family collaboration, guest and logistics editing, function readiness and places, vendor quotes, contracts, payments and documents, and a server-generated Excel snapshot. |

The shared organizer preview is implemented locally at `#demo`. It uses bundled fictional records and the private planner's navigation, filters and Card/Workbook views. Editing, planner invitations and full Excel snapshot export require a private wedding. The public entry distinguishes this preview from the Excel example. The RSVP sandbox and alternate planner remain available as prototypes.

### Sample-to-product gaps

| Area | Current private planner | Work to add or make explicit |
|---|---|---|
| Guest import | Full English v1.3.1 Excel import creates a new wedding. Guest List supports manual creation and limited bulk editing. | **New** — Add guests from CSV into an existing wedding, with a template, preview, duplicate handling and explicit confirmation. Keep general workbook merge as a separate feature. |
| Household and guest records | Guests have a household text label, a wedding-level RSVP and links to rooms, pickups and follow-ups. The editor handles arrivals and stay/transport requirements. | **New detail** — Stable household identity, primary contact, household detail view and direct links to exact related records. Make useful workbook fields editable in stages, starting with invitation status, relationship/group, contact and departure details. Handle dietary/access needs and notes with explicit access and export rules. |
| Invitation and replies | RSVP Follow-up records a next action, owner and date. Guest List records wedding-level RSVP manually. Family invitations grant planner access to collaborators. | **Already planned, now specified** — Separate guest invitations per person and function, a no-login household reply page, manual entry on a guest's behalf, and household links that organizers can copy, expire, revoke or replace. Include a filterable reply queue and track source and last update. |
| Function headcounts | The planner shows guest RSVP totals at wedding level. Functions have readiness and required planning people, and the workbook may contain headcount estimates. | **New deliverable** — Live per-function invited, attending, awaiting reply and declined counts, with filtered attendee lists and a minimal Excel/CSV catering export. Display estimates and confirmed replies separately. |
| Today and desktop dashboard | Card overview shows basic metrics, a few open tasks and upcoming functions. Workbook overview primarily indexes sheets. | **Expanded** — Bring over the filled preview's useful cards and the alternate view's next-action queue. Link overdue tasks, pending replies, pickups needing review, function readiness and positive vendor balances due soon to the relevant records. Label imported category totals separately from live vendor payments. |
| Task capture and setup | Owners can start blank, import, create tasks and assign or reassign people. Supported text fields offer dictation. | **New workflow** — Guided first function and first task after blank creation. Add quick task capture from a pickup, RSVP follow-up or function with a reviewable draft containing the suggested assignee, due date and source. Add search and date/owner filters before bulk reassign and reschedule. |
| Functions and Wedding Timeline | Functions can be edited and have durations, saved places, required people and item checklists. Schedule Board combines saved functions and imported run-sheet rows. | **Already planned, now specified** — Add, edit and reorder live run-sheet activities, link them to functions, and give each overlap or incomplete item a direct edit link. Add an agenda for phones and a printable run sheet. Preserve unknown duration and unreviewed attendance. Keep function lead, notes, expected attendance and budget available when editing functions. |
| Logistics | Rooms and pickups have live editors. Transport already shows unassigned guests and flags arrivals that changed after pickup review. | **Expanded** — From a household, update a shared arrival with exceptions and show affected pickups. Group by arrival time and point before suggesting a shared pickup. Add room and pickup allocation previews with capacity and existing assignments, plus owner/date bulk edits for follow-ups. |
| Budget, settings and final details | Vendor workflows are live. Budget categories, imported Settings, Emergency Contacts, Outfits & Jewellery and Gifts are read-only or empty until imported. | **Already planned** — Add durable editors and blank-state actions. Start with editable settings and budget categories, then add contacts with a limited offline list, outfit/packing tasks and gifts with quantity and cost. Keep the original import in history and include authorized edits in the live Excel snapshot. |

### Proposed delivery order

1. **Shared product preview and desktop navigation — implemented locally.** The sample uses the private organizer components and isolated fictional records. The Excel example and local RSVP prototype have separate entries. The sample and signed-in planner share the grouped burgundy sidebar, active page, compact header and phone section picker. Both views use the same overview cards. Existing wedding links, Workbook columns and layout preferences carry forward.
2. **Make the live dashboard and household workflow more actionable.** Give both desktop views a useful overview, with an obvious way to reach the workbook sheets. Build the first household view around RSVP status, follow-up, room and pickup links. Start with a stable primary contact and a narrow set of organizer-facing fields. Add selected-household arrival updates and bulk follow-up reassignment with counts, exclusions and a preview of linked changes. Keep the guest list and current limited bulk edit usable during migration.
3. **Ship guest RSVP in the private workspace.** Start with existing guests. Select guests or households and choose functions from the wedding. Let the organizer copy a household link, track replies and record a phone reply. Show per-function headcounts and export the relevant counts for catering. Add CSV guest import once the matching rules can preserve existing households, invitations and replies. For repeat import, preview new, unchanged and conflicting guests and report problems by row. Treat manual sharing as the pilot. Revisit paid packaging and automated reminders after validating the workflow and consent requirements.
4. **Close the remaining planning gaps.** Build the live run sheet and link schedule conflicts directly to an editor. Add quick task drafts and bulk task reassignment, then complete editable settings, budget categories, emergency contacts, outfits and gifts. Prioritize the wedding-day views and offline exports alongside those editors so someone running the wedding can use the current plan on a phone or printed sheet.

### Acceptance checks for the new work

- Open the same fictional wedding in the product demo and signed-in test workspace. Navigation, page names, filters and Card/Workbook layouts match. No sample action can read or write a real wedding.
- On a desktop around 1,280 px wide, a page title, primary action and first useful rows appear without two competing navigation strips. Wide sheets scroll inside their table. Currency values such as ₹14,50,000 stay intact. The sample dashboard currently wraps the last digit at this width.
- At 360–390 px, find a household, inspect its reply status, record a follow-up and open its pickup without page-wide horizontal scrolling. Keep filter counts, save feedback and active navigation clear with touch and keyboard.
- Invite two people from one household to the reception and only one to the sangeet. Their link shows only their invitations. One reply updates the matching function totals and export. An organizer can record a second reply, and expired or revoked links lose access. Keep guest links separate from planner membership, record reply source, and handle stale updates without overwriting a newer reply.
- Import a CSV twice into the same test wedding. The second preview identifies previously matched guests and leaves replies, rooms and pickups intact. A conflicting guest row requires an explicit resolution. Include household and single-person cases, and review visible counts before committing.
- Switch between Card and Workbook view during a guest search and edit. Preserve filters, the editing context and the existing sheet columns. Verify organizer and family access separately, including the fields available in print and export.
