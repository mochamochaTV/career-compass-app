// Encodes a read-only snapshot of a single company into a URL — this app has
// no backend, so there's nowhere to put a real shareable record. Instead the
// whole snapshot travels compressed inside the link's hash fragment (never
// sent to any server, including GitHub Pages itself), and the receiving
// device decodes it locally. That means it's a point-in-time copy, not a
// live view — edits made after sharing never reach a link already sent out.
import { strFromU8, strToU8, unzlibSync, zlibSync } from "fflate";

export type SharedCompanySnapshot = {
  v: 1;
  name: string;
  industry: string;
  interest: number;
  salary: number | null;
  location: string;
  philosophy: string;
  person: string;
  sources: string[];
  stage?: string;
  tags?: string[];
  sharedAt: string;
};

// Standard base64 uses "+", "/" and "=", all of which need escaping inside a
// URL — swapping in "-", "_" and dropping the padding keeps the link copyable
// and clickable as-is.
function toUrlSafeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromUrlSafeBase64(value: string): Uint8Array {
  const restored = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = restored + "=".repeat((4 - (restored.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeShare(data: SharedCompanySnapshot): string {
  return toUrlSafeBase64(zlibSync(strToU8(JSON.stringify(data)), { level: 9 }));
}

export function decodeShare(encoded: string): SharedCompanySnapshot | null {
  try {
    const parsed: unknown = JSON.parse(strFromU8(unzlibSync(fromUrlSafeBase64(encoded))));
    if (!parsed || typeof parsed !== "object" || (parsed as { v?: unknown }).v !== 1) return null;
    return parsed as SharedCompanySnapshot;
  } catch {
    return null;
  }
}
