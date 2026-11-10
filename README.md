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

The next milestone adds PostgreSQL, organizer sign-in, and editable wedding settings, functions and family tasks. Live guest communications follow once the private wedding access model and guest workflows are in place.

To refresh the preview data from the English launch ZIP, run `python import_demo.py "path/to/launch-package.zip"` and rebuild the web app.

Run the workflow test with `go test ./...`.
