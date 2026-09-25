import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { strToU8 } from "fflate";
import {
  AlertCircle, ArrowLeft, BookOpen, BriefcaseBusiness, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, FileDown, FileUp, GripVertical, Home as HomeIcon, Lightbulb, Menu, MessageSquare, Mic, Moon, Pause, Pencil, Play, Plus,
  RefreshCw, RotateCcw, Search, Settings, Sparkles, Square, Star, Sun, Target, Trash2, Trophy, X,
} from "lucide-react";
import { toast } from "sonner";
import { createBackupZip, parseBackupBytes } from "@/lib/backup";
import { BASE_PATH } from "@/lib/basePath";
import { useTheme } from "@/contexts/ThemeContext";

type Screen = "home" | "research" | "interview" | "schedule" | "settings";
type ResearchMode = "research" | "summary" | "progress";
type RankMode = "interest" | "salary" | "benefits";
// The selection process, in order — used both to render the "進捗" pipeline
// board (grouped by stage) and to populate the stage picker in
// CompanyEditor. A company with no stage recorded yet (e.g. restored from an
// older backup) is treated as "未応募" everywhere (see stageOf()).
export const COMPANY_STAGES = ["未応募", "エントリー", "ES提出", "一次面接", "二次面接", "最終面接", "内定", "不合格", "辞退"] as const;
export type CompanyStage = typeof COMPANY_STAGES[number];
export function stageOf(company: Company): CompanyStage { return company.stage ?? "未応募"; }
// A single dated journal entry — "面接後の振り返りメモ" — free-form notes the
// person leaves for themselves after an interview or a stage change.
export type InterviewLogEntry = { id: string; date: string; note: string };
export type Company = { id: string; name: string; industry: string; interest: number; salary: number | null; benefits: string; location: string; philosophy: string; person: string; notes: string; sources: string[]; updatedAt: string; stage?: CompanyStage; interviewLogs?: InterviewLogEntry[] };
export type SelfRating = "excellent" | "good" | "fair" | "poor";
// Top-level cards can be recolored (see CardColorPicker) so a long list of
// otherwise-identical purple tiles is easier to tell apart at a glance —
// e.g. color by theme or by how confident you feel about it. Child cards
// keep the fixed purple/green flip look and don't get their own color.
export const CARD_COLORS = ["purple", "blue", "green", "orange", "pink", "gray"] as const;
export type CardColor = typeof CARD_COLORS[number];
export const CARD_COLOR_LABEL: Record<CardColor, string> = { purple: "紫", blue: "青", green: "緑", orange: "橙", pink: "桃", gray: "灰" };
// A card can be a follow-up on another card (parentId points at it) — e.g.
// the interviewer's likely next question given a particular answer. Child
// cards don't get their own place in the grid or category counts; they only
// show up tucked under their parent, expanded on demand (see
// InterviewScreen's expandedParents/childrenOf). A card can also optionally
// be linked to a company (companyId) — e.g. "なぜ弊社を志望しますか" tied to
// the specific company it was written for.
export type InterviewCard = { id: string; question: string; answer: string; category: string; important?: boolean; checked?: boolean; rating?: SelfRating | null; parentId?: string | null; companyId?: string | null; color?: CardColor };
const RATING_LABEL: Record<SelfRating, string> = { excellent: "優", good: "良", fair: "可", poor: "不可" };
const RATING_ORDER: SelfRating[] = ["excellent", "good", "fair", "poor"];

// Quiz mode: one-card-at-a-time practice, separate from the card management
// screen. Its settings (how many questions, which ratings to draw from)
// persist across visits (see cc_quiz_settings in InterviewHub) so picking
// "10 questions, 優のみ" once doesn't need re-picking every time.
type QuizRatingFilter = SelfRating | "none";
type QuizSettings = { count: number | "all"; ratings: QuizRatingFilter[]; weighted: boolean };
// Higher weight = more likely to be drawn when "苦手優先" is on — poor and
// unrated cards come up most often, cards already marked 優 come up least.
const QUIZ_WEIGHT: Record<QuizRatingFilter, number> = { poor: 5, none: 4, fair: 3, good: 2, excellent: 1 };
function weightedSample<T>(items: T[], weightOf: (item: T) => number, count: number): T[] {
  // Efraimidis-Spirakis weighted sampling without replacement: give every
  // item a random key raised to 1/weight, then just take the top N keys —
  // heavier items tend to land closer to 1 and win more often, but nothing
  // is guaranteed, so a light item can still come up.
  const keyed = items.map((item) => ({ item, key: Math.pow(Math.random(), 1 / weightOf(item)) }));
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, count).map((k) => k.item);
}
const QUIZ_COUNT_OPTIONS: Array<number | "all"> = [5, 10, 15, 20, "all"];
const QUIZ_RATING_OPTIONS: Array<{ key: QuizRatingFilter; label: string }> = [...RATING_ORDER.map((r) => ({ key: r as QuizRatingFilter, label: RATING_LABEL[r] })), { key: "none", label: "未評価" }];
const DEFAULT_QUIZ_SETTINGS: QuizSettings = { count: 10, ratings: QUIZ_RATING_OPTIONS.map((option) => option.key), weighted: false };
export type ScheduleItem = { id: string; title: string; date: string; time: string; category: string; done: boolean };

// UI text size, applied app-wide as a CSS zoom on the whole shell (see Home())
// rather than rewriting every literal px font-size in index.css to a
// calc()'d variable — the app's type scale is almost entirely fixed px, so a
// root font-size change alone wouldn't move anything.
type FontScale = "small" | "standard" | "large";
const FONT_SCALE_VALUE: Record<FontScale, number> = { small: 0.92, standard: 1, large: 1.14 };
const FONT_SCALE_LABEL: Record<FontScale, string> = { small: "小", standard: "標準", large: "大" };

const today = new Date().toISOString().slice(0, 10);
const starterCompanies: Company[] = [
  { id: "company-1", name: "任天堂", industry: "ゲーム", interest: 5, salary: null, benefits: "情報を追加", location: "京都・東京", philosophy: "自分で企業理念を追記", person: "求める人物像を追記", notes: "調べる画面から企業情報を追加できます。", sources: ["https://www.nintendo.co.jp/", "https://www.nintendo.co.jp/jobs/"], updatedAt: today, stage: "エントリー", interviewLogs: [] },
  { id: "company-2", name: "カプコン", industry: "ゲーム", interest: 4, salary: null, benefits: "情報を追加", location: "大阪・東京", philosophy: "", person: "", notes: "", sources: ["https://www.capcom.co.jp/", "https://www.capcom.co.jp/recruit/"], updatedAt: today, stage: "未応募", interviewLogs: [] },
  { id: "company-3", name: "ソニーグループ", industry: "IT・メーカー", interest: 3, salary: null, benefits: "情報を追加", location: "東京ほか", philosophy: "", person: "", notes: "", sources: ["https://www.sony.com/ja/SonyInfo/Jobs/"], updatedAt: today, stage: "未応募", interviewLogs: [] },
];
const starterCards: InterviewCard[] = [
  { id: "card-1", category: "基本", question: "自己紹介をしてください", answer: "大学・専攻・経験・志望につながる強みを1分で話す。" },
  { id: "card-2", category: "志望動機", question: "なぜこの会社を志望しますか？", answer: "企業の特徴 × 自分の経験 × 入社後にしたいことの順で整理する。" },
  { id: "card-3", category: "経験", question: "学生時代に力を入れたことは？", answer: "状況、課題、行動、結果、学び（STAR）で具体的に話す。" },
];
const starterSchedule: ScheduleItem[] = [
  { id: "task-1", title: "企業研究メモを更新", date: today, time: "19:00", category: "企業研究", done: false },
  { id: "task-2", title: "自己紹介を声に出して練習", date: today, time: "21:00", category: "面接", done: false },
  { id: "task-3", title: "ES提出期限を登録", date: "2026-09-20", time: "23:59", category: "選考", done: false },
];

type CloudPayload = { companies?: Company[]; cards?: InterviewCard[]; schedule?: ScheduleItem[] };

function load<T>(key: string, fallback: T): T { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } }
function usePersisted<T>(key: string, initial: T) { const [value, setValue] = useState<T>(() => load(key, initial)); useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value]); return [value, setValue] as const; }
function money(value: number | null) { return value ? `${value.toLocaleString()}万円` : "未入力"; }

function Header({ title, eyebrow, onMenu }: { title: string; eyebrow?: string; onMenu: () => void }) { return <header className="topbar"><button className="icon-button mobile-only" onClick={onMenu}><Menu size={20} /></button><div><p className="eyebrow">{eyebrow ?? "MY JOB HUNTING"}</p><h1>{title}</h1></div><button className="icon-button" onClick={() => toast("入力内容は自動保存されています")}><Check size={18} /></button></header>; }
function Logo() { return <div className="brand-mark"><div className="brand-symbol"><Target size={20} /></div><div><p className="brand-name">Career Compass</p><p className="brand-sub">就活を、迷わず進める。</p></div></div>; }
function BottomNav({ screen, onChange }: { screen: Screen; onChange: (s: Screen) => void }) { const items: Array<{ id: Screen; label: string; Icon: typeof HomeIcon }> = [{ id: "interview", label: "面接", Icon: BookOpen }, { id: "research", label: "企業研究", Icon: BriefcaseBusiness }, { id: "home", label: "ホーム", Icon: HomeIcon }, { id: "schedule", label: "予定", Icon: CalendarDays }, { id: "settings", label: "設定", Icon: Settings }]; return <nav className="bottom-nav">{items.map(({ id, label, Icon }) => <button key={id} className={`nav-item ${screen === id ? "active" : ""}`} onClick={() => onChange(id)}><Icon size={21} /><span>{label}</span></button>)}</nav>; }

function HomeScreen({ companies, schedule, onNavigate }: { companies: Company[]; schedule: ScheduleItem[]; onNavigate: (s: Screen) => void }) {
  const pending = schedule.filter((x) => !x.done).slice(0, 2);
  const cards = load<InterviewCard[]>("cc_cards", starterCards);

  // "注目" — surfaces what's actually time-sensitive right now instead of
  // just static totals: schedule items due within 3 days (or already
  // overdue), and companies mid-process whose entry hasn't been touched in
  // two weeks — easy to lose track of once there are several running at
  // once. Companies already at 未応募/内定/不合格/辞退 aren't "in progress"
  // so staleness there isn't meaningful.
  const now = Date.now();
  const soonCutoff = now + 3 * 24 * 60 * 60 * 1000;
  const upcoming = schedule
    .filter((x) => !x.done && new Date(`${x.date}T${x.time || "23:59"}`).getTime() <= soonCutoff)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .slice(0, 2);
  const inactiveStages = new Set<CompanyStage>(["未応募", "内定", "不合格", "辞退"]);
  const staleCutoffMs = 14 * 24 * 60 * 60 * 1000;
  const stalledCompanies = companies
    .filter((c) => !inactiveStages.has(stageOf(c)) && now - new Date(c.updatedAt).getTime() > staleCutoffMs)
    .slice(0, 2);
  const hasAttention = upcoming.length > 0 || stalledCompanies.length > 0;

  return <div className="screen home-screen"><Header title="おかえりなさい" eyebrow="CAREER COMPASS" onMenu={() => onNavigate("settings")} /><section className="hero-card"><div><p className="eyebrow light">TODAY'S FOCUS</p><h2>次の一歩を、<br /><em>今日のうちに。</em></h2><p className="hero-copy">企業研究と面接準備を、ここでひとつに。</p></div><div className="hero-orbit"><Target size={34} /><span>準備度<br /><strong>{Math.min(100, companies.length * 12 + 34)}%</strong></span></div></section>
    {hasAttention && <section className="attention-card">
      <div className="attention-header"><AlertCircle size={15} /><span>注目</span></div>
      {upcoming.map((task) => <button className="attention-row" key={task.id} onClick={() => onNavigate("schedule")}><span className="attention-dot due" /><span className="attention-content"><strong>{task.title}</strong><small>{task.date} · {task.time} · {task.category}</small></span><ChevronRight size={15} /></button>)}
      {stalledCompanies.map((c) => <button className="attention-row" key={c.id} onClick={() => onNavigate("research")}><span className="attention-dot stalled" /><span className="attention-content"><strong>{c.name}</strong><small>「{stageOf(c)}」のまま2週間以上動きがありません</small></span><ChevronRight size={15} /></button>)}
    </section>}
    <div className="section-heading"><div><p className="eyebrow">OVERVIEW</p><h2>就活の現在地</h2></div><button className="text-button" onClick={() => onNavigate("schedule")}>予定を見る <ChevronRight size={16} /></button></div><section className="overview-grid"><div className="stat-card purple"><BriefcaseBusiness size={19} /><strong>{companies.length}</strong><span>研究中の企業</span></div><div className="stat-card orange"><BookOpen size={19} /><strong>{cards.length}</strong><span>面接カード</span></div><div className="stat-card green"><CalendarDays size={19} /><strong>{pending.length}</strong><span>未完了の予定</span></div></section><div className="section-heading"><div><p className="eyebrow">UP NEXT</p><h2>次にやること</h2></div><button className="icon-button" onClick={() => onNavigate("schedule")}><ChevronRight size={18} /></button></div><section className="task-preview">{pending.length ? pending.map((task) => <button className="task-row" key={task.id} onClick={() => onNavigate("schedule")}><span className="task-dot" /><span className="task-content"><strong>{task.title}</strong><small>{task.date} · {task.time} · {task.category}</small></span><ChevronRight size={17} /></button>) : <div className="empty-state"><Check size={20} />すべて完了。いいペースです。</div>}</section><section className="tip-card"><Lightbulb size={20} /><div><strong>続けるコツ</strong><p>企業を調べたら、志望理由を一文だけ書いておくと面接カードに変わります。</p></div></section></div>;
}

function ResearchScreen({ companies, setCompanies, cards, onNavigate }: { companies: Company[]; setCompanies: Dispatch<SetStateAction<Company[]>>; cards: InterviewCard[]; onNavigate: (s: Screen) => void }) {
  const [mode, setMode] = useState<ResearchMode>("research");
  const [rank, setRank] = useState<RankMode>("interest");
  const [industry, setIndustry] = useState("すべて");
  // Kept separate from newCompanyName below — one text field used to double
  // as both "filter the list" and "name the company you're adding", which
  // read as a single search box but silently did nothing when you typed
  // into it on the 調べる tab (it only ever filtered the まとめ ranking).
  // Splitting them means typing here actually narrows what you're looking
  // at, and typing a new company name never gets mistaken for a filter.
  const [searchQuery, setSearchQuery] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newIndustry, setNewIndustry] = useState("ゲーム");
  const [selected, setSelected] = useState<Company | null>(null);
  const industries = ["すべて", ...Array.from(new Set(companies.map((c) => c.industry)))];
  const filtered = companies.filter((c) => (industry === "すべて" || c.industry === industry) && c.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => rank === "interest" ? b.interest - a.interest : rank === "salary" ? (b.salary ?? -1) - (a.salary ?? -1) : b.benefits.length - a.benefits.length);

  const add = () => { const name = newCompanyName.trim(); if (!name) return toast.error("企業名を入力してください"); const company: Company = { id: `company-${Date.now()}`, name, industry: newIndustry, interest: 3, salary: null, benefits: "調査して追記", location: "未入力", philosophy: "", person: "", notes: "調べた情報をここに整理", sources: [`https://www.google.com/search?q=${encodeURIComponent(`${name} 採用 公式`)}`], updatedAt: today, stage: "未応募", interviewLogs: [] }; setCompanies((current) => [...current, company]); setNewCompanyName(""); setSelected(company); toast.success(`${name}を追加しました`); };
  const save = (updated: Company) => { setCompanies((current) => current.map((c) => c.id === updated.id ? { ...updated, updatedAt: today } : c)); setSelected({ ...updated, updatedAt: today }); toast.success("企業情報を保存しました"); };
  const updateStage = (id: string, stage: CompanyStage) => setCompanies((current) => current.map((c) => c.id === id ? { ...c, stage, updatedAt: today } : c));

  // Both the plain list and the ranking board reorder the same underlying
  // `companies` array — just starting from a different visible subset (the
  // full list here, the filtered+sorted one there) — so they share one
  // remap: reorder the ids that are currently visible, leaving any
  // filtered-out company right where it already was.
  const reorderCompanies = (visibleIds: string[]) => {
    const visibleSet = new Set(visibleIds);
    setCompanies((current) => {
      const byId = new Map(current.map((c) => [c.id, c]));
      let cursor = 0;
      return current.map((c) => (visibleSet.has(c.id) ? byId.get(visibleIds[cursor++])! : c));
    });
  };
  const companyDrag = useDragReorder(".company-card");
  const rankDrag = useDragReorder(".ranking-row");

  return <div className="screen">
    <Header title="企業研究" eyebrow="COMPANY RESEARCH" onMenu={() => onNavigate("settings")} />
    <div className="segmented-tabs research-tabs"><button className={mode === "research" ? "active" : ""} onClick={() => setMode("research")}><Search size={16} />調べる</button><button className={mode === "summary" ? "active" : ""} onClick={() => setMode("summary")}><Trophy size={16} />まとめ</button><button className={mode === "progress" ? "active" : ""} onClick={() => setMode("progress")}><Target size={16} />進捗</button></div>
    {mode === "research" ? <>
      <section className="research-intro"><div className="intro-icon"><Sparkles size={22} /></div><div><p className="eyebrow">RESEARCH DESK</p><h2>企業名から、研究メモを始める</h2><p>公式サイト・採用ページなどの参考URLを残しながら、自分の言葉で情報を整理できます。</p></div></section>
      <div className="add-company-box">
        <input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="新しい企業名を入力（例：任天堂）" />
        <select value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)}><option>ゲーム</option><option>IT・Web</option><option>メーカー</option><option>商社</option><option>その他</option></select>
        <button className="primary-button" onClick={add}><Plus size={17} />追加</button>
      </div>
      <div className="section-heading compact"><div><p className="eyebrow">YOUR LIST</p><h2>追加した企業 <span className="count-badge">{companies.length}</span></h2></div></div>
      <div className="search-box"><Search size={19} /><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="企業名で絞り込み" />{searchQuery && <button className="icon-button" aria-label="絞り込みをクリア" onClick={() => setSearchQuery("")}><X size={16} /></button>}</div>
      <div className="card-filter"><span>{searchQuery ? `${filtered.length} / ${companies.length} companies` : `${companies.length} companies`}</span><span className="hint"><GripVertical size={14} />長押しで並び替え</span></div>
      <div className="company-list" ref={companyDrag.containerRef} onPointerMove={(event) => companyDrag.move(event, reorderCompanies)} onPointerUp={companyDrag.end} onPointerCancel={companyDrag.end}>
        {filtered.map((c) => <button
          key={c.id}
          className={`company-card ${companyDrag.draggingId === c.id ? "dragging" : ""}`}
          onPointerDown={(event) => companyDrag.start(c.id, event, filtered.map((x) => x.id))}
          onClick={() => { if (companyDrag.justDraggedRef.current) return; setSelected(c); }}
        ><div className="company-avatar">{c.name.slice(0, 1)}</div><div className="company-card-main"><div className="company-title"><strong>{c.name}</strong><span className="industry-tag">{c.industry}</span><span className="stage-tag">{stageOf(c)}</span></div><div className="company-meta"><span>勤務地 {c.location}</span><span>志望度 {"★".repeat(c.interest)}{"☆".repeat(5 - c.interest)}</span></div></div><ChevronRight size={18} /></button>)}
        {!filtered.length && <div className="empty-state large"><Search size={24} />「{searchQuery}」に一致する企業がありません。</div>}
      </div>
    </> : mode === "progress" ? <>
      <section className="summary-banner"><div><p className="eyebrow light">PIPELINE</p><h2>選考の進み具合を、<br />ひと目で確認する</h2><p>ステージごとに企業をまとめました。プルダウンから今の状況をすぐ更新できます。</p></div><Target size={54} strokeWidth={1.5} /></section>
      <div className="stage-board">
        {COMPANY_STAGES.map((stage) => {
          const inStage = companies.filter((c) => stageOf(c) === stage);
          if (!inStage.length) return null;
          return <div className="stage-column" key={stage}>
            <div className="stage-column-heading"><h3>{stage}</h3><span className="count-badge">{inStage.length}</span></div>
            {inStage.map((c) => <div className="stage-company-row" key={c.id}>
              <button className="stage-company-name" onClick={() => setSelected(c)}><strong>{c.name}</strong><span>{c.industry}</span></button>
              <select value={stageOf(c)} onChange={(event) => updateStage(c.id, event.target.value as CompanyStage)}>{COMPANY_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </div>)}
          </div>;
        })}
        {!companies.length && <div className="empty-state large"><BriefcaseBusiness size={24} />「調べる」から企業を追加してください。</div>}
      </div>
    </> : <>
      <section className="summary-banner"><div><p className="eyebrow light">SUMMARY BOARD</p><h2>企業を比べて、<br />志望度を整理する</h2><p>ランキングは志望度などから自動で並び替え、長押しで自分の順位に調整できます。</p></div><Trophy size={54} strokeWidth={1.5} /></section>
      <div className="chip-row">{industries.map((item) => <button key={item} className={`chip ${industry === item ? "selected" : ""}`} onClick={() => setIndustry(item)}>{item}</button>)}</div>
      <div className="rank-tabs"><button className={rank === "interest" ? "active" : ""} onClick={() => setRank("interest")}><Trophy size={16} />志望度</button><button className={rank === "salary" ? "active" : ""} onClick={() => setRank("salary")}><span className="yen-icon">¥</span>年収</button><button className={rank === "benefits" ? "active" : ""} onClick={() => setRank("benefits")}><span>＋</span>福利厚生</button></div>
      <div className="card-filter"><span className="hint"><GripVertical size={14} />長押しで並び替え</span></div>
      <div className="ranking-list" ref={rankDrag.containerRef} onPointerMove={(event) => rankDrag.move(event, reorderCompanies)} onPointerUp={rankDrag.end} onPointerCancel={rankDrag.end}>
        {sorted.map((c, i) => <div
          key={c.id}
          className={`ranking-row ${rankDrag.draggingId === c.id ? "dragging" : ""}`}
          onPointerDown={(event) => rankDrag.start(c.id, event, sorted.map((x) => x.id))}
        ><div className={`rank-number rank-${i + 1}`}>{i + 1}</div><div className="company-avatar small">{c.name.slice(0, 1)}</div><button className="ranking-info" onClick={() => { if (rankDrag.justDraggedRef.current) return; setSelected(c); }}><strong>{c.name}</strong><span>{c.industry} · {c.location}</span></button><div className="ranking-value"><small>{rank === "interest" ? "志望度" : rank === "salary" ? "想定年収" : "福利厚生"}</small><strong>{rank === "interest" ? `★ ${c.interest}/5` : rank === "salary" ? money(c.salary) : c.benefits === "情報を追加" ? "未入力" : "登録済み"}</strong></div></div>)}
        {!sorted.length && <div className="empty-state large"><BriefcaseBusiness size={24} />「調べる」から企業を追加してください。</div>}
      </div>
    </>}
    {selected && <CompanyEditor company={selected} cards={cards} onClose={() => setSelected(null)} onSave={save} onDelete={() => { setCompanies((c) => c.filter((x) => x.id !== selected.id)); setSelected(null); toast.success("企業を削除しました"); }} />}
  </div>;
}
function CompanyEditor({ company, cards, onClose, onSave, onDelete }: { company: Company; cards: InterviewCard[]; onClose: () => void; onSave: (c: Company) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(company);
  // The modal grew a lot once ステータス, 振り返りメモ and 紐づくカード were
  // added on top of the original basic-info form — enough that it read as
  // one long wall of fields. Splitting it into tabs means only one section's
  // worth of controls is visible at a time.
  const [tab, setTab] = useState<"basic" | "progress" | "cards">("basic");
  const update = (key: keyof Company, value: string | number | null | string[]) => setDraft((d) => ({ ...d, [key]: value }));
  const [logDraft, setLogDraft] = useState({ date: today, note: "" });
  const logs = draft.interviewLogs ?? [];
  const addLog = () => {
    if (!logDraft.note.trim()) return toast.error("メモを入力してください");
    const entry: InterviewLogEntry = { id: `log-${Date.now()}`, date: logDraft.date, note: logDraft.note.trim() };
    setDraft((d) => ({ ...d, interviewLogs: [entry, ...(d.interviewLogs ?? [])] }));
    setLogDraft({ date: today, note: "" });
  };
  const removeLog = (id: string) => setDraft((d) => ({ ...d, interviewLogs: (d.interviewLogs ?? []).filter((l) => l.id !== id) }));
  // Interview cards written specifically for this company — linked from the
  // card's own editor (see InterviewScreen's company picker). Shown here
  // read-only, as a quick "what have I already prepared for them" reminder.
  const linkedCards = cards.filter((card) => card.companyId === company.id && !card.parentId);
  return <div className="modal-backdrop" onClick={onClose}><section className="editor-modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">COMPANY NOTE</p><h2>{draft.name}</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>
    <div className="segmented-tabs editor-tabs">
      <button className={tab === "basic" ? "active" : ""} onClick={() => setTab("basic")}>基本情報</button>
      <button className={tab === "progress" ? "active" : ""} onClick={() => setTab("progress")}>進捗・メモ{logs.length > 0 && <small>{logs.length}</small>}</button>
      <button className={tab === "cards" ? "active" : ""} onClick={() => setTab("cards")}>紐づくカード{linkedCards.length > 0 && <small>{linkedCards.length}</small>}</button>
    </div>
    {tab === "basic" && <div className="form-grid"><label>企業名<input value={draft.name} onChange={(e) => update("name", e.target.value)} /></label><label>業界<input value={draft.industry} onChange={(e) => update("industry", e.target.value)} /></label><label>志望度<select value={draft.interest} onChange={(e) => update("interest", Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></label><label>年収（万円）<input type="number" value={draft.salary ?? ""} placeholder="未入力" onChange={(e) => update("salary", e.target.value ? Number(e.target.value) : null)} /></label><label className="wide">勤務地<input value={draft.location} onChange={(e) => update("location", e.target.value)} /></label><label className="wide">福利厚生<textarea value={draft.benefits} onChange={(e) => update("benefits", e.target.value)} /></label><label className="wide">企業理念<textarea value={draft.philosophy} onChange={(e) => update("philosophy", e.target.value)} placeholder="企業理念・ミッションを記入" /></label><label className="wide">求める人物像<textarea value={draft.person} onChange={(e) => update("person", e.target.value)} placeholder="採用ページなどから記入" /></label><label className="wide">自分のメモ<textarea value={draft.notes} onChange={(e) => update("notes", e.target.value)} /></label><label className="wide">参考URL（1行に1つ）<textarea value={draft.sources.join("\n")} onChange={(e) => update("sources", e.target.value.split("\n").filter(Boolean))} /></label></div>}
    {tab === "progress" && <>
      <div className="form-grid"><label className="wide">選考ステータス<div className="chip-row">{COMPANY_STAGES.map((s) => <button type="button" key={s} className={`chip ${stageOf(draft) === s ? "selected" : ""}`} onClick={() => update("stage", s)}>{s}</button>)}</div></label></div>
      <div className="editor-section flush">
        <h3>面接後の振り返りメモ</h3>
        <div className="reflection-log-form"><input type="date" value={logDraft.date} onChange={(event) => setLogDraft((d) => ({ ...d, date: event.target.value }))} /><AutoGrowTextarea value={logDraft.note} onChange={(event) => setLogDraft((d) => ({ ...d, note: event.target.value }))} placeholder="面接で聞かれたこと、手応え、次に活かしたい点など" /><button type="button" className="secondary-button" onClick={addLog}><Plus size={15} />メモを追加</button></div>
        <div className="reflection-log-list">
          {logs.map((entry) => <div className="reflection-log-entry" key={entry.id}><div className="reflection-log-main"><small>{entry.date}</small><p>{entry.note}</p></div><button type="button" className="icon-button" aria-label="メモを削除" onClick={() => removeLog(entry.id)}><Trash2 size={14} /></button></div>)}
          {!logs.length && <p className="child-empty-hint">まだ振り返りメモがありません。面接の後に、気づいたことを残しておきましょう。</p>}
        </div>
      </div>
    </>}
    {tab === "cards" && <div className="editor-section flush">
      <h3>紐づいている面接カード</h3>
      <div className="linked-cards-list">
        {linkedCards.map((card) => <div className="linked-card-row" key={card.id}><span className="card-label">{card.category}</span><p>{card.question}</p></div>)}
        {!linkedCards.length && <p className="child-empty-hint">面接カードの編集画面から、この企業向けの質問を紐づけられます。</p>}
      </div>
    </div>}
    <div className="modal-footer"><button className="danger-button" onClick={onDelete}><Trash2 size={16} />削除</button><div><button className="secondary-button" onClick={onClose}>キャンセル</button><button className="primary-button" onClick={() => onSave(draft)}><Check size={16} />保存する</button></div></div></section></div>;
}

// A single "add / edit interview card" category field: pick from the
// existing categories, or switch to a text input to create a brand new one.
// `resetKey` forces the internal select/new-input mode to re-sync with
// `value` whenever the surrounding form is reset or points at a new card
// (React only reads useState's initial value once per mount, so without
// this the picker could get stuck showing the wrong mode after a save).
// A textarea that grows to fit its whole value instead of scrolling inside
// a fixed-height box. The surrounding modal/page already scrolls, so a long
// interview answer becomes readable by scrolling the page once, instead of
// hunting for it through a cramped 3-line window inside the field itself.
function AutoGrowTextarea({ value, className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} value={value} className={`autogrow ${className ?? ""}`.trim()} {...rest} />;
}

function CategoryPicker({ value, categories, onChange, resetKey }: { value: string; categories: string[]; onChange: (value: string) => void; resetKey: string | number }) {
  const [mode, setMode] = useState<"select" | "new">(value && !categories.includes(value) ? "new" : "select");
  useEffect(() => { setMode(value && !categories.includes(value) ? "new" : "select"); }, [resetKey]);
  const selectValue = mode === "new" ? "__new__" : categories.includes(value) ? value : (categories[0] ?? "__new__");
  return <>
    <select value={selectValue} onChange={(event) => { if (event.target.value === "__new__") { setMode("new"); onChange(""); } else { setMode("select"); onChange(event.target.value); } }}>
      {categories.map((item) => <option key={item} value={item}>{item}</option>)}
      <option value="__new__">＋ 新しいカテゴリを作成</option>
    </select>
    {mode === "new" && <input autoFocus placeholder="新しいカテゴリ名を入力" value={value} onChange={(event) => onChange(event.target.value)} />}
  </>;
}

// A row of color swatches for recoloring a top-level interview card (see
// CARD_COLORS) — the selected swatch gets a checkmark rather than relying on
// a border alone, so the choice still reads clearly for anyone who can't
// distinguish the hues from each other.
function CardColorPicker({ value, onChange }: { value: CardColor; onChange: (color: CardColor) => void }) {
  return <div className="color-swatch-row">
    {CARD_COLORS.map((c) => <button type="button" key={c} className={`color-swatch color-swatch-${c}`} aria-label={CARD_COLOR_LABEL[c]} aria-pressed={value === c} onClick={() => onChange(c)}>{value === c && <Check size={13} />}</button>)}
  </div>;
}

// Renaming for the interview card categories. Reordering used to live here
// too (long-press the grip icon to drag a row), but that's now done inline
// on the category chips themselves (see startCategoryDrag/moveCategoryDrag/
// endCategoryDrag in InterviewScreen) — this modal is rename-only now.
const LONG_PRESS_MS = 350;

// Generic long-press-to-drag reordering: press an item to lift it, drag to
// the slot it should land in. Same mechanics as the interview cards and
// category chips (see startCardDrag/moveCardDrag/endCardDrag and
// startCategoryDrag/moveCategoryDrag/endCategoryDrag in InterviewScreen) —
// pulled into one hook here for the company list and ranking list, which
// need the identical pattern twice more: pointer capture goes on the STABLE
// container (never the item itself, which React reorders mid-drag — losing
// capture on a reparented element would silently strand the drag), and the
// live order lives in a ref so a fast pointermove never reads a stale array
// from a not-yet-flushed setState.
function useDragReorder(itemSelector: string) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragState = useRef<{ id: string; pointerId: number; startX: number; startY: number; timer: ReturnType<typeof setTimeout> | null; dragging: boolean; el: HTMLElement } | null>(null);
  const justDraggedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef<string[]>([]);

  const start = (id: string, event: React.PointerEvent, visibleIds: string[]) => {
    const pointerId = event.pointerId;
    const el = event.currentTarget as HTMLElement;
    const timer = setTimeout(() => {
      if (dragState.current) {
        dragState.current.dragging = true;
        justDraggedRef.current = true;
        orderRef.current = visibleIds;
        setDraggingId(id);
        // Only once the hold is confirmed as a drag (not on every touch) do
        // we take this item out of the native touch-scroll gesture — see
        // the comment above .flashcard-wrap in index.css for why this can't
        // just be a permanent CSS rule without breaking ordinary scrolling.
        dragState.current.el.style.touchAction = "none";
        containerRef.current?.setPointerCapture(pointerId);
      }
    }, LONG_PRESS_MS);
    dragState.current = { id, pointerId, startX: event.clientX, startY: event.clientY, timer, dragging: false, el };
  };
  const move = (event: React.PointerEvent, onReorder: (nextOrder: string[]) => void) => {
    const state = dragState.current;
    if (!state) return;
    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;
    if (!state.dragging) {
      // A quick swipe (e.g. scrolling the page) cancels the pending
      // long-press instead of hijacking the gesture.
      if (Math.hypot(deltaX, deltaY) > 12 && state.timer) { clearTimeout(state.timer); dragState.current = null; }
      return;
    }
    const items = Array.from(containerRef.current?.querySelectorAll<HTMLElement>(itemSelector) ?? []);
    if (!items.length) return;
    let closestIndex = -1;
    let closestDist = Infinity;
    items.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const dist = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
      if (dist < closestDist) { closestDist = dist; closestIndex = i; }
    });
    const order = orderRef.current;
    const fromIndex = order.indexOf(state.id);
    if (fromIndex === -1 || closestIndex === -1 || closestIndex === fromIndex) return;
    const nextOrder = [...order];
    nextOrder.splice(fromIndex, 1);
    nextOrder.splice(closestIndex, 0, state.id);
    orderRef.current = nextOrder;
    onReorder(nextOrder);
  };
  const end = () => {
    if (dragState.current?.timer) clearTimeout(dragState.current.timer);
    if (dragState.current) dragState.current.el.style.touchAction = "";
    dragState.current = null;
    setDraggingId(null);
    setTimeout(() => { justDraggedRef.current = false; }, 0);
  };
  return { draggingId, justDraggedRef, containerRef, start, move, end };
}

function CategoryManager({ categories, onRename, onClose }: { categories: string[]; onRename: (oldName: string, newName: string) => void; onClose: () => void }) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const commitRename = (name: string) => { onRename(name, editValue); setEditingName(null); };

  return <div className="modal-backdrop" onClick={onClose}>
    <section className="editor-modal category-manager-modal" onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><div><p className="eyebrow">CATEGORIES</p><h2>カテゴリ名を変更</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>
      <p className="category-manager-hint">名前をタップすると変更できます（そのカテゴリの全カードにも反映されます）。並び替えは、カテゴリのボタン自体を長押ししてドラッグしてください。</p>
      <div className="category-manager-list">
        {categories.map((name) => <div key={name} className="category-manager-row">
          {editingName === name
            ? <input autoFocus value={editValue} onChange={(event) => setEditValue(event.target.value)} onBlur={() => commitRename(name)} onKeyDown={(event) => { if (event.key === "Enter") commitRename(name); if (event.key === "Escape") setEditingName(null); }} />
            : <button className="category-manager-name" onClick={() => { setEditingName(name); setEditValue(name); }}>{name}<Pencil size={13} /></button>}
        </div>)}
        {!categories.length && <div className="empty-state"><BookOpen size={18} />カテゴリはまだありません。</div>}
      </div>
    </section>
  </div>;
}

// Long-press-to-drag reordering for the interview cards themselves, applied
// straight to the cards in the grid (see startCardDrag/moveCardDrag/
// endCardDrag in InterviewScreen below) — no separate "reorder" screen or
// button needed; press and hold a card, then drag it where it should go.

// A stopwatch for timing a practice answer: tap to start, tap again to
// pause, and (once paused) a small reset button appears to zero it out.
// Elapsed time is always derived from Date.now() minus a recorded start
// instant rather than incremented tick by tick, so it can't drift even if
// the interval is throttled (e.g. the phone screen dims mid-answer).
function InterviewTimer() {
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (startedAtRef.current != null) setElapsedMs(Date.now() - startedAtRef.current);
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  const toggle = () => {
    if (running) {
      setRunning(false);
    } else {
      startedAtRef.current = Date.now() - elapsedMs;
      setRunning(true);
    }
  };
  const reset = () => {
    setRunning(false);
    setElapsedMs(0);
    startedAtRef.current = null;
  };

  const totalSeconds = Math.floor(elapsedMs / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");

  return <div className="timer-bar">
    <div className={`interview-timer ${running ? "running" : ""}`}>
      <button className="timer-toggle" aria-label={running ? "タイマーを一時停止" : "タイマーを開始"} onClick={toggle}>
        {running ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        <span className="timer-display">{mm}:{ss}</span>
      </button>
      {!running && elapsedMs > 0 && <button className="timer-reset" aria-label="タイマーをリセット" onClick={reset}><RotateCcw size={14} /></button>}
    </div>
  </div>;
}

// A child card can itself have children (and so on) — an interviewer's
// follow-up can have its OWN likely follow-up. Deleting a card must take its
// whole subtree with it, not just its direct children, so this walks the
// parentId chain recursively rather than filtering one level at a time.
function collectDescendantIds(cards: InterviewCard[], id: string): string[] {
  const direct = cards.filter((card) => card.parentId === id).map((card) => card.id);
  return direct.concat(...direct.map((childId) => collectDescendantIds(cards, childId)));
}

// Renders one follow-up ("child") card and, recursively, its own follow-ups —
// same flip/star/rating/child-toggle behavior as a top-level card, just in a
// compact vertical thread instead of a grid tile, and indented one notch per
// nesting level so a multi-level thread still reads as a hierarchy. All the
// state it touches (flip, ratings, expanded panels, the add-child form) lives
// in the parent InterviewScreen and is simply threaded through, since a card
// anywhere in the tree is just another id to those handlers.
function ChildCardView({ card, depth, flipped, setFlipped, toggleImportant, toggleChecked, setRating, expandedParents, toggleChildren, childrenOf, addingChildFor, setAddingChildFor, childDraft, setChildDraft, addChild, setEditing }: {
  card: InterviewCard;
  depth: number;
  flipped: string | null;
  setFlipped: Dispatch<SetStateAction<string | null>>;
  toggleImportant: (id: string) => void;
  toggleChecked: (id: string) => void;
  setRating: (id: string, rating: SelfRating) => void;
  expandedParents: string[];
  toggleChildren: (id: string) => void;
  childrenOf: (parentId: string) => InterviewCard[];
  addingChildFor: string | null;
  setAddingChildFor: Dispatch<SetStateAction<string | null>>;
  childDraft: { question: string; answer: string };
  setChildDraft: Dispatch<SetStateAction<{ question: string; answer: string }>>;
  addChild: (parent: InterviewCard) => void;
  setEditing: Dispatch<SetStateAction<InterviewCard | null>>;
}) {
  const children = childrenOf(card.id);
  const isFlipped = flipped === card.id;
  const isExpanded = expandedParents.includes(card.id);
  return <div className="child-card-node" style={depth > 1 ? { marginLeft: 16 } : undefined}>
    <div className="child-card">
      <button className={`child-flashcard ${isFlipped ? "flipped" : ""}`} onClick={() => setFlipped(isFlipped ? null : card.id)}>
        <span className="child-role">{isFlipped ? "自分" : "面接官"}</span>
        <p className="child-face-text">{isFlipped ? card.answer : card.question}</p>
        <span className="flip-hint">{isFlipped ? <>もう一度タップで質問へ <RefreshCw size={13} /></> : <>タップして答えを見る <ChevronRight size={13} /></>}</span>
      </button>
      <button className="icon-button" aria-label={`${card.question}を編集`} onClick={() => setEditing(card)}><Settings size={13} /></button>
    </div>
    <div className="child-card-footer">
      <button className={`star-toggle small ${card.important ? "active" : ""}`} aria-label={card.important ? "重要を解除" : "重要にする"} onClick={() => toggleImportant(card.id)}><Star size={13} fill={card.important ? "currentColor" : "none"} /></button>
      <button className={`check-toggle small ${card.checked ? "active" : ""}`} aria-label={card.checked ? "対策済みを解除" : "対策済みにする"} onClick={() => toggleChecked(card.id)}><CheckCircle2 size={13} fill={card.checked ? "currentColor" : "none"} /></button>
      <button className={`child-toggle small ${isExpanded ? "active" : ""}`} onClick={() => toggleChildren(card.id)}><MessageSquare size={12} />子カード{children.length > 0 && ` (${children.length})`}</button>
      <div className="rating-group small">{RATING_ORDER.map((r) => <button key={r} className={`rating-${r} ${card.rating === r ? "active" : ""}`} onClick={() => setRating(card.id, r)}>{RATING_LABEL[r]}</button>)}</div>
    </div>
    {isExpanded && <div className="child-card-panel nested">
      {children.map((child) => <ChildCardView key={child.id} card={child} depth={depth + 1} flipped={flipped} setFlipped={setFlipped} toggleImportant={toggleImportant} toggleChecked={toggleChecked} setRating={setRating} expandedParents={expandedParents} toggleChildren={toggleChildren} childrenOf={childrenOf} addingChildFor={addingChildFor} setAddingChildFor={setAddingChildFor} childDraft={childDraft} setChildDraft={setChildDraft} addChild={addChild} setEditing={setEditing} />)}
      {!children.length && addingChildFor !== card.id && <p className="child-empty-hint">まだ子カードがありません。想定される深掘り質問を追加しましょう。</p>}
      {addingChildFor === card.id
        ? <div className="child-add-form">
            <AutoGrowTextarea value={childDraft.question} onChange={(event) => setChildDraft({ ...childDraft, question: event.target.value })} placeholder="面接官からの深掘り質問" />
            <AutoGrowTextarea value={childDraft.answer} onChange={(event) => setChildDraft({ ...childDraft, answer: event.target.value })} placeholder="自分の回答" />
            <div className="child-add-actions">
              <button className="secondary-button" onClick={() => { setAddingChildFor(null); setChildDraft({ question: "", answer: "" }); }}>キャンセル</button>
              <button className="primary-button" onClick={() => addChild(card)}><Check size={14} />追加</button>
            </div>
          </div>
        : <button className="child-add-button" onClick={() => { setAddingChildFor(card.id); setChildDraft({ question: "", answer: "" }); }}><Plus size={14} />子カードを追加</button>}
    </div>}
  </div>;
}

function InterviewScreen({ cards, setCards, companies, onNavigate, onBack }: { cards: InterviewCard[]; setCards: Dispatch<SetStateAction<InterviewCard[]>>; companies: Company[]; onNavigate: (s: Screen) => void; onBack: () => void }) {
  const [flipped, setFlipped] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<InterviewCard | null>(null);
  const [category, setCategory] = useState("すべて");
  const [managingCategories, setManagingCategories] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [draft, setDraft] = useState<{ question: string; answer: string; category: string; companyId: string | null; color: CardColor }>({ question: "", answer: "", category: "基本", companyId: null, color: "purple" });
  const companyName = (id: string | null | undefined) => companies.find((c) => c.id === id)?.name;
  // Long-press-to-drag reordering, applied straight to the cards in the
  // grid — press and hold a card, then drag it over the slot it should land
  // in. `justDraggedRef` swallows the click a long-press-and-release
  // normally fires on the flip button right after, so finishing a drag
  // never also flips the card it was just dropped on.
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const cardDragState = useRef<{ id: string; pointerId: number; startX: number; startY: number; timer: ReturnType<typeof setTimeout> | null; dragging: boolean; el: HTMLElement } | null>(null);
  const justDraggedRef = useRef(false);
  const cardGridRef = useRef<HTMLDivElement>(null);
  const [categoryOrder, setCategoryOrder] = usePersisted<string[]>("cc_card_categories", Array.from(new Set(starterCards.map((card) => card.category))));

  // Keep categoryOrder in sync with whatever categories actually show up on
  // cards (e.g. restored from a backup, or from the starter data), without
  // ever dropping a category the user created but hasn't used yet.
  useEffect(() => {
    const missing = Array.from(new Set(cards.map((card) => card.category))).filter((item) => !categoryOrder.includes(item));
    if (missing.length) setCategoryOrder((current) => [...current, ...missing]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const categories = ["すべて", ...categoryOrder];
  // Child (follow-up) cards never get their own grid slot or category count —
  // they only appear tucked under their parent, so every list/count here
  // works from the top-level cards only.
  const topLevelCards = cards.filter((card) => !card.parentId);
  const categoryScoped = category === "すべて" ? topLevelCards : topLevelCards.filter((card) => card.category === category);
  // Search looks at the question and answer text of the card itself, plus
  // any of its child (follow-up) cards — a card whose own text doesn't
  // mention "ゲーム" but whose follow-up answer does should still surface.
  const trimmedSearch = searchQuery.trim().toLowerCase();
  const cardMatches = (card: InterviewCard) => `${card.question}${card.answer}`.toLowerCase().includes(trimmedSearch);
  // Descendants can be nested arbitrarily deep, so a match anywhere further
  // down a card's follow-up thread should still surface the top-level card.
  const descendantMatches = (parentId: string): boolean => cards.some((child) => child.parentId === parentId && (cardMatches(child) || descendantMatches(child.id)));
  const visibleCards = trimmedSearch ? categoryScoped.filter((card) => cardMatches(card) || descendantMatches(card.id)) : categoryScoped;
  const childrenOf = (parentId: string) => cards.filter((card) => card.parentId === parentId);

  const ensureCategory = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && !categoryOrder.includes(trimmed)) setCategoryOrder((current) => [...current, trimmed]);
    return trimmed;
  };
  const renameCategory = (oldName: string, newNameRaw: string) => {
    const newName = newNameRaw.trim();
    if (!newName || newName === oldName) return;
    if (categoryOrder.includes(newName)) return toast.error("そのカテゴリ名はすでに使われています");
    setCategoryOrder((current) => current.map((item) => (item === oldName ? newName : item)));
    setCards((current) => current.map((card) => (card.category === oldName ? { ...card, category: newName } : card)));
    if (category === oldName) setCategory(newName);
    if (draft.category === oldName) setDraft((current) => ({ ...current, category: newName }));
    toast.success("カテゴリ名を変更しました");
  };
  // A near-duplicate question is easy to end up with once there are a lot of
  // cards (forgetting one was already written, or a follow-up that
  // duplicates a top-level question) — checked case/whitespace-insensitively
  // against every existing card, top-level or child, before actually saving.
  const normalizeQuestion = (text: string) => text.trim().toLowerCase();
  const findDuplicateQuestion = (text: string, excludeId?: string) => cards.find((card) => card.id !== excludeId && normalizeQuestion(card.question) === normalizeQuestion(text));
  const confirmDuplicate = (onConfirm: () => void) => toast("同じ質問のカードがすでにあります。追加しますか？", { duration: 8000, action: { label: "追加する", onClick: onConfirm } });
  const doAdd = () => {
    const finalCategory = ensureCategory(draft.category) || "基本";
    // New cards go to the front, not the back — a card you just wrote about
    // is usually the one you want to see (and keep practicing) first.
    setCards((current) => [{ ...draft, category: finalCategory, id: `card-${Date.now()}` }, ...current]);
    setDraft({ question: "", answer: "", category: "基本", companyId: null, color: "purple" });
    setShow(false);
    toast.success("面接カードを追加しました");
  };
  const add = () => {
    if (!draft.question || !draft.answer) return toast.error("質問と答えを入力してください");
    if (findDuplicateQuestion(draft.question)) return confirmDuplicate(doAdd);
    doAdd();
  };
  const saveEdit = () => {
    if (!editing || !editing.question || !editing.answer) return toast.error("質問と答えを入力してください");
    const finalCategory = ensureCategory(editing.category) || editing.category;
    setCards((current) => current.map((card) => card.id === editing.id ? { ...editing, category: finalCategory } : card));
    setEditing(null);
    toast.success("面接カードを更新しました");
  };
  const toggleImportant = (id: string) => setCards((current) => current.map((card) => card.id === id ? { ...card, important: !card.important } : card));
  const toggleChecked = (id: string) => setCards((current) => current.map((card) => card.id === id ? { ...card, checked: !card.checked } : card));
  // Tapping the currently-selected rating again clears it, so "no rating
  // yet" stays reachable without a separate button.
  const setRating = (id: string, rating: SelfRating) => setCards((current) => current.map((card) => card.id === id ? { ...card, rating: card.rating === rating ? null : rating } : card));

  // Child cards (follow-up Q&A for a given parent) are hidden by default —
  // expandedParents just tracks which parents currently have theirs open,
  // toggled by the "子カード" button. Any number of parents can be expanded
  // at once, independently.
  // Collapsed by default (the familiar single scrolling row); pressing the
  // "カテゴリ" label wraps every category chip onto as many rows as it takes,
  // which is much faster to scan once there are more than a handful.
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [expandedParents, setExpandedParents] = useState<string[]>([]);
  const toggleChildren = (id: string) => setExpandedParents((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  const [addingChildFor, setAddingChildFor] = useState<string | null>(null);
  const [childDraft, setChildDraft] = useState({ question: "", answer: "" });
  const doAddChild = (parent: InterviewCard) => {
    // A child inherits its parent's category rather than picking its own —
    // it's never shown in a category-filtered list anyway, so exposing a
    // picker for it would just be a control that does nothing.
    setCards((current) => [...current, { id: `card-${Date.now()}`, question: childDraft.question, answer: childDraft.answer, category: parent.category, parentId: parent.id }]);
    setChildDraft({ question: "", answer: "" });
    setAddingChildFor(null);
    toast.success("子カードを追加しました");
  };
  const addChild = (parent: InterviewCard) => {
    if (!childDraft.question || !childDraft.answer) return toast.error("質問と答えを入力してください");
    if (findDuplicateQuestion(childDraft.question)) return confirmDuplicate(() => doAddChild(parent));
    doAddChild(parent);
  };

  // The live order during a drag lives in this ref, not in `cards`/
  // `visibleCards` — a fast drag can fire several pointermove events before
  // React has re-rendered from the previous one's setCards call, and reading
  // fromIndex back out of the (still stale) state on those events would
  // repeatedly compute the card's OLD position and make the reorder stall
  // or thrash instead of tracking the pointer.
  const dragOrderRef = useRef<string[]>([]);
  const startCardDrag = (id: string, event: React.PointerEvent<HTMLDivElement>) => {
    // Let the edit (gear) button behave normally — only the card body itself
    // is a drag target.
    if ((event.target as HTMLElement).closest(".card-edit-button")) return;
    const pointerId = event.pointerId;
    const el = event.currentTarget as HTMLElement;
    const timer = setTimeout(() => {
      if (cardDragState.current) {
        cardDragState.current.dragging = true;
        justDraggedRef.current = true;
        dragOrderRef.current = visibleCards.map((card) => card.id);
        setDraggingCardId(id);
        // Only once the hold is confirmed as a drag (not on every touch) do we
        // take this card out of the native touch-scroll gesture — see the
        // comment above .flashcard-wrap in index.css for why this can't just
        // be a permanent CSS rule without breaking ordinary swipe-scrolling.
        cardDragState.current.el.style.touchAction = "none";
        // Capture on the grid container, not the card being dragged — that
        // card's own DOM node gets moved around by React as the reorder
        // happens (it's the whole point), and re-parenting the capturing
        // element mid-drag silently drops the capture, which would strand
        // the drag with no further pointermove/up ever arriving. The grid
        // container itself never moves, so it keeps receiving every event
        // for this pointer no matter how many times the cards inside it
        // get reshuffled.
        cardGridRef.current?.setPointerCapture(pointerId);
      }
    }, LONG_PRESS_MS);
    cardDragState.current = { id, pointerId, startX: event.clientX, startY: event.clientY, timer, dragging: false, el };
  };
  const moveCardDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = cardDragState.current;
    if (!state) return;
    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;
    if (!state.dragging) {
      // A quick swipe (e.g. scrolling the page) cancels the pending
      // long-press instead of hijacking the gesture.
      if (Math.hypot(deltaX, deltaY) > 12 && state.timer) { clearTimeout(state.timer); cardDragState.current = null; }
      return;
    }
    // Hit-test against every visible card's live position (not a fixed row
    // height) so this works whether the grid is one column (mobile) or two
    // (desktop) — swap in whichever slot the pointer is currently closest to.
    const items = Array.from(cardGridRef.current?.querySelectorAll<HTMLElement>(".flashcard-item") ?? []);
    if (!items.length) return;
    let closestIndex = -1;
    let closestDist = Infinity;
    items.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const dist = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
      if (dist < closestDist) { closestDist = dist; closestIndex = i; }
    });
    const order = dragOrderRef.current;
    const fromIndex = order.indexOf(state.id);
    if (fromIndex === -1 || closestIndex === -1 || closestIndex === fromIndex) return;
    const nextOrder = [...order];
    nextOrder.splice(fromIndex, 1);
    nextOrder.splice(closestIndex, 0, state.id);
    dragOrderRef.current = nextOrder;
    const visibleSet = new Set(order);
    setCards((current) => {
      const cardById = new Map(current.map((card) => [card.id, card]));
      let cursor = 0;
      return current.map((card) => (visibleSet.has(card.id) ? cardById.get(nextOrder[cursor++])! : card));
    });
  };
  const endCardDrag = () => {
    if (cardDragState.current?.timer) clearTimeout(cardDragState.current.timer);
    if (cardDragState.current) cardDragState.current.el.style.touchAction = "";
    cardDragState.current = null;
    setDraggingCardId(null);
    setTimeout(() => { justDraggedRef.current = false; }, 0);
  };

  // Same long-press-drag pattern as the cards above, applied to the category
  // chips instead: pointer capture on the stable filter-row container (never
  // the chip itself, which can shift position mid-drag), a ref for the live
  // order so fast pointermoves never read a stale array, and a "just
  // dragged" guard so the drop doesn't also fire the chip's select-category
  // click. "すべて" is a synthetic entry (not part of categoryOrder), so it's
  // simply never made draggable and never shows up as a drop target.
  const [draggingCategory, setDraggingCategory] = useState<string | null>(null);
  const categoryDragState = useRef<{ name: string; pointerId: number; startX: number; startY: number; timer: ReturnType<typeof setTimeout> | null; dragging: boolean; el: HTMLElement } | null>(null);
  const justDraggedCategoryRef = useRef(false);
  const categoryFilterRef = useRef<HTMLDivElement>(null);
  const categoryOrderDragRef = useRef<string[]>([]);
  const startCategoryDrag = (name: string, event: React.PointerEvent<HTMLButtonElement>) => {
    const pointerId = event.pointerId;
    const el = event.currentTarget as HTMLElement;
    const timer = setTimeout(() => {
      if (categoryDragState.current) {
        categoryDragState.current.dragging = true;
        justDraggedCategoryRef.current = true;
        categoryOrderDragRef.current = [...categoryOrder];
        setDraggingCategory(name);
        // Same dynamic touch-action toggling as the flashcard drag above —
        // only lock out native scrolling once the hold is confirmed as a drag.
        categoryDragState.current.el.style.touchAction = "none";
        categoryFilterRef.current?.setPointerCapture(pointerId);
      }
    }, LONG_PRESS_MS);
    categoryDragState.current = { name, pointerId, startX: event.clientX, startY: event.clientY, timer, dragging: false, el };
  };
  const moveCategoryDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = categoryDragState.current;
    if (!state) return;
    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;
    if (!state.dragging) {
      if (Math.hypot(deltaX, deltaY) > 12 && state.timer) { clearTimeout(state.timer); categoryDragState.current = null; }
      return;
    }
    const items = Array.from(categoryFilterRef.current?.querySelectorAll<HTMLElement>(".category-chip") ?? []);
    if (!items.length) return;
    let closestIndex = -1;
    let closestDist = Infinity;
    items.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const dist = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
      if (dist < closestDist) { closestDist = dist; closestIndex = i; }
    });
    const order = categoryOrderDragRef.current;
    const fromIndex = order.indexOf(state.name);
    if (fromIndex === -1 || closestIndex === -1 || closestIndex === fromIndex) return;
    const nextOrder = [...order];
    nextOrder.splice(fromIndex, 1);
    nextOrder.splice(closestIndex, 0, state.name);
    categoryOrderDragRef.current = nextOrder;
    setCategoryOrder(nextOrder);
  };
  const endCategoryDrag = () => {
    if (categoryDragState.current?.timer) clearTimeout(categoryDragState.current.timer);
    if (categoryDragState.current) categoryDragState.current.el.style.touchAction = "";
    categoryDragState.current = null;
    setDraggingCategory(null);
    setTimeout(() => { justDraggedCategoryRef.current = false; }, 0);
  };
  return <div className="screen">
    <Header title="面接カード" eyebrow="INTERVIEW PREP" onMenu={() => onNavigate("settings")} />
    <button className="text-button mode-back-link" onClick={onBack}><ArrowLeft size={15} />選択に戻る</button>
    <InterviewTimer />
    <section className="page-lead"><div><p className="eyebrow">FLIP CARDS</p><h2>タップして、答えを確認</h2><p>カードをタップして回答を確認。鉛筆ボタンから内容もいつでも書き換えられます。</p></div><button className="primary-button" onClick={() => setShow((value) => !value)}><Plus size={17} />カード追加</button></section>
    <div className="search-box card-search-box"><Search size={19} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="質問・答えの内容で検索" />{searchQuery && <button className="icon-button" aria-label="検索をクリア" onClick={() => setSearchQuery("")}><X size={16} /></button>}</div>
    <div className={`category-filter ${categoriesExpanded ? "expanded" : ""}`} ref={categoryFilterRef} onPointerMove={moveCategoryDrag} onPointerUp={endCategoryDrag} onPointerCancel={endCategoryDrag}><button type="button" className="filter-label-button" onClick={() => setCategoriesExpanded((value) => !value)}>カテゴリ<ChevronDown size={13} className={categoriesExpanded ? "rotated" : ""} /></button>{categories.map((item) => item === "すべて"
      ? <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}<small>{topLevelCards.length}</small></button>
      : <button key={item} className={`category-chip ${category === item ? "active" : ""} ${draggingCategory === item ? "dragging" : ""}`} onPointerDown={(event) => startCategoryDrag(item, event)} onClick={() => { if (justDraggedCategoryRef.current) return; setCategory(item); }}>{item}<small>{topLevelCards.filter((card) => card.category === item).length}</small></button>)}<button className="icon-button category-manage-button" aria-label="カテゴリを編集" onClick={() => setManagingCategories(true)}><Settings size={15} /></button></div>
    <div className="card-filter"><span>{visibleCards.length} cards</span><span className="hint"><GripVertical size={14} />長押しで並び替え</span><span className="hint"><RefreshCw size={14} />表と裏をタップで切替</span></div>
    {/* Rendered right above the card list (not below it) so opening the form
        with the "カード追加" button up top never requires scrolling past
        every existing card just to start typing. */}
    {show && <div className="inline-form"><div className="form-heading"><div><p className="eyebrow">NEW CARD</p><h3>面接カードを作る</h3></div><button className="icon-button" onClick={() => setShow(false)}><X size={17} /></button></div><label>カテゴリ<CategoryPicker value={draft.category} categories={categoryOrder} onChange={(value) => setDraft({ ...draft, category: value })} resetKey={show ? "open" : "closed"} /></label><label>企業（任意）<select value={draft.companyId ?? ""} onChange={(event) => setDraft({ ...draft, companyId: event.target.value || null })}><option value="">紐づけない</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>カードの色<CardColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} /></label><label>質問<AutoGrowTextarea value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} placeholder="例：最近気になったニュースは？" /></label><label>答え<AutoGrowTextarea value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} placeholder="自分の言葉で答えを記入" /></label><button className="primary-button" onClick={add}><Check size={16} />保存する</button></div>}
    <div className="flashcard-grid" ref={cardGridRef} onPointerMove={moveCardDrag} onPointerUp={endCardDrag} onPointerCancel={endCardDrag}>{visibleCards.map((card) => <div key={card.id} className="flashcard-item">
      <div
        className={`flashcard-wrap ${flipped === card.id ? "flipped" : ""} ${draggingCardId === card.id ? "dragging" : ""}`}
        onPointerDown={(event) => startCardDrag(card.id, event)}
      >
        <button className={`flashcard card-color-${card.color ?? "purple"} ${flipped === card.id ? "flipped" : ""}`} onClick={() => { if (justDraggedRef.current) return; setFlipped(flipped === card.id ? null : card.id); }}><div className="flash-front"><span className="card-label">{card.category}</span>{companyName(card.companyId) && <span className="card-company-tag">{companyName(card.companyId)}</span>}<h3>{card.question}</h3><span className="flip-hint">タップして答えを見る <ChevronRight size={15} /></span></div><div className="flash-back"><span className="card-label">{card.category}</span>{companyName(card.companyId) && <span className="card-company-tag">{companyName(card.companyId)}</span>}<p>{card.answer}</p><span className="flip-hint">もう一度タップで質問へ <RefreshCw size={15} /></span></div></button>
        <button className="card-edit-button" aria-label={`${card.question}を編集`} onClick={() => setEditing(card)}><Settings size={15} /></button>
      </div>
      {/* Lives outside the flip card, not on either face, so it stays put
          and tappable no matter which side (question/answer) is showing. */}
      <div className="flashcard-footer">
        <button className={`star-toggle ${card.important ? "active" : ""}`} aria-label={card.important ? "重要を解除" : "重要にする"} onClick={() => toggleImportant(card.id)}><Star size={16} fill={card.important ? "currentColor" : "none"} /></button>
        <button className={`check-toggle ${card.checked ? "active" : ""}`} aria-label={card.checked ? "対策済みを解除" : "対策済みにする"} onClick={() => toggleChecked(card.id)}><CheckCircle2 size={16} fill={card.checked ? "currentColor" : "none"} /></button>
        <button className={`child-toggle ${expandedParents.includes(card.id) ? "active" : ""}`} onClick={() => toggleChildren(card.id)}><MessageSquare size={14} />子カード{childrenOf(card.id).length > 0 && ` (${childrenOf(card.id).length})`}</button>
        <div className="rating-group">{RATING_ORDER.map((r) => <button key={r} className={`rating-${r} ${card.rating === r ? "active" : ""}`} onClick={() => setRating(card.id, r)}>{RATING_LABEL[r]}</button>)}</div>
      </div>
      {/* Follow-up Q&A for this card — always tucked away here rather than
          shown by default, since it'd otherwise clutter every card even
          when most don't have any. */}
      {expandedParents.includes(card.id) && <div className="child-card-panel">
        {childrenOf(card.id).map((child) => <ChildCardView key={child.id} card={child} depth={1} flipped={flipped} setFlipped={setFlipped} toggleImportant={toggleImportant} toggleChecked={toggleChecked} setRating={setRating} expandedParents={expandedParents} toggleChildren={toggleChildren} childrenOf={childrenOf} addingChildFor={addingChildFor} setAddingChildFor={setAddingChildFor} childDraft={childDraft} setChildDraft={setChildDraft} addChild={addChild} setEditing={setEditing} />)}
        {!childrenOf(card.id).length && addingChildFor !== card.id && <p className="child-empty-hint">まだ子カードがありません。想定される深掘り質問を追加しましょう。</p>}
        {addingChildFor === card.id
          ? <div className="child-add-form">
              <AutoGrowTextarea value={childDraft.question} onChange={(event) => setChildDraft({ ...childDraft, question: event.target.value })} placeholder="面接官からの深掘り質問（例：具体的にどんなゲームを作りましたか？）" />
              <AutoGrowTextarea value={childDraft.answer} onChange={(event) => setChildDraft({ ...childDraft, answer: event.target.value })} placeholder="自分の回答" />
              <div className="child-add-actions">
                <button className="secondary-button" onClick={() => { setAddingChildFor(null); setChildDraft({ question: "", answer: "" }); }}>キャンセル</button>
                <button className="primary-button" onClick={() => addChild(card)}><Check size={14} />追加</button>
              </div>
            </div>
          : <button className="child-add-button" onClick={() => { setAddingChildFor(card.id); setChildDraft({ question: "", answer: "" }); }}><Plus size={14} />子カードを追加</button>}
      </div>}
    </div>)}</div>
    {!visibleCards.length && <div className="empty-state large"><BookOpen size={24} />このカテゴリにはカードがありません。</div>}
    {editing && <div className="modal-backdrop" onClick={() => setEditing(null)}><section className="editor-modal card-editor-modal" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">EDIT CARD</p><h2>{editing.parentId ? "子カードを編集" : "面接カードを編集"}</h2></div><button className="icon-button" onClick={() => setEditing(null)}><X size={19} /></button></div><div className="form-grid">{!editing.parentId && <label className="wide">カテゴリ<CategoryPicker value={editing.category} categories={categoryOrder} onChange={(value) => setEditing({ ...editing, category: value })} resetKey={editing.id} /></label>}{!editing.parentId && <label className="wide">企業（任意）<select value={editing.companyId ?? ""} onChange={(event) => setEditing({ ...editing, companyId: event.target.value || null })}><option value="">紐づけない</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}{!editing.parentId && <label className="wide">カードの色<CardColorPicker value={editing.color ?? "purple"} onChange={(color) => setEditing({ ...editing, color })} /></label>}<label className="wide">質問<AutoGrowTextarea value={editing.question} onChange={(event) => setEditing({ ...editing, question: event.target.value })} /></label><label className="wide">答え<AutoGrowTextarea value={editing.answer} onChange={(event) => setEditing({ ...editing, answer: event.target.value })} /></label></div><div className="modal-footer"><button className="danger-button" onClick={() => { const idsToRemove = new Set([editing.id, ...collectDescendantIds(cards, editing.id)]); setCards((current) => current.filter((card) => !idsToRemove.has(card.id))); setEditing(null); toast.success(editing.parentId ? "子カードを削除しました" : "面接カードを削除しました"); }}><Trash2 size={16} />削除</button><div><button className="secondary-button" onClick={() => setEditing(null)}>キャンセル</button><button className="primary-button" onClick={saveEdit}><Check size={16} />更新する</button></div></div></section></div>}
    {managingCategories && <CategoryManager categories={categoryOrder} onRename={renameCategory} onClose={() => setManagingCategories(false)} />}
  </div>;
}

function QuizSetupScreen({ cards, settings, setSettings, onNavigate, onBack, onStart }: { cards: InterviewCard[]; settings: QuizSettings; setSettings: Dispatch<SetStateAction<QuizSettings>>; onNavigate: (s: Screen) => void; onBack: () => void; onStart: () => void }) {
  const poolCount = cards.filter((card) => settings.ratings.includes((card.rating ?? "none") as QuizRatingFilter)).length;
  // A rating chip can be turned off, but never the last one — an empty
  // filter would just mean "no cards ever match", which is never useful.
  const toggleRating = (key: QuizRatingFilter) => setSettings((current) => {
    const has = current.ratings.includes(key);
    if (has && current.ratings.length === 1) { toast.error("評価は最低ひとつ選んでください"); return current; }
    return { ...current, ratings: has ? current.ratings.filter((r) => r !== key) : [...current.ratings, key] };
  });
  return <div className="screen">
    <Header title="問題の設定" eyebrow="QUIZ SETUP" onMenu={() => onNavigate("settings")} />
    <button className="text-button mode-back-link" onClick={onBack}><ArrowLeft size={15} />選択に戻る</button>
    <section className="page-lead"><div><p className="eyebrow">BEFORE YOU START</p><h2>出題の設定を選ぶ</h2><p>ここで選んだ設定は、次に開いたときも引き継がれます。</p></div></section>
    <div className="settings-card">
      <div className="settings-icon"><Target size={20} /></div>
      <div>
        <h3>問題数</h3>
        <p>選んだ枚数を、ランダムな順番で1問ずつ出題します。</p>
        <div className="chip-row">{QUIZ_COUNT_OPTIONS.map((option) => <button key={option} className={`chip ${settings.count === option ? "selected" : ""}`} onClick={() => setSettings((current) => ({ ...current, count: option }))}>{option === "all" ? "すべて" : `${option}問`}</button>)}</div>
      </div>
    </div>
    <div className="settings-card">
      <div className="settings-icon orange"><Star size={20} /></div>
      <div>
        <h3>出題する評価</h3>
        <p>選んだ評価が付いたカードだけが出題対象になります。</p>
        <div className="chip-row">{QUIZ_RATING_OPTIONS.map(({ key, label }) => <button key={key} className={`chip ${settings.ratings.includes(key) ? "selected" : ""}`} onClick={() => toggleRating(key)}>{label}</button>)}</div>
      </div>
    </div>
    <div className="settings-card">
      <div className="settings-icon purple"><Trophy size={20} /></div>
      <div>
        <h3>出題の優先度</h3>
        <p>オンにすると、不得意（不可・可）や未評価のカードほど優先的に出題されます。</p>
        <div className="chip-row"><button className={`chip ${settings.weighted ? "selected" : ""}`} onClick={() => setSettings((current) => ({ ...current, weighted: !current.weighted }))}>{settings.weighted ? "苦手なカードを優先中" : "苦手なカードを優先する"}</button></div>
      </div>
    </div>
    <p className={`quiz-pool-hint ${poolCount ? "" : "warn"}`}>{poolCount ? `対象カード：${poolCount}枚` : "対象のカードがありません。評価の選択を見直してください。"}</p>
    <button className="primary-button quiz-start-button" disabled={!poolCount} onClick={onStart}><Play size={16} fill="currentColor" />開始する</button>
  </div>;
}

function QuizPlayScreen({ deck, index, flipped, onFlip, onPrev, onNext, onNavigate, onBack }: { deck: InterviewCard[]; index: number; flipped: boolean; onFlip: () => void; onPrev: () => void; onNext: () => void; onNavigate: (s: Screen) => void; onBack: () => void }) {
  const card = deck[index];

  // A scratch recording of the person's own spoken answer, so they can
  // immediately play it back and hear themselves the way an interviewer
  // would. Deliberately session-only — never written to localStorage or
  // included in a backup — since it's a rehearsal aid for the card in
  // front of them right now, not something to keep. The blob URL is
  // mirrored into a ref (recordingUrlRef) purely so the cleanup effect
  // below can always read the LATEST url when it fires, instead of the
  // stale value it would otherwise close over from whichever render last
  // changed `index`.
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "ready">("idle");
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const recordingUrlRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  useEffect(() => { recordingUrlRef.current = recordingUrl; }, [recordingUrl]);

  const discardRecording = () => {
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = null;
    setRecordingUrl(null);
    setRecordingState("idle");
  };
  // Moving to a different card (next/prev) discards whatever was recorded
  // for the previous one, stopping an in-progress recording too — nothing
  // here is meant to survive past the card it was made for.
  useEffect(() => {
    setRecordingUrl(null);
    setRecordingState("idle");
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
      recordingUrlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return toast.error("この端末では録音機能が使えません");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
        const url = URL.createObjectURL(blob);
        recordingUrlRef.current = url;
        setRecordingUrl(url);
        setRecordingState("ready");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingState("recording");
    } catch {
      toast.error("マイクを使用できませんでした。ブラウザの権限設定を確認してください");
    }
  };
  const stopRecording = () => mediaRecorderRef.current?.stop();

  if (!card) return null;
  const isLast = index === deck.length - 1;
  return <div className="screen quiz-screen">
    <Header title="出題モード" eyebrow="QUIZ MODE" onMenu={() => onNavigate("settings")} />
    <button className="text-button mode-back-link" onClick={onBack}><ArrowLeft size={15} />選択に戻る</button>
    {/* Sticky, top-left — mirrors InterviewTimer's top-right pin so the
        current position is always visible without scrolling back up. */}
    <div className="quiz-progress-bar"><span className="quiz-progress-pill">{index + 1} / {deck.length}</span></div>
    {/* Unlike the grid's flip tiles, this isn't a fixed-size 3D flip — the
        front/back text just swaps in place — so a long answer grows the
        card (and the sticky bars stay correctly anchored) instead of
        overflowing a box sized for the question. */}
    <div className="quiz-card-stage">
      <button className={`quiz-flashcard card-color-${card.color ?? "purple"} ${flipped ? "flipped" : ""}`} onClick={onFlip}>
        <span className="card-label">{card.category}</span>
        {flipped ? <p className="quiz-face-text">{card.answer}</p> : <h3 className="quiz-face-text">{card.question}</h3>}
        <span className="flip-hint">{flipped ? <>もう一度タップで質問へ <RefreshCw size={15} /></> : <>タップして答えを見る <ChevronRight size={15} /></>}</span>
      </button>
    </div>
    {/* Record-and-play-back is intentionally its own control, separate from
        the timer/flip card — it's fine to record while still looking at
        the question, before flipping to check the model answer. */}
    <div className="quiz-recorder">
      <div className="quiz-recorder-header"><Mic size={14} /><span>自分の回答を録音して聞き返す</span></div>
      <div className="quiz-recorder-controls">
        {recordingState === "recording"
          ? <button className="danger-button" onClick={stopRecording}><Square size={13} fill="currentColor" />録音を止める</button>
          : <button className="secondary-button" onClick={startRecording}><Mic size={14} />{recordingUrl ? "録音し直す" : "録音を始める"}</button>}
        {recordingState === "recording" && <span className="quiz-recorder-live">● 録音中…</span>}
      </div>
      {recordingUrl && recordingState !== "recording" && <div className="quiz-recorder-playback"><audio controls src={recordingUrl} /><button className="icon-button" aria-label="録音を削除" onClick={discardRecording}><Trash2 size={14} /></button></div>}
    </div>
    {/* Sticky to the bottom corners so "次へ/前へ" are always in thumb reach
        without scrolling, even on a long answer. */}
    <div className="quiz-nav-row">
      <button className="secondary-button" disabled={index === 0} onClick={onPrev}><ChevronLeft size={16} />前のカードへ</button>
      <button className="primary-button" onClick={onNext}>{isLast ? "終了する" : <>次のカードへ<ChevronRight size={16} /></>}</button>
    </div>
  </div>;
}

function ScheduleScreen({ schedule, setSchedule, onNavigate }: { schedule: ScheduleItem[]; setSchedule: Dispatch<SetStateAction<ScheduleItem[]>>; onNavigate: (s: Screen) => void }) { const [show, setShow] = useState(false); const [draft, setDraft] = useState({ title: "", date: today, time: "19:00", category: "その他" }); const add = () => { if (!draft.title) return toast.error("予定名を入力してください"); setSchedule((c) => [...c, { ...draft, id: `task-${Date.now()}`, done: false }].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))); setDraft({ title: "", date: today, time: "19:00", category: "その他" }); setShow(false); toast.success("予定を追加しました"); }; return <div className="screen"><Header title="就活スケジュール" eyebrow="YOUR TIMELINE" onMenu={() => onNavigate("settings")} /><section className="schedule-hero"><div><p className="eyebrow light">KEEP MOVING</p><h2>締切から逆算して、<br />今日やることを決める。</h2></div><CalendarDays size={48} /></section><div className="section-heading"><div><p className="eyebrow">TIMELINE</p><h2>やることリスト</h2></div><button className="primary-button" onClick={() => setShow((v) => !v)}><Plus size={17} />予定追加</button></div>{show && <div className="inline-form schedule-form"><div className="form-grid"><label className="wide">予定名<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="例：一次面接の準備" /></label><label>日付<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label><label>時間<input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></label><label className="wide">カテゴリ<input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></label></div><button className="primary-button" onClick={add}><Check size={16} />保存する</button></div>}<div className="timeline">{schedule.map((item) => <div className={`timeline-item ${item.done ? "done" : ""}`} key={item.id}><button className="check-circle" onClick={() => setSchedule((c) => c.map((x) => x.id === item.id ? { ...x, done: !x.done } : x))}>{item.done && <Check size={14} />}</button><div className="timeline-main"><div className="timeline-top"><strong>{item.title}</strong><span>{item.date} · {item.time}</span></div><p>{item.category}</p></div><button className="delete-plain" onClick={() => setSchedule((c) => c.filter((x) => x.id !== item.id))}><Trash2 size={16} /></button></div>)}</div></div>; }

function SettingsScreen({ onNavigate, onUpdateApp, fontScale, setFontScale }: { onNavigate: (s: Screen) => void; onUpdateApp: () => void; fontScale: FontScale; setFontScale: Dispatch<SetStateAction<FontScale>> }) {
  const [status, setStatus] = useState("");
  const { theme, toggleTheme } = useTheme();
  const getData = () => ({ companies: load("cc_companies", starterCompanies), cards: load("cc_cards", starterCards), schedule: load("cc_schedule", starterSchedule), exportedAt: new Date().toISOString(), formatVersion: 1 });
  const download = (bytes: Uint8Array, filename: string, type: string) => { const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type })); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); };
  const backup = () => { download(strToU8(JSON.stringify(getData(), null, 2)), `career-compass-backup-${today}.json`, "application/json"); setStatus("JSONバックアップを書き出しました"); };
  const backupZip = () => { const data = getData(); download(createBackupZip(data), `career-compass-backup-${today}.zip`, "application/zip"); setStatus("ZIPバックアップを書き出しました"); };
  const restore = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const isZip = file.name.toLowerCase().endsWith(".zip"); const reader = new FileReader(); reader.onload = () => { try { const bytes = isZip ? new Uint8Array(reader.result as ArrayBuffer) : strToU8(String(reader.result)); const data = parseBackupBytes(bytes, file.name) as CloudPayload; ["companies", "cards", "schedule"].forEach((key) => { const value = data[key as keyof CloudPayload]; if (Array.isArray(value)) localStorage.setItem(`cc_${key}`, JSON.stringify(value)); }); setStatus("バックアップを復元しました。画面を再読み込みします"); setTimeout(() => location.reload(), 700); } catch { setStatus("バックアップを読み込めませんでした。Career CompassのJSONまたはZIPを選択してください"); } }; if (isZip) reader.readAsArrayBuffer(file); else reader.readAsText(file); e.target.value = ""; };
  return <div className="screen"><Header title="設定" eyebrow="PREFERENCES & DATA" onMenu={() => onNavigate("home")} /><section className="page-lead"><div><p className="eyebrow">YOUR SPACE</p><h2>安心して、積み上げる</h2><p>アプリの更新でデータが消えないように、この端末に自動保存しています。</p></div><Settings size={42} /></section><section className="settings-card"><div className="settings-icon purple">{theme === "dark" ? <Moon size={20} /> : <Sun size={20} />}</div><div><h3>表示</h3><p>ダークモードと文字サイズを、この端末向けに調整できます。</p><div className="display-settings-row"><span className="display-settings-label">配色</span><div className="chip-row"><button className={`chip ${theme === "light" ? "selected" : ""}`} onClick={() => theme === "dark" && toggleTheme?.()}><Sun size={13} />ライト</button><button className={`chip ${theme === "dark" ? "selected" : ""}`} onClick={() => theme === "light" && toggleTheme?.()}><Moon size={13} />ダーク</button></div></div><div className="display-settings-row"><span className="display-settings-label">文字サイズ</span><div className="chip-row">{(Object.keys(FONT_SCALE_LABEL) as FontScale[]).map((scale) => <button key={scale} className={`chip ${fontScale === scale ? "selected" : ""}`} onClick={() => setFontScale(scale)}>{FONT_SCALE_LABEL[scale]}</button>)}</div></div></div></section><section className="settings-card"><div className="settings-icon"><FileDown size={20} /></div><div><h3>就活データのバックアップ</h3><p>企業・面接カード・予定をJSONまたはZIPで保存できます。他の端末に移すときは、こちらのZIPを復元してください。</p><div className="settings-actions"><button className="secondary-button" onClick={backupZip}><FileDown size={16} />ZIPで保存</button><button className="secondary-button" onClick={backup}>JSONで保存</button><label className="secondary-button"><FileUp size={16} />JSON / ZIP復元<input type="file" accept="application/json,.json,application/zip,.zip" onChange={restore} hidden /></label></div>{status && <small className="status-message">{status}</small>}</div></section><section className="settings-card"><div className="settings-icon green"><RefreshCw size={20} /></div><div><h3>端末に自動保存中</h3><p>企業・面接カード・予定は、このブラウザのローカル領域に自動保存されます。別の端末で使うときは上のバックアップ機能でデータを移してください。</p></div></section><section className="settings-card"><div className="settings-icon green"><RefreshCw size={20} /></div><div><h3>PWAを最新バージョンに更新</h3><p>設定画面からいつでも新しいアプリ本体を確認できます。更新後は自動的に再読み込みします。</p><button className="secondary-button" onClick={onUpdateApp}><RefreshCw size={16} />今すぐ更新を確認</button></div></section><button className="outline-wide" onClick={() => onNavigate("home")}><HomeIcon size={17} />ホームに戻る</button></div>;
}
// Sits in front of the card screen: pick "面接カード" to manage cards as
// before, or "問題" to practice one card at a time in a random order. Which
// of the three sub-screens is showing lives only here, not in the app-wide
// Screen type, so switching tabs and coming back always starts at this menu.
function InterviewHub({ cards, setCards, companies, onNavigate }: { cards: InterviewCard[]; setCards: Dispatch<SetStateAction<InterviewCard[]>>; companies: Company[]; onNavigate: (s: Screen) => void }) {
  const [subScreen, setSubScreen] = useState<"menu" | "cards" | "quiz-setup" | "quiz-play">("menu");
  const [quizSettings, setQuizSettings] = usePersisted<QuizSettings>("cc_quiz_settings", DEFAULT_QUIZ_SETTINGS);
  const [quizDeck, setQuizDeck] = useState<InterviewCard[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizFlipped, setQuizFlipped] = useState(false);
  // Every quiz-answer-viewed timestamp, capped so it can't grow forever —
  // this is the raw log the "週間の練習実績" card on the menu screen
  // summarizes (see weeklyCount below).
  const [practiceLog, setPracticeLog] = usePersisted<string[]>("cc_practice_log", []);
  const recordPractice = () => setPracticeLog((current) => [...current.slice(-499), new Date().toISOString()]);
  const backToMenu = () => setSubScreen("menu");
  // Child (follow-up) cards stay attached to their parent's context, so the
  // quiz — which shows one card at a time with nothing else around it —
  // draws only from top-level cards.
  const topLevelCards = cards.filter((card) => !card.parentId);

  const startQuiz = () => {
    const pool = topLevelCards.filter((card) => quizSettings.ratings.includes((card.rating ?? "none") as QuizRatingFilter));
    if (!pool.length) return toast.error("対象のカードがありません。設定を見直してください");
    const count = quizSettings.count === "all" ? pool.length : Math.min(quizSettings.count, pool.length);
    const deck = quizSettings.weighted
      ? weightedSample(pool, (card) => QUIZ_WEIGHT[(card.rating ?? "none") as QuizRatingFilter], count)
      : [...pool].sort(() => Math.random() - 0.5).slice(0, count);
    setQuizDeck(deck);
    setQuizIndex(0);
    setQuizFlipped(false);
    setSubScreen("quiz-play");
  };
  const quizNext = () => {
    recordPractice();
    if (quizIndex >= quizDeck.length - 1) {
      toast.success("全問終了しました。お疲れ様でした！");
      setSubScreen("menu");
      return;
    }
    setQuizFlipped(false);
    setQuizIndex((i) => i + 1);
  };
  const quizPrev = () => {
    setQuizFlipped(false);
    setQuizIndex((i) => Math.max(0, i - 1));
  };

  if (subScreen === "cards") return <InterviewScreen cards={cards} setCards={setCards} companies={companies} onNavigate={onNavigate} onBack={backToMenu} />;
  if (subScreen === "quiz-setup") return <QuizSetupScreen cards={topLevelCards} settings={quizSettings} setSettings={setQuizSettings} onNavigate={onNavigate} onBack={backToMenu} onStart={startQuiz} />;
  if (subScreen === "quiz-play") return <QuizPlayScreen deck={quizDeck} index={quizIndex} flipped={quizFlipped} onFlip={() => setQuizFlipped((f) => !f)} onPrev={quizPrev} onNext={quizNext} onNavigate={onNavigate} onBack={backToMenu} />;

  const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weeklyCount = practiceLog.filter((iso) => new Date(iso).getTime() >= weekAgoMs).length;
  const ratingBreakdown: Array<{ key: QuizRatingFilter; label: string; count: number }> = [
    ...RATING_ORDER.map((r) => ({ key: r as QuizRatingFilter, label: RATING_LABEL[r], count: topLevelCards.filter((c) => c.rating === r).length })),
    { key: "none", label: "未評価", count: topLevelCards.filter((c) => !c.rating).length },
  ];
  // Same 7 log entries as weeklyCount, just bucketed per calendar day
  // (today last) instead of collapsed into one total — a day-by-day shape
  // is much faster to read at a glance than a single number ("did I
  // actually practice yesterday, or was it all Monday?").
  const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
  const last7Days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d; });
  const dailyCounts = last7Days.map((day) => { const start = day.getTime(); const end = start + 24 * 60 * 60 * 1000; return practiceLog.filter((iso) => { const t = new Date(iso).getTime(); return t >= start && t < end; }).length; });
  const maxDailyCount = Math.max(1, ...dailyCounts);

  return <div className="screen">
    <Header title="面接準備" eyebrow="INTERVIEW PREP" onMenu={() => onNavigate("settings")} />
    <section className="page-lead"><div><p className="eyebrow">CHOOSE MODE</p><h2>どちらで練習しますか？</h2><p>カードを管理する「面接カード」か、1問ずつランダムに出す「問題」を選べます。</p></div></section>
    <section className="practice-stats-card">
      <div className="practice-stats-header"><Trophy size={18} /><div><p className="eyebrow">THIS WEEK</p><h3>週間の練習実績</h3></div></div>
      <div className="practice-stats-count"><strong>{weeklyCount}</strong><span>問を練習しました</span></div>
      <div className="practice-bar-chart" role="img" aria-label="曜日ごとの練習回数">
        {last7Days.map((day, i) => { const count = dailyCounts[i]; const isToday = i === last7Days.length - 1; const heightPct = Math.max((count / maxDailyCount) * 100, count > 0 ? 10 : 3); return <div className="practice-bar-col" key={day.toISOString()}>
          <span className="practice-bar-value">{count > 0 ? count : ""}</span>
          <div className="practice-bar-track"><div className={`practice-bar-fill ${isToday ? "today" : ""}`} style={{ height: `${heightPct}%` }} /></div>
          <span className="practice-bar-label">{DAY_LABELS[day.getDay()]}</span>
        </div>; })}
      </div>
      <div className="rating-breakdown">{ratingBreakdown.map(({ key, label, count }) => <div className="rating-breakdown-row" key={key}><span className={`rating-dot rating-${key}`} /><span>{label}</span><span className="rating-breakdown-count">{count}</span></div>)}</div>
    </section>
    <div className="mode-choice-grid">
      <button className="mode-choice-card" onClick={() => setSubScreen("cards")}>
        <div className="mode-choice-icon"><BookOpen size={22} /></div>
        <div><h3>面接カード</h3><p>カードの作成・編集・並び替えをする</p></div>
        <ChevronRight size={18} />
      </button>
      <button className="mode-choice-card" onClick={() => setSubScreen("quiz-setup")}>
        <div className="mode-choice-icon orange"><Sparkles size={22} /></div>
        <div><h3>問題</h3><p>1問ずつランダムに出題して練習する</p></div>
        <ChevronRight size={18} />
      </button>
    </div>
  </div>;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [companies, setCompanies] = usePersisted<Company[]>("cc_companies", starterCompanies);
  const [cards, setCards] = usePersisted<InterviewCard[]>("cc_cards", starterCards);
  const [schedule, setSchedule] = usePersisted<ScheduleItem[]>("cc_schedule", starterSchedule);
  const [fontScale, setFontScale] = usePersisted<FontScale>("cc_font_scale", "standard");
  const [serviceWorkerRegistration, setServiceWorkerRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let refreshing = false;
    // Was this page load ALREADY controlled by an older service worker when
    // this effect ran? That's the only case where a later "controllerchange"
    // means a real version update (old SW -> new SW) that's worth reloading
    // for. On a brand-new install — including the very first launch of the
    // iOS "Add to Home Screen" app — there is no prior controller, so the
    // very first activate()/clients.claim() below ALSO fires
    // "controllerchange" even though nothing actually changed for the user.
    // Reloading in that case used to force an unprompted, JS-triggered
    // navigation on first launch, and iOS Safari's standalone (home-screen)
    // web app mode — unlike an ordinary Safari tab — silently stops letting
    // any <input>/<textarea> open the software keyboard after a reload like
    // that, so every text field looked permanently dead until the app was
    // deleted and re-added. Skipping the reload when there was no prior
    // controller avoids that trap while still updating to the latest code
    // on subsequent real deploys.
    const hadController = !!navigator.serviceWorker.controller;
    // Register with an absolute, BASE_PATH-anchored URL and an explicit
    // scope — not a bare relative "sw.js". A relative path resolves against
    // the CURRENT window.location, and after an in-app "Go Home" navigation
    // (see NotFound.tsx) that location has been rewritten to the domain
    // root by wouter, which would try to load "/sw.js" (404) instead of
    // "/career-compass-app/sw.js" and silently fail to register at all.
    const registrationPromise = navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` });
    const onControllerChange = () => { if (hadController && !refreshing) { refreshing = true; window.location.reload(); } };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    registrationPromise.then((registration) => {
      setServiceWorkerRegistration(registration);
      registration.update().catch(() => undefined);
      if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) worker.postMessage({ type: "SKIP_WAITING" });
        });
      });
    }).catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  const updateApp = () => {
    if (!serviceWorkerRegistration) return toast("PWA更新機能はこのブラウザでは利用できません");
    serviceWorkerRegistration.update().then(() => {
      if (serviceWorkerRegistration.waiting) {
        serviceWorkerRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
      } else {
        toast.success("最新バージョンを確認しました");
      }
    }).catch(() => toast.error("更新の確認に失敗しました。通信状態を確認してください"));
  };

  return <div className="app-shell" style={{ zoom: FONT_SCALE_VALUE[fontScale] } as React.CSSProperties}><aside className="side-rail"><Logo /><div className="rail-label">WORKSPACE</div>{([{ id: "home", label: "ホーム", Icon: HomeIcon }, { id: "research", label: "企業研究", Icon: BriefcaseBusiness }, { id: "interview", label: "面接カード", Icon: BookOpen }, { id: "schedule", label: "スケジュール", Icon: CalendarDays }, { id: "settings", label: "設定", Icon: Settings }] as Array<{ id: Screen; label: string; Icon: typeof HomeIcon }>).map(({ id, label, Icon }) => <button key={id} className={`rail-button ${screen === id ? "active" : ""}`} onClick={() => setScreen(id)}><Icon size={18} />{label}</button>)}<div className="rail-spacer" /><div className="rail-footer"><div className="avatar">自</div><div><strong>My workspace</strong><small>この端末に自動保存</small></div></div></aside><main className="main-content">{screen === "home" && <HomeScreen companies={companies} schedule={schedule} onNavigate={setScreen} />}{screen === "research" && <ResearchScreen companies={companies} setCompanies={setCompanies} cards={cards} onNavigate={setScreen} />}{screen === "interview" && <InterviewHub cards={cards} setCards={setCards} companies={companies} onNavigate={setScreen} />}{screen === "schedule" && <ScheduleScreen schedule={schedule} setSchedule={setSchedule} onNavigate={setScreen} />}{screen === "settings" && <SettingsScreen onNavigate={setScreen} onUpdateApp={updateApp} fontScale={fontScale} setFontScale={setFontScale} />}</main><BottomNav screen={screen} onChange={setScreen} /></div>;
}
