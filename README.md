# RouteHeat

RouteHeat is a mobile-first delivery performance tracker for iPhone and Android. It combines one-tap stop logging, GPS route maps, pace goals, tote tracking, route history, reports, replay, and long-term delivery-density analysis.

> **Safety:** Only interact with RouteHeat while parked. Never use the app while driving.

## Features

- Live OpenStreetMap that follows the driver's GPS position
- GPS breadcrumb recording that traces the vehicle's driven street path
- Focused Drive mode with a large stops-per-hour speedometer
- Large sticky **Stop Complete** action and compact **New Tote** action
- Manual and optional experimental automatic stop detection
- Segment and overall stops-per-hour calculations
- Pace goal, planned stop count, and projected finish time
- Pause and break tracking excluded from active pace
- Numbered stop and tote markers on live and saved maps
- Saved route history with CSV export
- Animated chronological route replay along the recorded street path
- End-of-day report card with route highlights and sharing
- Tote analytics including stops per tote, average tote time, and recent performance
- Smooth delivery-density heat map with 7-day, 30-day, and all-time filters
- Lifetime street-coverage map with recorded mileage and every mapped delivery
- Alternate neighborhood pace map
- Installable PWA shell and device-local history

## Publish on GitHub Pages

1. Create a public GitHub repository.
2. Upload the **contents of this folder** to the repository root. Do not upload only the ZIP file.
3. Open **Settings → Pages** in the repository.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`, then save.

GitHub will show the public site address after deployment. GPS access requires HTTPS, which GitHub Pages provides automatically.

## Install on iPhone

Open the published site in Safari, tap **Share**, choose **Add to Home Screen**, and allow precise location access when prompted.

## Install on Android

Open the published site in Chrome, open the browser menu, and choose **Install app** or **Add to Home screen**. A separate Android Studio wrapper project is also available for building an APK.

## How route data works

- History is stored only in the current browser on the current device.
- Stops without GPS coordinates remain in route statistics but cannot appear on maps or heat layers.
- Street traces are recorded for routes completed after the street-recording update; older routes retain their stop markers but cannot recreate a road path that was never captured.
- For best street coverage, keep RouteHeat open with precise location enabled. Mobile browsers can reduce or pause GPS updates when the screen is locked or the app is backgrounded.
- The recorded line follows frequent GPS breadcrumbs rather than calling an external road-snapping service. It should closely follow the driven street when GPS reception is good, but weak reception can create drift or gaps.
- Tote analytics begin when **New Tote** is used during a route.
- Density colors show where deliveries overlap most; pace colors show relative neighborhood performance.
- The app shell is cached after the first successful visit. Uncached map tiles still require internet access.

## Main files

- `index.html` — application interface
- `assets/styles.css` — responsive dark visual design
- `assets/app.js` — GPS, route, history, analytics, report, and replay behavior
- `manifest.webmanifest` — installable app metadata
- `sw.js` — offline application-shell caching

Map data is provided by OpenStreetMap and displayed with Leaflet. Smooth density rendering uses Leaflet.heat.
