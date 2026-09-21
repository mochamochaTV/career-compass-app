// The real path this app was served from, captured once here at module
// load time — before any client-side navigation (e.g. wouter's
// setLocation/"Go Home") can change window.location.
//
// On a GitHub Pages project site this is something like
// "/career-compass-app"; at a domain root it's "" (empty string).
//
// Both the router (App.tsx) and the service worker registration
// (Home.tsx) need this, because the app can be deployed at any subpath
// and must not assume it is hosted at the domain root.
export const BASE_PATH = window.location.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "");
