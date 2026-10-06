import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type CareerCompassBackup = {
  companies?: unknown[];
  cards?: unknown[];
  schedule?: unknown[];
  pitchTemplates?: unknown[];
  reverseQuestions?: unknown[];
  cardCategories?: unknown[];
  gdTips?: unknown[];
  gdThemes?: unknown[];
  scheduleCategoryColors?: unknown[];
  industrySalaries?: unknown[];
  exportedAt?: string;
  formatVersion?: number;
};

const KNOWN_ARRAY_FIELDS: (keyof CareerCompassBackup)[] = ["companies", "cards", "schedule", "pitchTemplates", "reverseQuestions", "cardCategories", "gdTips", "gdThemes", "scheduleCategoryColors", "industrySalaries"];

export function createBackupZip(data: CareerCompassBackup): Uint8Array {
  return zipSync({
    "career-compass-data.json": strToU8(JSON.stringify(data, null, 2)),
    "README.txt": strToU8(
      "Career Compass 就活データバックアップ\n\ncareer-compass-data.jsonに企業情報・面接カード・スケジュール・自己PR・逆質問メモ・グループディスカッションのメモが入っています。\nアプリの設定画面から復元できます。\n",
    ),
  });
}

export function parseBackupBytes(bytes: Uint8Array, fileName: string): CareerCompassBackup {
  const isZip = fileName.toLowerCase().endsWith(".zip");
  const raw = isZip ? unzipSync(bytes)["career-compass-data.json"] : bytes;
  if (!raw) throw new Error("career-compass-data.json was not found");

  const data: unknown = JSON.parse(strFromU8(raw));
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid Career Compass backup");
  }
  const hasKnownData = KNOWN_ARRAY_FIELDS.some((key) => Array.isArray((data as Record<string, unknown>)[key]));
  if (!hasKnownData) throw new Error("Invalid Career Compass backup");
  return data as CareerCompassBackup;
}
