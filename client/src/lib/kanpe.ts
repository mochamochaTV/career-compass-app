// Opens a single interview card as its own small, independent browser
// window — a "カンペ" (cheat sheet) meant to sit near the webcam during an
// online interview. It's just this same app's own URL with a `#kanpe=` hash
// (see App.tsx / KanpeView.tsx), so the popup shares this origin's
// localStorage and reads the live card data directly — no export step, no
// server, and it stays in sync if the card is edited later (KanpeView
// listens for the "storage" event).
import { BASE_PATH } from "@/lib/basePath";

const KANPE_HASH_PREFIX = "#kanpe=";
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 170;

export function kanpeUrlFor(cardId: string): string {
  return `${window.location.origin}${BASE_PATH}/${KANPE_HASH_PREFIX}${encodeURIComponent(cardId)}`;
}

export function parseKanpeHash(hash: string): string | null {
  return hash.startsWith(KANPE_HASH_PREFIX) ? decodeURIComponent(hash.slice(KANPE_HASH_PREFIX.length)) : null;
}

// Cascades each newly-opened window a little further from the top-right
// corner than the last one, purely so clicking the button on several cards
// in a row doesn't pile every window in the exact same spot. It's only a
// starting position — this is a normal OS window, so the person can drag or
// resize it anywhere afterward (right above their webcam, say), and it stays
// there until they move it again.
let openCount = 0;

export function openKanpeWindow(cardId: string) {
  const step = 34;
  const offset = (openCount++ % 8) * step;
  const screenWidth = window.screen.availWidth || 1280;
  const left = Math.max(0, Math.round(screenWidth - DEFAULT_WIDTH - 16 - offset));
  const top = offset;
  // Specifying width/height (and the other flags) is what makes Chrome/Edge/
  // Firefox open this as a small chrome-less popup instead of a normal
  // tabbed window. Reusing the same window name per card means clicking the
  // button again while that card's window is still open just refocuses it
  // instead of opening a duplicate.
  const features = `width=${DEFAULT_WIDTH},height=${DEFAULT_HEIGHT},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,location=no,menubar=no,status=no`;
  const win = window.open(kanpeUrlFor(cardId), `kanpe-${cardId}`, features);
  win?.focus();
  return win;
}
