import { strFromU8, strToU8 } from "fflate";

// 端末間同期：GitHubの非公開リポジトリに1つのJSONファイルとして保存し、
// 前回同期した時点（base）との3者比較で、項目ごとにマージする。

export type SyncConfig = { owner: string; repo: string; token: string; path: string };
export const SYNC_FIELDS = ["companies", "cards", "schedule", "pitchTemplates", "reverseQuestions", "cardCategories", "gdTips", "gdThemes", "scheduleCategoryColors"] as const;
export type SyncField = typeof SYNC_FIELDS[number];
export type SyncData = Partial<Record<SyncField, unknown[]>>;

export const DEFAULT_SYNC_PATH = "career-compass-sync.json";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// 項目を見分けるキー：文字列（カテゴリ名）はそのもの、色設定は name、それ以外は id。
function keyOf(field: SyncField, item: unknown): string | null {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const k = field === "scheduleCategoryColors" ? o.name : o.id;
    return typeof k === "string" ? k : null;
  }
  return null;
}

function stamp(item: unknown): number {
  if (item && typeof item === "object") {
    const u = (item as Record<string, unknown>).updatedAt;
    if (typeof u === "string") { const t = Date.parse(u); if (!Number.isNaN(t)) return t; }
  }
  return NaN;
}

// 1項目の解決。undefined は「その側に存在しない（削除された）」。
function pick(l: unknown, r: unknown, b: unknown): unknown {
  const eq = (x: unknown, y: unknown) => (x === undefined || y === undefined ? x === y : stable(x) === stable(y));
  if (eq(l, r)) return l;
  if (b !== undefined || (l === undefined) !== (r === undefined)) {
    if (b !== undefined && eq(l, b)) return r; // 手元は未変更 → 相手の変更を採用（削除含む）
    if (b !== undefined && eq(r, b)) return l; // 相手は未変更 → 手元の変更を採用（削除含む）
  }
  if (l === undefined) return r; // 片方が削除・片方が編集 → 編集を残す
  if (r === undefined) return l;
  const sl = stamp(l), sr = stamp(r);
  if (!Number.isNaN(sl) && !Number.isNaN(sr) && sl !== sr) return sl > sr ? l : r;
  return l;
}

export function mergeArrays(field: SyncField, local: unknown[], remote: unknown[], base: unknown[] | undefined): unknown[] {
  const index = (arr: unknown[]) => { const m = new Map<string, unknown>(); arr.forEach((it) => { const k = keyOf(field, it); if (k !== null) m.set(k, it); }); return m; };
  const L = index(local), R = index(remote), B = base ? index(base) : new Map<string, unknown>();
  const hasBase = !!base;
  const keys = new Set<string>(Array.from(L.keys()).concat(Array.from(R.keys())));
  const result = new Map<string, unknown>();
  keys.forEach((k) => {
    const l = L.get(k), r = R.get(k);
    // baseが無い（初回）ときは「存在する側」を残す＝和集合
    const merged = hasBase ? pick(l, r, B.get(k)) : pick(l, r, undefined);
    if (merged !== undefined) result.set(k, merged);
  });
  // 並び順：自分が並べ替えていなければ相手の並び、そうでなければ自分の並び。
  const common = (arr: unknown[]) => arr.map((it) => keyOf(field, it)).filter((k): k is string => k !== null && result.has(k));
  const lOrder = common(local), rOrder = common(remote);
  const bOrderCommon = base ? common(base).filter((k) => lOrder.includes(k)) : null;
  const localReordered = bOrderCommon ? stable(lOrder.filter((k) => bOrderCommon.includes(k))) !== stable(bOrderCommon) : true;
  const primary = localReordered ? lOrder : rOrder;
  const secondary = localReordered ? rOrder : lOrder;
  const order: string[] = [];
  primary.concat(secondary, Array.from(result.keys())).forEach((k) => { if (!order.includes(k) && result.has(k)) order.push(k); });
  return order.map((k) => result.get(k));
}

export function mergeData(local: SyncData, remote: SyncData, base: SyncData | null): SyncData {
  const out: SyncData = {};
  SYNC_FIELDS.forEach((f) => { out[f] = mergeArrays(f, local[f] ?? [], remote[f] ?? [], base ? (base[f] ?? []) : undefined); });
  return out;
}

export function sameData(a: SyncData, b: SyncData): boolean {
  return SYNC_FIELDS.every((f) => stable(a[f] ?? []) === stable(b[f] ?? []));
}

// ---- GitHub API ----
const toB64 = (s: string) => { const bytes = strToU8(s); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000))); return btoa(bin); };
const fromB64 = (s: string) => { const bin = atob(s.replace(/\s/g, "")); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return strFromU8(bytes); };

export class SyncError extends Error {}

const headers = (cfg: SyncConfig) => ({ Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });
const repoUrl = (cfg: SyncConfig) => `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
const fileUrl = (cfg: SyncConfig) => `${repoUrl(cfg)}/contents/${cfg.path.split("/").map(encodeURIComponent).join("/")}`;

async function api(url: string, init: RequestInit, cfg: SyncConfig): Promise<Response> {
  let res: Response;
  try { res = await fetch(url, { ...init, headers: { ...headers(cfg), ...(init.headers ?? {}) }, cache: "no-store" }); }
  catch { throw new SyncError("ネットワークに接続できません。オンラインになってからもう一度お試しください"); }
  if (res.status === 401) throw new SyncError("トークンが無効か期限切れです。設定で入れ直してください");
  return res;
}

// 非公開リポジトリでなければ同期しない（個人の就活データを公開しないため）。
export async function assertPrivateRepo(cfg: SyncConfig): Promise<void> {
  const res = await api(repoUrl(cfg), {}, cfg);
  if (res.status === 404 || res.status === 403) throw new SyncError("リポジトリが見つからないか、トークンに権限がありません（Contents の読み書き権限と対象リポジトリを確認してください）");
  if (!res.ok) throw new SyncError(`GitHubに接続できませんでした（${res.status}）`);
  const info = (await res.json()) as { private?: boolean };
  if (!info.private) throw new SyncError("このリポジトリは公開されています。個人データを守るため、非公開（Private）のリポジトリを指定してください");
}

export async function fetchRemote(cfg: SyncConfig): Promise<{ data: SyncData | null; sha?: string }> {
  const res = await api(fileUrl(cfg), {}, cfg);
  if (res.status === 404) return { data: null };
  if (!res.ok) throw new SyncError(`同期ファイルを読み込めませんでした（${res.status}）`);
  const body = (await res.json()) as { sha: string; content?: string; encoding?: string };
  let text: string;
  if (body.content && body.encoding === "base64") text = fromB64(body.content);
  else {
    const raw = await api(fileUrl(cfg), { headers: { Accept: "application/vnd.github.raw+json" } }, cfg);
    if (!raw.ok) throw new SyncError(`同期ファイルを読み込めませんでした（${raw.status}）`);
    text = await raw.text();
  }
  try {
    const parsed = JSON.parse(text) as { data?: SyncData };
    return { data: parsed.data ?? {}, sha: body.sha };
  } catch { throw new SyncError("同期ファイルの形式が正しくありません"); }
}

export async function pushRemote(cfg: SyncConfig, data: SyncData, sha?: string): Promise<void> {
  const payload = { formatVersion: 1, updatedAt: new Date().toISOString(), data };
  const res = await api(fileUrl(cfg), { method: "PUT", body: JSON.stringify({ message: "Career Compass 同期", content: toB64(JSON.stringify(payload)), ...(sha ? { sha } : {}) }) }, cfg);
  if (res.status === 409 || res.status === 422) throw new SyncError("他の端末が同時に更新しました。もう一度同期してください");
  if (!res.ok) throw new SyncError(`同期ファイルを書き込めませんでした（${res.status}）`);
}

export type SyncMode = "merge" | "upload" | "download";

// 1回分の同期。localを渡すと、反映すべき merged と「手元が変わったか」を返す。
export async function runSync(cfg: SyncConfig, local: SyncData, base: SyncData | null, mode: SyncMode): Promise<{ merged: SyncData; changedLocal: boolean; pushed: boolean; hadRemote: boolean }> {
  await assertPrivateRepo(cfg);
  for (let attempt = 0; attempt < 2; attempt++) {
    const remote = await fetchRemote(cfg);
    let merged: SyncData;
    if (mode === "upload") merged = remote.data ? mergeData(local, remote.data, null) : local;
    else if (mode === "download") { if (!remote.data) throw new SyncError("クラウドにまだデータがありません。先に1台目の端末でアップロードしてください"); merged = remote.data; }
    else merged = remote.data ? mergeData(local, remote.data, base) : local;
    const needPush = !remote.data || !sameData(merged, remote.data);
    try {
      if (needPush && mode !== "download") await pushRemote(cfg, merged, remote.sha);
    } catch (e) {
      if (attempt === 0 && e instanceof SyncError && e.message.includes("同時に更新")) continue;
      throw e;
    }
    return { merged, changedLocal: !sameData(merged, local), pushed: needPush && mode !== "download", hadRemote: !!remote.data };
  }
  throw new SyncError("同期に失敗しました");
}
