# Shaadi Planner Pro backend readiness

The prototype is ready to guide backend implementation. The two layouts cover the workbook's planning areas, and the key interaction patterns are established. Treat the sample preview, the RSVP sandbox, and a private wedding as separate workspaces.

This document records the original backend plan. See the [current roadmap](WORKBOOK-TO-WEB.md#current-roadmap-after-the-sample-review) for the live planner baseline and the remaining sample-to-product work.

## Coverage and remaining work

| Workflow | What exists in the demo | What the shared workspace needs |
|---|---|---|
| Start a wedding | Blank setup and workbook upload walkthrough | Durable creation from a blank plan or a validated English v1.3.1 workbook, with sheet and row issues and a safe retry |
| Family collaboration | Local checklist, task drafts and completion | Sign-in, wedding-scoped roles, invitations, My tasks, and an atomic claim for explicitly open tasks |
| Events and timeline | Add events and run-sheet activities, edit timing and required attendees on the Schedule Board | Typed records and validation, stable people IDs, explicit function-to-activity links, time zone, live conflict calculations and edit history |
| Guests and logistics | Sample records, filters, cross-links and filtered printing | Guest, household, room and trip editing, linked guest IDs, and access rules for contact and travel details |
| Budget and vendors | Sample category totals, add vendor quotes and payment rows | Stable vendor and contract IDs, editing and corrections, a payment ledger, server-derived totals and clear rules for imported category actuals |
| Other trackers | Sample settings, contacts, outfits and gifts | Full add, edit and archive workflows. Preserve their data on import and export even before each editor ships. |
| Excel and print | A values snapshot generated from browser-supplied rows and print from the current filter | Excel built from authorized server records at a consistent point in time. Print only permitted fields and rows, with a wedding-local date and filter context. |
| Guest RSVP and messaging | Separate no-login RSVP sandbox | Wedding-linked invitations, revocable guest links, separate wedding-wide and function-level responses, and permission-aware messaging in a later release |

## Decisions to encode in the first migrations

- **One wedding is the boundary.** Every planning record belongs to one wedding. Enforce membership on each read, write, and export. Use an owner, co-organizer and family member model. Members can see their assignments, claimable tasks and the permitted schedule. Grant budget and private guest details separately. Keep permissions explicit at export and print boundaries as well.
- **A planning person can exist without an account.** Preserve imported names such as Brother as wedding-local people. The owner links an invitation and accepted membership to the chosen person. Tasks and required attendance point to the person ID so a name change, duplicate name or invite acceptance does not invalidate the plan.
- **Task claims are atomic.** Only an open, claimable task with no assignee can be claimed. A single conditional update assigns it to an eligible member and records the actor and time. A concurrent loser receives the current assignee. Use record revisions for shared edits where saving stale data could overwrite another person's work.
- **Schedules distinguish purpose and attendance.** A function and a run-sheet activity can refer to each other while retaining their own times and required people. Separate an unreviewed attendee list from one explicitly confirmed empty. Use explicit duration or end time, allow overnight entries, and compute conflicts from overlapping intervals and shared required person IDs. Keep travel, venue and dependency checks as later extensions. Resolve the sample workbook's differing ceremony times with the organizer rather than automatically matching or deduplicating records by title.
- **Money has separate totals.** Preserve the overall target, category budget and paid actuals, and vendor contracts and payments as separate concepts. For the filled workbook, category actual paid is ₹2,87,000 and vendor-ledger paid is ₹2,15,000. Do not add the two as a total. Store money in paise and compute contract balance from payments.
- **Excel is an entry and exit point.** Validate uploaded files before creating a wedding. Keep the original workbook's external guest and function IDs as import references, separate from internal IDs. Calculate derived values from source records. Create all imported rows in one transaction and use a confirmation key to avoid duplicates. Export current authorized data as an Excel snapshot. Treat any future merge back into an existing wedding as an explicit, conflict-aware workflow.

## Implementation order

1. **One private workflow end to end.** Use the existing Go app and PostgreSQL. Add migrations for weddings, people, memberships, invitations, functions and tasks. Connect sign-in, wedding creation and the first set of reads and writes. The owner creates a function and assigns a task to a planning person, invites the family member, and the member signs in and sees it in My tasks. They claim an open task and complete it. The owner sees the changes and the shared dashboard updates.
2. **Bring in the workbook and complete the editing workflows.** Map all supported Excel tabs with the workbook fixture as an acceptance test. Add guest and logistics editing, vendor contracts and payments, timeline and required attendance, then the other trackers. Move shared calculations and the Excel export to server-authorized data. Keep both views over the same APIs.
3. **Pilot the private workspace.** Test a real import with permission, the mobile family workflow, a filtered pickup list, an Excel handoff, and restore from backup. Cover rate limits, member removal, data export and deletion before expanding beyond the pilot. Integrate guest RSVP links and test sharing once the private wedding is stable.

## Acceptance for the first backend milestone

- Two signed-in accounts can join one wedding and see the changes they are permitted to see. An account from another wedding cannot fetch the records by ID or export them.
- An invitation links to the chosen wedding person and shows tasks already assigned to them. Revoked or consumed invitation links cannot grant new access.
- Exactly one of two concurrent claims succeeds. Refreshing or restarting the app preserves the result. Both users see an accurate current assignee.
- A stale task edit does not overwrite a newer update. The organizer and alternate checklist show the same state.
- The public sample stays isolated from private records. The existing demo remains available while the shared flow is wired up.
