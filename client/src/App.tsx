import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BASE_PATH } from "@/lib/basePath";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import SharedCompanyView from "./pages/SharedCompanyView";

// A shared company link (see lib/share.ts) puts its payload in the URL HASH,
// not a real route — the hash never reaches the server, so this works even
// as a cold, direct link on GitHub Pages, which has no server-side rewrite
// for SPA routes the way a real router would need. Checked once at module
// load: this value can't change without a full page navigation anyway (the
// app itself never writes to location.hash), so there's nothing to react to.
const SHARE_HASH_PREFIX = "#share=";
const sharedPayload = window.location.hash.startsWith(SHARE_HASH_PREFIX) ? window.location.hash.slice(SHARE_HASH_PREFIX.length) : null;

function Router() {
  // make sure to consider if you need authentication for certain routes
  //
  // `base` matters here: this app can be deployed at a domain root or at a
  // GitHub Pages project subpath (e.g. /career-compass-app/). Without it,
  // wouter only ever matches "/" against the real root, so opening the app
  // from its subpath (including every PWA launch) falls through to the
  // catch-all NotFound route below.
  return (
    <WouterRouter base={BASE_PATH}>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/404"} component={NotFound} />
        {/* Final fallback route */}
        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  // A shared link never wants the visitor's own companies/cards/theme
  // toggle or bottom nav — it's a one-page, read-only view for someone who
  // may not even have (or want) the app, so it skips the router, the
  // person's own data, and most providers entirely.
  if (sharedPayload !== null) return <SharedCompanyView encoded={sharedPayload} />;

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          {/* Shorter duration + fewer visible at once so a run of quick
              actions (saving, rating a card, adding a log entry) doesn't
              stack toasts up over the bottom nav or the sticky quiz controls. */}
          <Toaster duration={2500} visibleToasts={2} />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
