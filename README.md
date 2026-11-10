# Shaadi Planner Pro

This local preview opens the filled Aarav and Meera wedding from the English v1.3.1 launch package. It uses Go 1.24, React and TypeScript. See the [workbook-to-web plan](WORKBOOK-TO-WEB.md) for the screen map and implementation order.

## Run the demo

From this folder, build the web app and start Go.

```powershell
Push-Location web
npm ci
npm run build
Pop-Location
go run .
```

Open [the local demo](http://127.0.0.1:8080).

The checkout contains the web sample data. To enable the original Excel downloads locally, put your English launch ZIP in `web/public/Shaadi-Planner-Pro-English.zip` and the blank workbook from that package in `web/public/Shaadi-Planner-Pro-English-Blank.xlsx` before building the web app. These customer deliverables are kept out of Git.

The dashboard shows the workbook's saved totals. Open any planning section from the sidebar, or use **Sections** on a phone. Search within a section and follow guest links from room assignments, pickups or RSVP follow-ups back to the Guest List. **Download Excel package** gives you the original blank and filled workbooks and both guides.

## Try the onboarding prototype

For a different layout, open **Try the alternate dashboard** from the dashboard. Browse **People**, **Schedule**, **Money**, and **Details**. Use **Workbook view** to switch to the corresponding table layout. The two layouts use the same current plan. Changes are saved in the current browser's local storage.

Add events from **Functions & Events**, run-sheet activities from **Wedding Timeline**, and vendors from **Vendor Comparison**. In **Vendor Payments**, select a saved vendor to reuse its name, category and quoted or negotiated amount. **Download current Excel snapshot** exports the current sections and dashboard totals. The original launch ZIP still provides the template, example, and guides.

In the alternate **Guest List**, combine filters for wedding side, arrival date, transport requirement and arrival mode. Use **Print filtered guests** to print the current selection or save it as a PDF from the browser's print dialog. The guest printout includes arrival and RSVP fields and omits guest contact details.

Open **Schedule Board** from Functions & Events or Wedding Timeline to compare entries on one time axis. Time, duration and required-attendee edits saved to the plan also appear in the Excel snapshot. **Try an example conflict** opens a separate scenario for experimenting with changes.

Open **Start Here** from the sidebar or **Set up my wedding** from the dashboard. **Try workbook upload** uses the filled sample to demonstrate the section counts, review and confirmation. You can download the original blank workbook directly. **Start a blank wedding** lets you enter fictional wedding details, add a function and assign a task, then edit those entries or mark the task done from the draft dashboard.

The workbook flow demonstrates import with sample data. The draft stays in memory while the setup flow is open. Real workbook uploads and saved weddings require the private workspace.

## Try the separate RSVP sandbox

Open **RSVP sandbox** from the planner navigation.

1. Select **Preview sample guests**, then **Confirm import**. Four guests are split across the Patel and Shah households. The Reception has four invitations and the Sangeet has two.
2. Open the Shah family RSVP link in a new tab. Mark Mira Shah as **Attending** for Sangeet.
3. Return to the organizer tab. Select **Refresh replies** if needed. The Sangeet should show one attending and one pending. Download the headcounts CSV and open it in Excel.
4. Preview the sample again to see that the four existing guests are recognized. To try a custom list, download the sample and replace its rows with fictional names. Use a unique household label per family or leave it blank for an individual.

## Local demo boundaries

Phone and vehicle numbers are hidden on screen. The sample workspace and its edits belong to the current browser. Shared login and PostgreSQL storage are a later milestone. The organizer sandbox is separate and accessible to anyone using the local address. Use fictional data only. Its RSVP links work on this computer, and sandbox data and links reset on restart.

## Shared workspace backend

The PostgreSQL foundation stores wedding owners, planning people, memberships, invitations, functions and tasks. Planning people can be assigned work before they join. The data layer checks wedding membership, protects task updates with revisions, and assigns a claimable task to one member at a time.

Set `SHAADI_DATABASE_URL` to a development PostgreSQL database and run `go run . migrate-workspace` to apply the migrations. Use a separate database for integration tests. Set `SHAADI_TEST_DATABASE_URL` to that database and run `go test -v ./...` to exercise invitations, access checks, and simultaneous claims. The PostgreSQL integration test is skipped if the test URL is absent.

The existing browser demo runs with `go run .`. To enable **Private workspace**, register a Google OAuth web client with redirect URI `http://localhost:8080/auth/google/callback`. Set `SHAADI_DATABASE_URL`, `SHAADI_GOOGLE_CLIENT_ID`, and `SHAADI_GOOGLE_CLIENT_SECRET` in the process environment. Start Go and open `http://localhost:8080/#workspace`. Keep OAuth credentials outside Git. The app is loopback-only for this milestone. To use `127.0.0.1` locally, set `SHAADI_WORKSPACE_ORIGIN` and register its exact callback URI with Google.

The owner creates a wedding, adds a planning person and a function, and assigns the person a task. The owner can also create an unassigned claimable task. Generate an invite code linked to the existing person and share it privately. The family member signs in separately, joins with that code, sees their existing assignment and can claim an open task. Use separate browser profiles to try both roles. The sample planner and RSVP sandbox remain separate from the signed-in records.

### Import an existing wedding

In **Private workspace**, select **Upload my workbook**, choose the filled English v1.3.1 `.xlsx` and confirm the wedding time zone. Review the detected records and totals, or fix the indicated sheet and row and upload again. **Create wedding from workbook** saves a new wedding in one transaction. Retrying the same confirmation returns that wedding.

Functions and assigned tasks appear in the live schedule and checklist. An imported owner name such as Brother becomes a planning person the wedding owner can invite later. The original guest IDs, wedding-level RSVP values, and links from rooms, transport and follow-ups are retained. The owner can browse the other workbook tabs under **Imported planning records**. These records are read-only until their shared editing screens are added. Summary figures are calculated from the imported rows. Template formulas, cached calculated outputs, and unused rows are excluded.

Use **Guest List** to add guests and edit saved names, households, RSVP and travel details. Filter by arrival date, transport requirement, mode, wedding side or RSVP. **Print filtered guests** prints the current list without phone numbers. The owner can download a current Excel snapshot built from the saved records, including updated guest arrivals, functions and tasks. It also includes the imported records for sections still awaiting live editors.

For local testing without Google credentials, create a separate loopback database named `shaadi_local`, set `SHAADI_DATABASE_URL`, set `SHAADI_LOCAL_TEST_LOGIN=1`, and start the app with `go run .`. The sign-in screen offers local test accounts. Use sample data and separate browser profiles for different roles. Local test sign-in rejects remote database hosts and cannot be combined with Google credentials.

The importer accepts the English v1.3.1 layout in files up to 2 MB. The upload itself is read in memory. Private review data expires after 30 minutes and is cleared when confirmed. Subsequent imports purge expired reviews. A confirmation can be retried for seven days.

The PostgreSQL HTTP integration test uses a simulated sign-in provider. For coverage against the original filled and blank workbooks, also set `SHAADI_TEST_WORKBOOK_PACKAGE` to the English v1.3.1 launch ZIP before running `go test -v ./...`. The launch files stay outside Git. Actual Google sign-in requires the registered OAuth credentials above.

To refresh the preview data from the English launch ZIP, run `python import_demo.py "path/to/launch-package.zip"` and rebuild the web app.

Run the workflow test with `go test ./...`.
