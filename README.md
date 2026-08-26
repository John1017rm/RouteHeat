# RouteHeat 6.1.4

RouteHeat is a mobile-first, private delivery intelligence tracker for iPhone and Android. It records stops, locations, totes, rescues, packages, timing, and GPS breadcrumbs; compares a driver only with their own history; and turns finished workdays into maps, reports, replay, and long-term insights.

> **Safety:** Use every RouteHeat control only while safely parked. Forecasts, Ghost comparisons, coaching, achievements, and historical pace are personal context—not targets or reasons to rush.

## 6.1.4 full-history protection

- **Cloud-safe journal reads:** Cloud sync waits for the protected device journal and uploads the complete route copy instead of a space-saving local mirror.
- **Fuller-copy tie breaker:** If two equal-version copies exist, a compact mirror with no trail can no longer replace a copy that still contains the recorded GPS path.
- **Complete portable backups:** `.routeheat` exports wait for journal recovery and include full protected route history, including older map trails.
- **Storage-pressure finish fix retained:** Rescue routes and other long workdays still finish through the compact local mirror fallback introduced in 6.1.1.

## 6.1.3 saved-route checkpoint repair

- **History repair:** Saved-route details now include a Repair action for rebuilding missing completed stops from a screenshot or written checkpoint.
- **Exact totals:** Enter target stops, Amazon's next stop, total active time, checkpoint time, and optional package count.
- **Rescue reconstruction:** RouteHeat creates a recovered rescue phase, distributes only the missing stops across the added active time, and restores the exact total duration.
- **No invented GPS:** Recovered stops are clearly marked corrections with unavailable locations. Existing stops, totes, GPS trail, and timing remain unchanged.
- **Auditable correction:** The repair records its before/after counts, checkpoint, active-time target, and inserted stop IDs.

## 6.1.2 fuller-route recovery

- **Journal snapshot rescue:** Startup now inspects both the current and previous protected device snapshots before they can rotate out.
- **Fuller-copy prompt:** If the journal contains a recent unfinished route with more stops than the local or History copy, RouteHeat offers the exact larger stop count for recovery.
- **Non-destructive choice:** Choosing to keep the current copy does not clear or modify any active-route data.
- **Safe rescue continuation:** Recovering a fuller draft preserves reopened-rescue handling when a shorter saved checkpoint exists in History.

## 6.1.1 finish-storage hotfix

- **Long-route finish repair:** Finishing no longer requires the full accumulated GPS history to fit in the browser's small local-storage mirror.
- **Full journal preservation:** RouteHeat keeps the complete normalized history in the IndexedDB device journal and automatically reloads it when the local mirror is space-limited.
- **Safe mirror fallback:** If needed, only older route trail geometry is removed from the local mirror. Stops, totes, timing, rescues, route metadata, and recorded distance remain available.
- **Smaller GPS format:** Finished-route trail points are stored as compact coordinate arrays while preserving the map path and distance.

## 6.1.0 active-route corrections

- **Recent activity:** The Live view now combines the six most recent completed stops and tote changes in one list.
- **Easy parked removal:** Each recent stop or tote has a clear Remove control and a confirmation that affects only the active route.
- **Automatic repair:** Removing a stop recalculates later Amazon stop numbers, segment timing, phase anchors, and tote positions. Removing a tote recalculates later tote numbers and the current tote.
- **30-second Undo:** A removed stop or tote can be restored with its original numbering and route metadata from the existing protected Undo banner.

## 6.0.1 finish-save hotfix

- Finishing a route now releases the duplicated active-route mirror before writing the same workday into History, preventing local-storage quota failures on installations with substantial route history.
- If the History write still fails, RouteHeat restores both the previous History value and the unfinished active draft, then records that rollback in the device journal.
- The application-shell and service-worker cache versions are synchronized at 6.0.1 so installed PWAs receive the repair as one update.

## Delivery Areas in 6.1

- **Drawn Delivery Areas:** While parked, outline places such as North Star or Middleton directly on the map, name them, choose colors, adjust corners, and set overlap priority.
- **Stop-level classification:** Each mapped stop is matched to its actual boundary. A workday can contain multiple Areas instead of being forced into one route-wide label.
- **Rescue-aware Areas:** Original and rescue phases receive separate Area breakdowns, so a Middleton rescue does not change a North Star original route into one mixed identity.
- **Historic reanalysis:** Adding, editing, reordering, or deleting a boundary immediately reclassifies saved history without changing raw stops, GPS breadcrumbs, route revisions, or cloud rows.
- **Area intelligence:** History, Live, Drive, route detail, finish reports, All-time filters, ETA, Ghost selection, weekly recaps, Moments, Delivery Year, and Area Profile pages use drawn boundaries first.
- **Suggested Areas:** Older automatic GPS clusters can provide a reviewable starting outline. They remain suggestions until the driver explicitly checks and saves them.
- **Private boundaries:** Names and polygons stay in device storage and `.routeheat` backups. They are not uploaded to Supabase or included in privacy-safe shared summaries.

## RouteHeat 6 foundation

- **Pre-route readiness:** Route setup checks fresh GPS, confirmation audio, device storage protection, and optional cloud status before the route starts. A route can still begin when an optional check is unavailable.
- **Route context:** Optional Apartments, Businesses, Rural, Heavy load, New area, and Weather tags help explain a workday without changing its totals. Tags stay in private route data.
- **Learned forecast:** RouteHeat saves forecast snapshots during the workday, shows a finish range with an honest confidence level, and reviews how the estimate performed after the route.
- **Tote Assistant:** Personal route and Delivery Area history estimate a typical tote size and show progress toward a likely tote change. The driver always decides when a new tote actually opens.
- **Auto-stop modes:** Off is manual-only; Suggest asks for a parked confirmation; Auto can count from the learned stop pattern. Accepted, rejected, and undone suggestions train only this installation. Manual Stop Complete and Undo remain available.
- **Map themes:** Auto, Standard, Contrast, and Muted styles adjust the existing maps without changing the OpenStreetMap provider.
- **Where Time Went:** Finished-route detail and reports separate recorded time into driving, service, breaks, transitions, and unclassified gaps when the available data supports it.
- **Route quality review:** Mapped-stop coverage, GPS quality and continuity, gaps, ignored jumps, and manual corrections produce a transparent confidence review. Package completeness and forecast coverage remain visible as separate report facts. A limited score never removes completed stops.
- **Private Story Studio:** Moments highlights personal turning points; Ghost Rivalries revisit comparable routes from the same driver's history; Personal Seasons summarize Winter, Spring, Summer, and Fall; and Delivery Year animates saved workdays across one calendar year.
- **Area profiles:** Drawn delivery boundaries receive private maps, trends, aggregate metrics, rescue totals, and route visit lists using only stops inside that Area.
- **Finish movie and celebration:** The finish report can play a parked-only route movie before the full end-of-day review. Active-route achievements use a compact, nonblocking banner; the large celebration is reserved for the finished workday.
- **Reliability controls:** RouteHeat reports save health, offers a universal short-lived Undo, waits for a parked moment before applying an update, and prevents two tabs from writing the same active route unless the driver explicitly takes over.
- **Restorable backups:** Settings can create and preview a portable `.routeheat` backup. Import validates its format and checksum, previews additions and conflicts, and applies the result transactionally.

There is no public leaderboard, cross-driver ranking, team competition, or comparison with another person's route data. Delivery Rank is a private XP progression based only on this driver's own saved history.

## Existing workday tools

RouteHeat 6.1 retains the established workflow:

- Large Live and Drive stop controls, multi-location stops, pace goals, pauses, GPS breadcrumbs, audio, vibration, and tote markers
- Optional package totals and per-stop, per-location, and per-active-hour workload ratios
- Separate completed-stop sequence and Amazon stop number, including routes that begin at Amazon Stop 2 or 3
- Parked Route Tools for correcting the next Amazon stop, current tote, or a missed stop
- Continuous original and rescue phases, rescue workload estimates, finished-route reopening, and same-day route merge
- Real-route Personal Ghost levels: Off, Adaptive, Cruise, Standard, Expert, and Personal Best
- Delivery Areas, finish-range confidence, Smart Coach, History sorting, weekly recaps, achievements, and awards
- Street-following replay with scrubber, chapters, saved breaks and GPS gaps, live metrics, speeds, and optional Ghost delta
- Manual stop-location correction that preserves the original GPS point
- All-time Streets, Density, Pace Trails, and Repeat Stops maps with advanced filters
- Recently Deleted recovery with revision-aware local and Supabase conflict protection

## Setup

RouteHeat is a static web application. It does not require a build step.

1. Keep `index.html`, `manifest.webmanifest`, `sw.js`, the setup documents, and the complete `assets` directory together.
2. For optional cloud backup, follow `SUPABASE_SETUP.md`, run `supabase-setup.sql` once, and put the project URL and browser-safe publishable key in `assets/supabase-config.js`.
3. Host the files from HTTPS. GPS, installability, service workers, and mobile audio recovery are most reliable from a secure origin.
4. Open RouteHeat once online so the application shell can cache, then install it from the browser if desired.

Existing RouteHeat cloud projects need **no Supabase migration for 6.1**. Route data remains schema 4. Delivery Area definitions are private device data and are deliberately excluded from cloud route rows.

## Delivery Areas

Open **History → Manage Areas** or **Settings → Delivery Areas** while parked. Create a boundary by tapping at least three map corners, optionally drag the corner handles, choose **Finish outline**, then save it. A boundary can contain 3–64 distinct corners and cannot cross itself.

- Stops exactly inside a polygon match that Area. A small 6–35 m accuracy-aware edge allowance helps genuine GPS fixes near a border; manually positioned or unknown-accuracy stops use the smallest allowance.
- When Areas overlap, the higher-priority Area wins. Equal-priority matches prefer the smaller, more specific polygon and then a stable identifier.
- Stops outside every saved boundary remain **Unassigned**. They are never removed from totals or maps.
- Multi-location counts stay attached to their completed stop. Original and rescue phases are summarized independently.
- Editing a stop location or an Area boundary recalculates derived Area analytics. RouteHeat never rewrites the immutable raw route merely to change an Area match.
- Suggested Areas are conservative drafts based on legacy route patterns. Review their shape and name before saving.

Area definitions are stored under the private `routeheat.deliveryAreas.v1` device state, included in the checksummed transactional snapshots, and included in `.routeheat` backup files. Use a `.routeheat` file to move Areas between installations; Supabase finished-route sync does not move private Area definitions.

## Daily use

### Start and run a route

1. Park, choose **Start route**, and enter the pace goal, planned stops, and optional package total.
2. Review readiness, choose optional context tags, and enable or disable a real-route Personal Ghost.
3. Use **Suggest** while training auto-stop behavior. Confirm or dismiss suggestions only while parked. Choose **Auto** only after reviewing how suggestions behave on this device.
4. Complete normal or multi-location stops, open totes, pause breaks, and use Route Tools for corrections or rescue phases. Each trusted stop is assigned to its drawn Area independently.
5. Treat ETA, Smart Coach, Ghost, and Tote Assistant as descriptive estimates. Manual controls remain authoritative.

### Finish and review

Finishing opens the optional route movie and full report with workload, pace, package totals, forecast review, Where Time Went, quality confidence, Ghost result, records, and awards. Skip animation whenever reduced motion is enabled or immediate access to the report is preferred.

History contains sortable workdays, Area filters and breakdowns, replay, weekly recaps, Moments, Ghost Rivalries, Personal Seasons, and Delivery Area profiles. **All time → Delivery Year** opens the yearly time-lapse. Shared recap and Area summaries are aggregate text and omit maps, coordinates, route IDs, exact workday times, and private Area names.

## Device storage and recovery

RouteHeat uses several intentionally separate protection layers:

| Layer | What it does | Important limit |
| --- | --- | --- |
| `localStorage` | Fast working mirror for finished routes, the active draft, recovery records, Delivery Area definitions, and selected settings | Clearing website data removes it |
| IndexedDB `routeheat-storage` | Transactionally stores the current full protected snapshot and the previous valid full snapshot, each with a checksum and logical clock | It belongs to this browser installation and can also be cleared or evicted |
| IndexedDB journal | Keeps bounded commit metadata such as sequence, time, reason, checksum, logical clock, and changed key names | It is metadata-only, not a stack of full route-history copies |
| Supabase | Mirrors signed-in finished routes, deletion tombstones, and restoration state with revision-aware conflict handling | It does **not** upload an unfinished active-route draft |
| `.routeheat` file | Portable, restorable export of finished routes, an eligible active draft, recovery state, private Delivery Area names/boundaries, and selected route/auto settings | The file contains sensitive route data and must be stored securely |

On startup, RouteHeat validates the device snapshots and reconciles them with the localStorage mirror without overwriting a logically newer valid copy. If IndexedDB is unavailable, localStorage remains active and Settings reports degraded protection.

These layers do not make browser storage permanent. Do not clear website data, remove the Home Screen app, reset the browser, or reinstall before confirming that finished routes are synced or a `.routeheat` backup is safely stored elsewhere. An active draft is device-only unless it was deliberately included in a `.routeheat` file.

### `.routeheat` backup versus CSV

Use **Settings → Data protection → Create backup** for recovery:

- The file uses `format: "routeheat-backup"`, format version 1, app schema 4, and an integrity checksum.
- Import first shows new, newer, unchanged, and recovery-record counts. Nothing changes before confirmation.
- Finished routes merge by logical identity and revision/time richness rather than blindly duplicating data.
- Delivery Areas merge by stable identity and newer revision/update time. Existing newer local definitions win, and an oversized combined set is rejected before any mutation.
- A different unfinished route already on the device is preserved; a conflicting imported draft is skipped.
- Import prepares and applies a transactional snapshot. If it fails, RouteHeat rolls back to the prior device state.

A `.routeheat` file is JSON and is **not encrypted by RouteHeat**. Keep it in protected device or cloud storage and never publish it; it can contain GPS coordinates and an active draft.

CSV is the 52-column analysis/archive export for spreadsheets and external tools. The original 44 columns remain in the same order; eight appended fields describe the derived primary, phase, and event Delivery Area matches. It also retains legacy Route Family compatibility fields. RouteHeat does not import CSV, so CSV alone cannot rebuild History, Delivery Area boundaries, or Recently Deleted state.

### Recently Deleted and cloud restore

Recently Deleted lists only entries that still contain a complete finished-route recovery copy. Eligible local recovery works while offline or signed out, then cloud reactivation waits for the next authenticated sync. Keep the installation and its data until **Sync now** confirms success. Stale older revisions and unmarked legacy tombstones cannot silently re-delete a newer restored route; a future intentional deletion still works normally.

## Offline and PWA behavior

- After one successful online load, the service worker caches the application shell for offline route entry and history access.
- GPS stop logging, device snapshots, `.routeheat` export/import, and finished history can work without cloud connectivity.
- Supabase sign-in/sync, first-time library loading, application updates, and OpenStreetMap tiles require a network connection.
- An uncached or offline map may be blank while stop totals and GPS data continue recording.
- Mobile operating systems can suspend GPS or audio after backgrounding. Return to RouteHeat and use the next parked tap if the OS requires a fresh audio gesture.

### GitHub Pages deployment and updates

1. Upload the **contents** of the RouteHeat package to the repository root; do not upload only a ZIP or create an extra outer folder.
2. Replace `index.html`, `manifest.webmanifest`, `sw.js`, documentation, and the complete `assets` directory as one release. Cache names and local asset query versions must match that release.
3. In **Settings → Pages**, deploy the `main` branch from `/ (root)` and wait for the deployment to finish.
4. Open the published URL once while online. Fully close and reopen the installed PWA; apply an in-app update only while parked.
5. Never clear website data or uninstall/reinstall merely to force an update. Create a `.routeheat` backup first if removal is unavoidable.

On iPhone, open the published URL in Safari and use **Share → Add to Home Screen**. On Android, use Chrome's **Install app** or **Add to Home screen**.

## Privacy and map tiles

- Delivery Area names and boundary geometry remain device-private unless deliberately included in a `.routeheat` file. They are not uploaded by Supabase route sync.
- Route history, context tags, automatic-stop training, Moments, Seasons, Ghosts, and forecasts remain on the device unless included in a `.routeheat` file or, for supported finished-route data, synced to the signed-in Supabase account.
- Supabase Row Level Security restricts cloud rows to the signed-in account.
- Shared summaries deliberately omit precise route geometry and private identifiers, but always review generated text before sharing.
- OpenStreetMap tiles are fetched from an external tile service. That provider can receive normal network metadata and the geographic tile coordinates requested for the visible map. RouteHeat does not send stop notes, package counts, Area names/boundaries, or full saved route records to the tile provider.
- Repeat Stops groups approximate GPS areas, not verified street addresses.
- CSV and `.routeheat` files can contain precise location history. Treat them as private.

## Main files

- `index.html` — accessible mobile interface and modal shells
- `assets/styles.css` — Dark, Sunlight, responsive, reduced-motion, and map-theme presentation
- `assets/app.js` — route workflow, intelligence, local recovery, backup/import, history, reports, and maps
- `assets/routeheat-storage.js` — IndexedDB transactional snapshots and metadata journal
- `assets/cloud.js` — Supabase authentication, finished-route sync, deletion, and restore conflict handling
- `assets/supabase-config.js` — Supabase project URL and browser-safe publishable key
- `manifest.webmanifest` and `sw.js` — installation metadata and offline application-shell cache
- `supabase-setup.sql` and `SUPABASE_SETUP.md` — optional one-time cloud setup

Map data is provided by OpenStreetMap and displayed with Leaflet. Density rendering uses Leaflet.heat.
