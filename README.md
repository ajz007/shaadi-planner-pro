# Shaadi Planner Pro

Shaadi Planner Pro has a signed-in wedding planner, a read-only sample wedding that uses the same organizer screens, a filled Excel workbook example, and a separate local RSVP sandbox. It uses Go 1.24, React and TypeScript. See the [workbook-to-web plan](WORKBOOK-TO-WEB.md) for the screen map and the [current roadmap](WORKBOOK-TO-WEB.md#current-roadmap-after-the-sample-review) for the gaps and priorities from the sample review.

## Run the demo

From this folder, build the web app and start Go.

```powershell
Push-Location web
npm ci
npm run build
Pop-Location
go run ./cmd/shaadi-planner
```

Open [the local sample wedding](http://127.0.0.1:8080/#demo). Try Card view, Workbook view, guest filters and bulk selection with fictional records. Use [the private planner](http://127.0.0.1:8080/#workspace) to save changes in your own wedding.

The checkout contains the web sample data. To enable the original Excel downloads locally, put your English launch ZIP in `web/public/Shaadi-Planner-Pro-English.zip` and the blank workbook from that package in `web/public/Shaadi-Planner-Pro-English-Blank.xlsx` before building the web app. These customer deliverables are kept out of Git.

The [Excel workbook example](http://127.0.0.1:8080/#dashboard) shows the workbook's saved totals. Open any planning section from the sidebar, or use **Sections** on a phone. Search within a section and follow guest links from room assignments, pickups or RSVP follow-ups back to the Guest List. **Download Excel package** gives you the original blank and filled workbooks and both guides.

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

The filled workbook preview masks sample phone and vehicle numbers on screen. Changes in the alternate planner are saved in the current browser. The RSVP sandbox is a separate loopback-only prototype. Use fictional data there. Its guest list, household links and replies reset when the server restarts. The signed-in private planner uses PostgreSQL and saves shared changes to the selected wedding.

## Shared workspace backend

The PostgreSQL foundation stores wedding owners, planning people, memberships, invitations, functions and tasks. Planning people can be assigned work before they join. The data layer checks wedding membership, protects task updates with revisions, and assigns a claimable task to one member at a time.

Set `SHAADI_DATABASE_URL` to a development PostgreSQL database and run `go run ./cmd/shaadi-planner migrate-workspace` to apply the migrations. Use a separate database for integration tests. Set `SHAADI_TEST_DATABASE_URL` to that database and run `go test -v ./...` to exercise invitations, access checks, and simultaneous claims. The PostgreSQL integration test is skipped if the test URL is absent.

The existing browser demo runs with `go run ./cmd/shaadi-planner`. To enable **Private workspace**, register a Google OAuth web client with redirect URI `http://localhost:8080/auth/google/callback`. Set `SHAADI_DATABASE_URL`, `SHAADI_GOOGLE_CLIENT_ID`, and `SHAADI_GOOGLE_CLIENT_SECRET` in the process environment. Start Go and open `http://localhost:8080/#workspace`. Keep OAuth credentials outside Git. The default development server listens on loopback. To use `127.0.0.1` locally, set `SHAADI_WORKSPACE_ORIGIN` and register its exact callback URI with Google.

The owner creates a wedding, adds a planning person and a function, and assigns the person a task. The owner can also create an unassigned claimable task. Select **Invite family** in the wedding header, create a link for the planning person and share it privately. The family member opens the link, signs in and accepts the invitation. They can then see their assignments and claim open tasks. Use separate browser profiles to try both roles. The sample planner and RSVP sandbox remain separate from the signed-in records.

If an imported task used your name as an Excel label, open **People → Family Responsibilities**, choose **Reassign**, and select your signed-in planning name marked **(me)**. The task then appears under **My tasks**.

### Import an existing wedding

In **Private workspace**, select **Upload my workbook**, choose the filled English v1.3.1 `.xlsx` and confirm the wedding time zone. Review the detected records and totals, or fix the indicated sheet and row and upload again. **Create wedding from workbook** saves a new wedding in one transaction. Retrying the same confirmation returns that wedding.

Functions and assigned tasks appear in the live schedule and checklist. An imported owner name such as Brother becomes a planning person the wedding owner can invite later. The original guest IDs, wedding-level RSVP values, and links from rooms, transport and follow-ups are retained. The owner can browse the other workbook tabs under **Imported planning records**. These records are read-only until their shared editing screens are added. Summary figures are calculated from the imported rows. Template formulas, cached calculated outputs, and unused rows are excluded.

Use **Guest List** to add guests and edit saved names, households, RSVP and travel details. Filter by arrival date, transport requirement, mode, wedding side or RSVP. **Print filtered guests** prints the current list without phone numbers. The owner can download a current Excel snapshot built from the saved records, including updated guest arrivals, functions and tasks. It also includes the imported records for sections still awaiting live editors.

**My weddings** opens the selected wedding's overview. Inside the wedding, use **People**, **Schedule**, **Money**, and **Details** to navigate. Imported sections appear on their own read-only pages until their editors are available. The owner can check the original file values under **Details → Settings → Import history**. **Workbook view** opens a workbook dashboard with sheet tabs and shows tables for the same wedding records. Wedding owners can manage invitations from **Invite family** in the header.

In **Schedule → Transportation**, filter by date and pick a household from **Guests still needing transport**, or add a pickup and choose passengers individually. Imported pickups keep their existing passenger links. Each pickup stores the arrival details last reviewed by an organizer. A subsequent guest arrival or transport change flags the pickup **Needs review** with the old and new details. Save the reviewed pickup to acknowledge those details. **Print pickup plan** uses the selected date and the owner's current Excel snapshot includes the saved routes, passenger lists and review flags.

In **Schedule → Accommodation**, add rooms, assign guests, and check occupancy. In **People → RSVP Follow-up**, choose a household contact from Guest List and record the next action, follow-up date and last contact. The guest’s current RSVP appears automatically. Both pages can print their filtered records, and the owner’s Excel snapshot includes the live edits.

On **Guest List** and **Transportation**, the two layouts keep the current filters, sort order, and open edit form when you switch. The workbook tables pin the guest name or pickup route while scrolling across columns. Transportation can show only pickups needing review, and workbook rows open the arrival changes before you edit. The browser remembers each organizer's layout choice for that wedding.

In **Money → Vendor Comparison**, wedding owners can add and edit vendor quotes. In **Vendor Payments**, choose a saved vendor to create a contract, then record each payment separately. Imported paid amounts are opening balances. Voided payments stay visible in history and are excluded from the paid total. The Excel snapshot includes the live vendor and contract sheets plus the Payment Ledger. Budget category actuals remain separate from vendor payments.

Open **Documents** on a vendor to upload up to five PDFs, JPGs or PNGs per batch. Limits are 5 MB per file, ten files per vendor and 50 MB per wedding. Files are stored with the wedding in PostgreSQL and are downloadable by the owner. The Excel snapshot lists their filenames.

In **Schedule → Places**, save a venue, hotel or pickup point once and select it in functions, rooms or transport. Keep gate and room details on the associated record. In **Functions & Events**, edit the function duration, mark attendance reviewed, choose required people and add the item checklist. Copy items from another function to reuse a list, then update deadlines and status. Print the checklist by function or responsible person. The Schedule Board uses the saved attendance for conflict checks, and Excel includes places and readiness sheets.

In **Guests & logistics → Guest RSVP**, choose guests from one household and the functions they are invited to. Copy the new link and share it directly. It expires after 30 days. Guests can reply without signing in, and organizers can record phone replies, replace or revoke the link, and download a CSV of headcounts by function. Replacing a link preserves replies and invalidates the old address. Wedding-level RSVP in Guest List stays separate from function replies.

In **Wedding plan → Wedding Timeline**, add or edit run-sheet activities, link them to functions and assign an owner. The agenda includes scheduled functions and can be printed by date. Saved activities appear on the Schedule Board and in the Excel snapshot. Imported timeline rows are editable here, and the original values are available in Import history.

Editable text fields and search in the private planner offer a microphone on browsers that support speech recognition. Review the text before saving. The browser may use an online recognition service, and typing remains available.

For local testing without Google credentials, create a separate loopback database named `shaadi_local`, set `SHAADI_DATABASE_URL`, set `SHAADI_LOCAL_TEST_LOGIN=1`, and start the app with `go run ./cmd/shaadi-planner`. The sign-in screen offers local test accounts. Use sample data and separate browser profiles for different roles. Local test sign-in rejects remote database hosts and cannot be combined with Google credentials.

The importer accepts the English v1.3.1 layout in files up to 2 MB. The upload itself is read in memory. Private review data expires after 30 minutes and is cleared when confirmed. The running workspace sweeps expired previews on startup and once a minute. A confirmation can be retried for seven days.

The PostgreSQL HTTP integration test uses a simulated sign-in provider. For coverage against the original filled and blank workbooks, also set `SHAADI_TEST_WORKBOOK_PACKAGE` to the English v1.3.1 launch ZIP before running `go test -v ./...`. The launch files stay outside Git. Actual Google sign-in requires the registered OAuth credentials above.

To refresh the preview data from the English launch ZIP, run `python import_demo.py "path/to/launch-package.zip"` and rebuild the web app.

Run the workflow test with `go test ./...`.

### Deploy to Railway

The public homepage is at `/`, the sample wedding at `/#demo`, the Excel workbook example at `/#dashboard`, and the private planner at `/#workspace`. Privacy, Terms and Contact are draft previews at `/privacy`, `/terms` and `/contact`. Set `VITE_SELLER_NAME` and `VITE_SUPPORT_EMAIL` on the app service to override the defaults of Ajit Shukla and support@shaadiplannerpro.com. These are public values compiled into the frontend during the build, so changes require a rebuild.

Before publishing the policies, verify that the support inbox receives mail and that the proposed retention rules can be carried out. The draft proposes 90 days of access after the wedding and up to 30 days in backups after removal from the live service. Confirm the deletion workflow, backup schedules and policy wording before removing the draft notice and indexing restriction.

The planned public origin is `https://shaadiplannerpro.com`. Once the domain is attached to Railway and HTTPS is active, update `SHAADI_WORKSPACE_ORIGIN` and register `https://shaadiplannerpro.com/auth/google/callback` in Google Auth Platform for the public deployment.

Create a separate Shaadi Planner project for its app and database. The repository's Dockerfile builds React and Go. Railway supplies the port and checks /healthz. The server applies database migrations at startup.

1. Create the Railway project and add **PostgreSQL**. Add an app service from the shaadi-planner-pro GitHub repository with the repository root as its source.
2. Under the app service's **Settings → Networking**, generate a public domain. Use that exact hostname for both Railway and Google. Update both if you switch to a custom domain.
3. In **Google Auth Platform**, configure branding and audience, then create an OAuth client of type **Web application**. For a pilot in **External → Testing**, add the pilot accounts as test users. Set **Authorized redirect URIs** to https://YOUR-DOMAIN/auth/google/callback.
4. In the Railway **app service's Variables**, set these values, then deploy.

   | Variable | Value |
   | --- | --- |
   | SHAADI_DATABASE_URL | Reference the database service's DATABASE_URL, for example `${{Postgres.DATABASE_URL}}` if the service is named Postgres. |
   | SHAADI_WORKSPACE_ORIGIN | https://YOUR-DOMAIN without a trailing slash. |
   | SHAADI_GOOGLE_CLIENT_ID | The Google web client ID. |
   | SHAADI_GOOGLE_CLIENT_SECRET | The Google web client secret. Store it in Railway Variables. |

   Railway injects PORT. Hosted startup requires the HTTPS origin, database URL and both OAuth credentials. Local test sign-in and the demo RSVP sandbox are available in loopback mode.

5. Once Railway marks the deployment healthy, open https://YOUR-DOMAIN/#workspace and select **Continue with Google**. Use two Google accounts in separate browser profiles to create a test wedding, accept an invitation and check the assigned tasks. In a signed-out window, confirm that the private wedding requires login.

For a redirect mismatch, compare the origin and callback character for character. If the Railway health check fails, check the app's startup logs and verify the domain, database reference and OAuth variables. For a public launch, use a separate Google OAuth project with your verified domain, app branding and published privacy policy.
