# RouteHeat

RouteHeat is a mobile-first delivery pace tracker for iPhone. It uses GPS to log completed stops, calculates segment and overall stops per hour, colors route segments by pace, saves route history on the device, and exports CSV files.

> **Safety:** Only use RouteHeat while parked. Never interact with the app while driving.

## Publish on GitHub Pages

1. Create a new GitHub repository.
2. Upload the **contents of this folder** (not the ZIP file itself) to the repository root.
3. Open **Settings → Pages** in GitHub.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`, then save.

GitHub will show the public URL after deployment. Location access requires HTTPS; GitHub Pages provides it automatically.

## Install on iPhone

Open the published site in Safari, tap **Share**, then choose **Add to Home Screen**. Allow location access when prompted.

## Notes

- Route history is stored only in the browser on the current device.
- The app shell works offline after the first visit. Map tiles need an internet connection unless already cached.
- Route data can be exported as CSV from the History screen.
- OpenStreetMap map data is used through Leaflet.
