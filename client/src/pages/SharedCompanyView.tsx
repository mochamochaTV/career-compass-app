import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BASE_PATH } from "@/lib/basePath";
import { decodeShare } from "@/lib/share";
import { AlertCircle, ArrowUpRight, Briefcase, MapPin, Star } from "lucide-react";

// Rendered instead of the whole app (see App.tsx) when the URL's hash starts
// with #share= — a read-only view of one company's research notes, built
// entirely from data embedded in the link itself (see lib/share.ts for why:
// this app has no backend to host a "real" shared record).
export default function SharedCompanyView({ encoded }: { encoded: string }) {
  const data = decodeShare(encoded);

  if (!data) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-lg shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardContent className="pt-8 pb-8 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h1 className="text-xl font-semibold text-slate-800 mb-2">共有リンクを読み込めませんでした</h1>
            <p className="text-slate-600 mb-6 leading-relaxed">リンクが壊れているか、対応していない形式です。もう一度共有し直してもらってください。</p>
            <Button asChild className="bg-[#6654d9] hover:bg-[#5948ca] text-white">
              <a href={`${BASE_PATH}/`}>Career Compassを開く</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-8 flex justify-center">
      <div className="w-full max-w-xl">
        <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
          <CardContent className="pt-8 pb-8">
            <p className="text-xs font-bold tracking-wide text-[#8778d9] mb-1">共有された企業研究シート</p>
            <div className="flex items-center flex-wrap gap-2 mb-4">
              <h1 className="text-2xl font-bold text-slate-900">{data.name}</h1>
              <span className="text-[11px] px-2 py-1 rounded-md bg-[#f4f2ff] text-[#8778d9]">{data.industry}</span>
              {data.stage && <span className="text-[11px] px-2 py-1 rounded-md bg-slate-100 text-slate-600">{data.stage}</span>}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="flex items-center gap-2 text-slate-600 text-sm"><Star size={15} className="text-[#6654d9] flex-shrink-0" />{"★".repeat(data.interest)}{"☆".repeat(5 - data.interest)}</div>
              <div className="flex items-center gap-2 text-slate-600 text-sm"><Briefcase size={15} className="text-[#6654d9] flex-shrink-0" />{data.salary ? `${data.salary.toLocaleString()}万円` : "年収未入力"}</div>
              <div className="flex items-center gap-2 text-slate-600 text-sm col-span-2"><MapPin size={15} className="text-[#6654d9] flex-shrink-0" />{data.location || "勤務地未入力"}</div>
            </div>

            {data.tags && data.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-6">
                {data.tags.map((tag) => <span key={tag} className="text-[11px] px-2 py-1 rounded-md bg-[#eefaf4] text-[#3f9c74]">#{tag}</span>)}
              </div>
            )}

            {data.philosophy && (
              <div className="mb-5">
                <h2 className="text-xs font-bold text-slate-500 mb-1.5">企業理念</h2>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{data.philosophy}</p>
              </div>
            )}
            {data.person && (
              <div className="mb-5">
                <h2 className="text-xs font-bold text-slate-500 mb-1.5">求める人物像</h2>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{data.person}</p>
              </div>
            )}
            {data.sources.length > 0 && (
              <div className="mb-2">
                <h2 className="text-xs font-bold text-slate-500 mb-1.5">参考URL</h2>
                <div className="flex flex-col gap-1.5">
                  {data.sources.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="text-sm text-[#6654d9] hover:underline flex items-center gap-1 break-all">
                      {url}<ArrowUpRight size={13} className="flex-shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <p className="text-center text-xs text-slate-400 mt-4 leading-relaxed">
          {new Date(data.sharedAt).toLocaleDateString("ja-JP")}時点のスナップショットです。個人のメモ・振り返りは含まれていません。
          <br />
          <a href={`${BASE_PATH}/`} className="text-[#6654d9] hover:underline">Career Compassを開く</a>
        </p>
      </div>
    </div>
  );
}
