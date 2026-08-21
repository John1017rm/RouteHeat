# RouteHeat 5.0.0

RouteHeat is a mobile-first delivery intelligence tracker for iPhone and Android. It combines large one-tap stop controls, GPS route maps, pace goals, tote tracking, rescue workdays, private Route Families, selectable Ghost comparisons, finish forecasting, coaching, route history, reports, replay, achievements, and long-term delivery analysis.

> **Safety:** Only interact with RouteHeat while parked. Never use RouteHeat, Route Tools, Ghost Run details, or route-editing controls while driving.

## RouteHeat 5.0 Smarter Routes & History Studio update

- **Private Route Families:** RouteHeat groups geographically similar workdays using saved delivery GPS patterns, gives each family a stable friendly name, and shows an honest low/medium/high confidence level. You can privately rename a detected family without changing its history or cloud identity. Existing routes are classified on demand; raw grid coordinates are never shown as family names.
- **Selectable Ghost challenge:** Route setup now lets you enable or disable Ghost Run and choose Adaptive, Cruise, Standard, Expert, or Personal Best. Every level selects a real saved comparable route—RouteHeat never manufactures a faster or slower Ghost with an artificial multiplier. Same-family history is preferred even when only one credible family match exists.
- **High-contrast Ghost status:** The Drive card uses a dedicated arrow-and-text chip for ahead, behind, and even states, with strong Dark and Sunlight contrast. The expanded chart keeps gained/lost segments, moving markers, and a clear statement of the selected family, difficulty, and comparable stop count.
- **Smarter finish forecast:** Projected finish is now a realistic time range with low, medium, or high confidence. It blends recent stop intervals, overall pace, remaining planned stops, pace goal, and comparable Route Family history instead of presenting a falsely precise time.
- **Smart Route Coach:** Live and Drive views surface one concise personal observation at a time, such as momentum changes, Ghost recovery, pace stability, or forecast status. Coaching is descriptive rather than competitive and keeps the primary Stop Complete flow uncluttered.
- **Rescue workload planning:** Starting or reopening a rescue asks for both added planned stops and added packages. Known package totals are combined across phases; skipped counts remain visibly partial instead of being silently treated as zero.
- **Advanced All-time filters:** Filter private map history by recency or date range, Route Family, original/rescue phase, individual weekday or weekday/weekend, time of day, pace band, GPS/manual location source, and minimum repeat visits. Filters project a temporary view and never rewrite saved routes.
- **History Studio replay:** Replay follows recorded GPS breadcrumbs, marks saved breaks and GPS gaps, offers a draggable timeline, and builds chapters for totes, rescues, fast/slow stretches, and route finish. A live panel updates stops, active time, pace, and phase; an optional Ghost overlay shows the historical time delta. Legacy routes retain a clearly dashed approximate fallback.
- **Weekly recaps:** History now builds private 7-day and 30-day summaries with stops, locations, pace, packages and coverage, active time, recorded roads, rescues, busiest weekday, fastest recent route, and most-active Route Family. Sharing excludes maps, coordinates, addresses, route IDs, exact workday times, and private family names.
- **Backward-compatible data and exports:** RouteHeat 5.0 keeps schema 4 for these additive fields, so older finished routes, restored routes, rescue merges, and current Supabase JSON rows remain usable. CSV retains its original 37-column order and appends seven 5.0 fields.

## RouteHeat 4.1 Route Story & Workload update

- **Animated Ghost Run studio:** The compact Drive card opens a parked-only comparison with a gained/lost delta chart, moving current and ghost markers, strongest-gain and toughest-stretch insights, and an accessible text summary. It compares only the overlapping stop count when routes differ in size.
- **Package workload totals:** Route setup can record the optional package total alongside planned stops and pace goal. RouteHeat reports packages per stop, per location, and per active hour without pretending to know how many packages were delivered at each address.
- **Smarter History sorting:** Saved routes can be sorted by date, stops, locations, packages, Route Load, active time, recorded distance, pace, median completion interval, or rescue count. Missing legacy values stay at the bottom instead of being treated as zero.
- **Finish celebration and review:** Finishing a workday opens an animated, skippable route celebration with the day's pace, workload, packages, timing, Ghost result, records, and newly earned awards before settling into the complete report.
- **Street-following replay:** Route replay now animates the recorded GPS breadcrumb trail, moves along the driven street path, respects GPS gaps and route breaks, pauses at meaningful events, and keeps the existing 0.5x–4x speed controls. Legacy routes without a breadcrumb trail use a clearly identified approximate fallback.
- **Manual stop map placement:** Open a saved route, choose **Edit map** on a stop, pan the full-screen map under the fixed crosshair, and save the corrected location. RouteHeat keeps the original GPS point and a correction audit while using the new point on detail, replay, and lifetime maps.
- **Stop timing intelligence:** Route details and reports show average and median time between completed stops within the same work phase. When the recorded GPS samples are reliable, RouteHeat also shows a clearly labeled GPS dwell estimate and its coverage.
- **Correct rescue anchors:** A rescue marker is placed on the first completed stop of that rescue, not at the last position of the original route. The marker keeps the true rescue-start time in its details.

## RouteHeat 4.0.4 restore reliability update

- **Persistent restore receipts:** Restoring writes the complete route and a durable recovery receipt before clearing deletion records. If a stale sync snapshot removes the visible copy, RouteHeat immediately rehydrates it from that receipt instead of losing it from History.
- **Legacy alias consolidation:** Old cloud rows with different IDs but the same exact route start are combined into one recovery candidate. RouteHeat carries forward the newest tombstone time and richest route data, including the Aug. 13 203-stop case, so restoring an older alias cannot be reversed by a newer alias.
- **Repair instead of re-delete:** A late unmarked tombstone from an older RouteHeat version is treated as stale, rebased, and repaired. A deliberate deletion made in 4.0.4 receives an explicit deletion marker and still wins normally.
- **Safe offline restore:** A complete local recovery copy can return to History immediately while offline or signed out. Cloud repair remains pending until the next authenticated online sync, so do not clear website data or remove/reinstall RouteHeat before that sync succeeds.
- **No countdown:** RouteHeat 4.0.4 does not apply a time-based Recently Deleted purge. It can list only tombstones that still contain a complete finished-route recovery copy; the on-device safety ledger retains the newest 500 deletion records.

### Also included from 4.0.2

- **Null Island fix:** Blank, malformed, out-of-range, and exact `(0,0)` GPS points are now ignored across live routes, saved maps, replay, and every All-time map mode. Stops recorded while GPS was unavailable still remain in route totals, reports, awards, and cloud history.
- **Clearer History tab:** The old clock has been replaced with a crisp route-history icon that combines a return trail and map pin for better recognition at phone tab-bar size.

## RouteHeat 4.0 highlights

- **Personal Ghost Run:** When enough history exists, RouteHeat automatically selects a similar saved route and compares today's completed stops with that personal baseline. The compact Drive card reports stops and time ahead or behind; tap it while parked to open the full gained/lost comparison. Break time is excluded from both routes.
- **Parked Route Tools:** The Drive screen now opens a dedicated tools sheet for setting Amazon's next stop number, correcting the current tote number, adding a missed stop, or beginning a rescue phase.
- **Corrected missed stops:** Enter the Amazon stop number, how many minutes ago it occurred, and its location count. RouteHeat inserts a clearly marked corrected stop, repairs the completed sequence and surrounding timing, and uses a nearby recorded GPS point when one is available. Any reconstructed location is approximate.
- **Separate stop numbering:** RouteHeat keeps its completed-stop sequence separate from Amazon's displayed stop number. Pace, progress, achievements, and totals use actual completed stops, while confirmations, saved maps, details, and replay can show the matching Amazon number. This supports routes that begin at Amazon Stop 2 or 3 without falsely counting extra deliveries.
- **Rescue continuation:** Start a rescue before finishing, from Route Tools, or reopen a finished route from its report. Original and rescue activity stay in one workday with continuous totals, Amazon numbering, totes, GPS history, planned-stop progress, phase markers, and separate phase statistics.
- **Same-day saved-route merge:** Open a saved route's Map & Replay view and choose **Merge** to combine it with another route from the same day. The earlier route remains the workday and the later route becomes a rescue phase. RouteHeat recalculates numbering, totals, timing, XP, and achievements, and securely retires the second local/cloud copy.
- **Historical Pace Trails:** The All-time map's **Pace trails** mode colors recorded road sections by historical delivery pace relative to the selected range's personal average. Repeated samples receive stronger solid trails; preliminary sections appear as faded dashes.
- **Repeat-stop visits:** The All-time map's **Repeat stops** mode groups delivery points from different saved routes within approximately 32 meters. Numbered markers show visit frequency; tap one for route/day counts, first and latest visit, locations, and average segment pace. These are GPS-area estimates, not address matches.
- **Foreground audio recovery:** RouteHeat now detects backgrounding, page changes, and return-to-foreground events, then resumes or recreates browser audio. Mobile operating systems may still require the next parked tap to unlock sound, but confirmation audio should no longer remain disabled for the rest of the route.
- **Safer cloud conflict handling:** Supabase synchronization compares route schema version, revision, route update time, cloud update time, durable restore receipts, and explicit 4.0.4 deletion intent so stale aliases cannot silently reverse a recovery.

## Core features

- Polished Dark, high-contrast Sunlight, and Automatic themes
- Live OpenStreetMap that follows the driver's GPS position
- GPS breadcrumb recording that traces the driven street path
- Focused Drive mode with route progress and a large Stop Complete speedometer button
- Manual and optional experimental automatic stop detection
- Multi-location stops that preserve one Amazon stop while recording the actual delivery workload
- Segment and overall stops-per-hour calculations, pace goals, finish projections, pauses, and break tracking
- Optional route package totals plus packages-per-stop, packages-per-location, and packages-per-hour workload ratios
- Numbered stop, tote, correction, and rescue markers on live and saved maps
- Configurable chime, bell, voice, and extra-loud confirmations with volume and vibration controls
- Crash/reload-safe active-route recovery for stops, totes, corrections, rescue phases, and GPS traces
- Sortable saved route history, animated end-of-day review, sharing, and breadcrumb street replay at 0.5x, 1x, 2x, or 4x
- Route Load Index, comparable-route insights, tote analytics, full-screen lifetime maps, and smooth density rendering
- Awards & Milestones center with 44 custom achievement designs, lifetime XP, 100 delivery ranks, records, progress, and the Level 100 **RouteHeat GOAT** rank
- Secure Supabase email/password backup, offline retry, and new-device restore
- Recently Deleted recovery for complete finished-route copies, with local/cloud status and restore confirmation
- Installable static PWA shell suitable for GitHub Pages

## Using RouteHeat 5.0

### Start with a Route Family and Ghost level

1. Choose **Start route** while parked and enter planned stops, optional packages, and the pace goal.
2. Leave **Personal Ghost** on or turn it off for this workday.
3. Choose **Adaptive**, **Cruise**, **Standard**, **Expert**, or **Personal best**. The setup preview names the actual saved route RouteHeat expects to use when one is available.
4. Start the route. A predicted family may appear first; saved GPS delivery stops confirm the final family with a confidence label. The selected Ghost stays fixed for a fair comparison.

Open **History -> Name route families** to replace an automatic family label with a private name. Renaming changes the display label only; it does not split routes, alter GPS history, or change the stable family ID.

### Read the forecast and Smart Coach

The Live and Drive screens show a finish range and confidence level. Confidence normally improves as RouteHeat collects stop intervals and finds comparable family history. The range is a personal estimate, not a navigation promise or a reason to rush.

Smart Coach chooses one short observation at a time. Detailed Ghost charts, filters, replay controls, reports, and family naming are parked-only tools.

### Extend a workday with a rescue

Start a rescue from Route Tools, the finish confirmation, or a finished route report. Enter the added planned stops and added packages when known. RouteHeat keeps continuous stop numbering and workday totals while preserving the original and rescue phases. A skipped package field creates an honest partial total marked with `+` instead of assuming zero.

### Filter the All-time map

Open **All time -> Advanced filters**. Combine Route Family, phase, weekday, time of day, pace band, location source, visit threshold, recency, or explicit dates, then choose **Apply filters**. **Reset** returns to the full private history. The four map modes—Streets, Density, Pace trails, and Repeat stops—operate on the temporary filtered projection without editing the underlying routes.

### Use History Studio replay and recaps

Open a saved route and choose **Map & replay**. Use Replay, the speed buttons, the scrubber, or a chapter for a tote, rescue, saved gap, fast stretch, slow stretch, or finish. Ghost overlay is available only when that saved route retained a real comparable Ghost curve. The map redraws the saved route state when seeking; it does not create new delivery data.

History generates a 7-day and 30-day recap when opened. **Share** sends aggregate performance text only—never the map, GPS coordinates, route IDs, addresses, exact route times, or private family names.

## Using the 4.0 route tools

### Personal Ghost Run

Start a route normally. If RouteHeat finds a comparable saved route with at least five stops, the Personal Ghost card appears on Drive mode. The saved comparison is selected using planned-stop similarity, start time, recency, and rescue history. Tap the card only while parked to open its gained/lost chart, race markers, and strongest/toughest stretch details.

Ghost Run is a private comparison against your own saved history. It is not a public leaderboard and does not share another user's data.

### Correct numbering, tote, or a missed stop

1. Park safely and open **Drive -> Route tools**.
2. Set **Amazon's next stop** without changing the number of deliveries RouteHeat has actually completed.
3. Set **Current tote** when the tote sequence needs correction. The next New Tote action continues from that number.
4. To repair a forgotten delivery, enter its Amazon stop number, minutes ago, and number of delivery locations, then choose **Add corrected stop**.

Corrected stops remain visibly labeled in route details and exports. If no suitable recorded GPS point exists, the stop still counts in statistics but may not appear on the map.

### Continue with a rescue

- During an active route, use **Route tools -> Start a rescue phase**, or choose **Start rescue** from the finish confirmation.
- After finishing, open the route's report and choose **Continue with Rescue** to reopen that workday.
- Enter the added planned-stop estimate if known. The estimate extends route progress but does not create completed stops.
- Finish the day normally after the rescue. The report shows the original route and rescue phases separately plus the combined total.

### Merge two saved routes

Use this only when two same-day routes should have been one workday, such as a separately recorded rescue:

1. Open **History -> Map & replay** for either route.
2. Choose **Merge** and select the other saved route from that day.
3. Review the warning and confirm.

The merge replaces two saved records with one, so route-count totals, XP, rank, and achievements can recalculate. Export first if you want a separate archival copy. RouteHeat hides the retired second record from Recently Deleted while its merged survivor remains in History, preventing accidental double-counting. If that survivor is later removed and a complete recovery copy still exists, the retired record can be restored as a separate route; this does not split or undo the merge.

### Recover a deleted route

1. Park safely and open **Settings -> Recently Deleted**.
2. Review the route date, metrics, deletion time, and recovery status.
3. Choose **Restore route**, review the warning, and confirm.

The status explains where the complete recovery copy came from:

- **Cloud pending** means deletion is queued on this device and has not finished syncing to cloud.
- **Cloud protected** means a private Supabase tombstone, or its cached device copy, contains the finished route.
- **On this device** means recovery currently depends on this installation's local copy.

Offline or signed-out recovery returns an eligible route to local History immediately. Keep RouteHeat installed and preserve its website data until an authenticated **Sync now** completes; only then is cloud reactivation confirmed. Close any other open RouteHeat tabs and update older installations to RouteHeat 5.0.0 before using them again. CSV exports are useful private archives, but RouteHeat does not import CSV, so a CSV alone cannot rebuild History.

A restored route receives newer revision metadata and its matching deletion records are cleared. That lets newer clients reject stale data from an older device. A future intentional deletion still works normally.

## CSV export in 5.0

CSV export still includes stops, tote changes, rescue starts, route starts, and GPS track points. RouteHeat 4.0 adds fields that preserve corrections and workday structure:

- `schema_version` and `revision`
- `phase_id`, `phase_type`, and `phase_label`
- `completed_sequence` and `amazon_stop_number`
- `tote_number`
- `stop_source` and `corrected`
- `after_completed_stop`
- `total_packages` and `package_count_complete`
- `phase_packages_added`, `packages_per_stop`, and `packages_per_location`
- `average_stop_interval_seconds` and `median_stop_interval_seconds`
- `service_estimate_seconds`, `service_estimate_source`, and `service_estimate_confidence`
- `location_source`, `manual_original_latitude`, and `manual_original_longitude`
- `route_family_id`, `route_family_name`, and `route_family_confidence`
- `ghost_enabled`, `ghost_difficulty`, and `ghost_route_id`
- `phase_planned_stops_added`

Latitude, longitude, GPS accuracy, location count, event time, segment duration, and segment pace remain available where applicable.

The seven RouteHeat 5.0 fields are appended after the original 37 columns, so existing column positions remain stable. CSV is an analysis/archive format, not an app backup format. RouteHeat 5.0.0 does not include CSV or JSON import.

## Publish on GitHub Pages

1. Create a public GitHub repository.
2. Upload the **contents of this folder** to the repository root. Do not upload only the ZIP file.
3. Keep the `assets` folder intact beside `index.html`, `manifest.webmanifest`, and `sw.js`.
4. Open **Settings -> Pages** in the repository.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select the `main` branch and `/ (root)`, then save.

GitHub displays the public site address after deployment. GPS access requires HTTPS, which GitHub Pages provides automatically.

## Update an existing GitHub Pages installation

1. Unzip the new RouteHeat package on your computer.
2. Upload all files and folders from inside the package to the existing repository root.
3. Allow GitHub to overwrite the old files, including `index.html`, `sw.js`, and the files inside `assets`.
4. Wait for the Pages deployment to finish.
5. Open the published URL in Safari or Chrome once so the new app shell can install.
6. Completely close and reopen the Home Screen app.

You do not need to remove the existing Home Screen shortcut for a normal update. Do not delete/reinstall the Home Screen app or clear its website data to force an update: either action can destroy local routes, Recently Deleted recovery copies, settings, and an unfinished-route draft. Keeping the complete versioned app shell together prevents a new interface from loading with older cached JavaScript.

## Install on iPhone

Open the published site in Safari, tap **Share**, choose **Add to Home Screen**, and allow precise location access when prompted. Keep RouteHeat in the foreground during a route for the most reliable GPS and audio behavior. Before changing phones, clearing website data, or removing the Home Screen app, finish the active route, sign in, choose **Sync now**, verify that sync succeeds, and save a CSV as a secondary archive. Reinstalling can restore cloud-synced finished routes after sign-in, but it cannot recover an unfinished local draft or device-only Recently Deleted entry.

## Install on Android

Open the published site in Chrome, open the browser menu, and choose **Install app** or **Add to Home screen**. A separate Android Studio project mirrors the same RouteHeat 5.0 interface and can be used to build an APK.

## Route data, cloud sync, and compatibility

- While a route is running, RouteHeat continuously stores a temporary recovery draft on the device. Finishing saves the completed workday and clears the draft.
- Finished history remains cached locally for offline use. After cloud sign-in, finished routes are also backed up to the user's private Supabase account.
- Removing or retiring a finished route keeps a recoverable full-data entry when one is available. Recently Deleted can combine the newest local recovery records with private Supabase tombstones after sign-in.
- Restoring while offline or signed out succeeds locally and waits for the next authenticated online sync. Until that sync finishes, clearing storage or reinstalling can still erase the only restored copy.
- Existing RouteHeat routes remain compatible. Missing 4.x and 5.0 fields are normalized or derived when loaded; older routes cannot recreate GPS paths, visit coordinates, package counts, or Ghost curves that were never recorded.
- RouteHeat 5.0 keeps schema version 4 for its additive family, Ghost, rescue-planning, and export metadata. This avoids making an older active rescue edit lose solely because another device saw a higher schema number.
- Each edited or merged route keeps the same logical route ID and receives schema/revision/update metadata. During sync, the newer logical version wins instead of blindly overwriting a correction with a stale device copy.
- Deletion ledgers and Supabase tombstones take priority over stale live copies. A confirmed recovery removes its exact deletion records and advances the route revision before cloud reactivation, preventing an older device from undoing that recovery.
- Complete the one-time instructions in `SUPABASE_SETUP.md` before using Cloud backup.
- For best street history, keep RouteHeat open with precise location enabled. Mobile browsers may reduce or pause GPS updates when the screen is locked or the app is backgrounded.
- The recorded route follows GPS breadcrumbs rather than an external road-snapping service. Weak reception can create drift or gaps.
- Uncached map tiles require an internet connection; the application shell is available offline after a successful first visit.

## Privacy and safety

- RouteHeat does not need street addresses for repeat-stop history. It compares approximate saved GPS areas on the device.
- Ghost Run, Route Families, ETA comparisons, Coach insights, map filters, and weekly recaps use only the signed-in user's own saved history.
- Custom family names are device preferences and are excluded from the weekly share summary. Route GPS remains protected by the existing private route row and Supabase Row Level Security.
- Cloud GPS history is protected by Supabase Row Level Security and is private to the signed-in account.
- Do not publish a CSV if it contains GPS coordinates you want to keep private.
- Use all controls only while parked. RouteHeat must never encourage speeding or distracted driving.

## Main files

- `index.html` - application interface
- `assets/styles.css` - responsive Dark and Sunlight theme system
- `assets/app.js` - GPS, routes, corrections, rescues, Route Families, Ghost selection, ETA/Coach logic, filters, recaps, maps, reports, and replay
- `assets/cloud.js` - authentication, revision-aware backup, recoverable tombstones, stale-deletion protection, offline retry, and restore
- `assets/supabase-config.js` - Supabase project URL and browser-safe publishable key
- `manifest.webmanifest` - installable app metadata
- `sw.js` - offline application-shell caching
- `supabase-setup.sql` - protected route table and Row Level Security policies
- `SUPABASE_SETUP.md` - one-time Supabase dashboard instructions

Map data is provided by OpenStreetMap and displayed with Leaflet. Smooth density rendering uses Leaflet.heat.
