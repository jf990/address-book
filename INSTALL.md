# Home Screen Installation

Deploy the production build over HTTPS. Localhost is suitable for development;
an HTTP LAN address does not provide the same secure-context support.

- iPhone or iPad: open the app in Safari, then choose Share > Add to Home Screen.
- Android: open the app in Chrome and use Install app or Add to Home screen from
  the browser menu. The exact wording depends on the browser and device.
- Desktop: use the browser's install option when available.

The installed app uses the Address Book name and icon and launches in a
standalone window. Installation prompts depend on browser support and policy;
the app does not force an installation prompt.

The manifest and icons are in `source/public` and are copied by Vite into the
production output. Their relative URLs support deployments below a path prefix.
For a subdirectory deployment, configure Vite's `base` option or build with
`npm run build -- --base /address-book/`.

## Offline use

Open the production app online first and allow the service worker to finish
installing before disconnecting. The app shell, built-in contact data, icons,
and application code are cached for later offline use. Contacts and settings
are stored locally and can be viewed and edited offline. External fonts are
cached when successfully loaded; other remote images may be unavailable.

Maps, geocoding, routing, and other ArcGIS services require an Internet
connection. Browser storage remains local to the browser or installed app;
installation does not sync or back up contacts. Clearing site data or browser
storage can remove the offline cache and saved contacts. The service worker
requires HTTPS or localhost and is enabled in production builds, not Vite's
development server. Updates install in the background and become active after
all app windows using the previous version are closed.
