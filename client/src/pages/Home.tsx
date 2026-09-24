import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { strToU8 } from "fflate";
import {
  ArrowDown, ArrowUp, BookOpen, BriefcaseBusiness, CalendarDays, Check,
  ChevronRight, FileDown, FileUp, GripVertical, Home as HomeIcon, Lightbulb, Menu, Pencil, Plus,
  RefreshCw, Search, Settings, Sparkles, Star, Target, Trash2, Trophy, X,
} from "lucide-react";
import { toast } from "sonner";
import { createBackupZip, parseBackupBytes } from "@/lib/backup";
import { BASE_PATH } from "@/lib/basePath";

type Screen = "home" | "research" | "interview" | "schedule" | "settings";
type ResearchMode = "research" | "summary";
type RankMode = "interest" | "salary" | "benefits";
export type Company = { id: string; name: string; industry: string; interest: number; salary: number | null; benefits: string; location: string; philosophy: string; person: string; notes: string; sources: string[]; updatedAt: string };
export type SelfRating = "excellent" | "good" | "fair" | "poor";
export type InterviewCard = { id: string; question: string; answer: string; category: string; important?: boolean; rating?: SelfRating | null };
const RATING_LABEL: Record<SelfRating, string> = { excellent: "優", good: "良", fair: "可", poor: "不可" };
const RATING_ORDER: SelfRating[] = ["excellent", "good", "fair", "poor"];
export type ScheduleItem = { id: string; title: string; date: string; time: string; category: string; done: boolean };

const today = new Date().toISOString().slice(0, 10);
const starterCompanies: Company[] = [
  { id: "company-1", name: "任天堂", industry: "ゲーム", interest: 5, salary: null, benefits: "情報を追加", location: "京都・東京", philosophy: "自分で企業理念を追記", person: "求める人物像を追記", notes: "調べる画面から企業情報を追加できます。", sources: ["https://www.nintendo.co.jp/", "https://www.nintendo.co.jp/jobs/"], updatedAt: today },
  { id: "company-2", name: "カプコン", industry: "ゲーム", interest: 4, salary: null, benefits: "情報を追加", location: "大阪・東京", philosophy: "", person: "", notes: "", sources: ["https://www.capcom.co.jp/", "https://www.capcom.co.jp/recruit/"], updatedAt: today },
  { id: "company-3", name: "ソニーグループ", industry: "IT・メーカー", interest: 3, salary: null, benefits: "情報を追加", location: "東京ほか", philosophy: "", person: "", notes: "", sources: ["https://www.sony.com/ja/SonyInfo/Jobs/"], updatedAt: today },
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

function HomeScreen({ companies, schedule, onNavigate }: { companies: Company[]; schedule: ScheduleItem[]; onNavigate: (s: Screen) => void }) { const pending = schedule.filter((x) => !x.done).slice(0, 2); const cards = load<InterviewCard[]>("cc_cards", starterCards); return <div className="screen home-screen"><Header title="おかえりなさい" eyebrow="CAREER COMPASS" onMenu={() => onNavigate("settings")} /><section className="hero-card"><div><p className="eyebrow light">TODAY'S FOCUS</p><h2>次の一歩を、<br /><em>今日のうちに。</em></h2><p className="hero-copy">企業研究と面接準備を、ここでひとつに。</p></div><div className="hero-orbit"><Target size={34} /><span>準備度<br /><strong>{Math.min(100, companies.length * 12 + 34)}%</strong></span></div></section><div className="section-heading"><div><p className="eyebrow">OVERVIEW</p><h2>就活の現在地</h2></div><button className="text-button" onClick={() => onNavigate("schedule")}>予定を見る <ChevronRight size={16} /></button></div><section className="overview-grid"><div className="stat-card purple"><BriefcaseBusiness size={19} /><strong>{companies.length}</strong><span>研究中の企業</span></div><div className="stat-card orange"><BookOpen size={19} /><strong>{cards.length}</strong><span>面接カード</span></div><div className="stat-card green"><CalendarDays size={19} /><strong>{pending.length}</strong><span>未完了の予定</span></div></section><div className="section-heading"><div><p className="eyebrow">UP NEXT</p><h2>次にやること</h2></div><button className="icon-button" onClick={() => onNavigate("schedule")}><ChevronRight size={18} /></button></div><section className="task-preview">{pending.length ? pending.map((task) => <button className="task-row" key={task.id} onClick={() => onNavigate("schedule")}><span className="task-dot" /><span className="task-content"><strong>{task.title}</strong><small>{task.date} · {task.time} · {task.category}</small></span><ChevronRight size={17} /></button>) : <div className="empty-state"><Check size={20} />すべて完了。いいペースです。</div>}</section><section className="tip-card"><Lightbulb size={20} /><div><strong>続けるコツ</strong><p>企業を調べたら、志望理由を一文だけ書いておくと面接カードに変わります。</p></div></section></div>; }

function ResearchScreen({ companies, setCompanies, onNavigate }: { companies: Company[]; setCompanies: Dispatch<SetStateAction<Company[]>>; onNavigate: (s: Screen) => void }) { const [mode, setMode] = useState<ResearchMode>("research"); const [rank, setRank] = useState<RankMode>("interest"); const [industry, setIndustry] = useState("すべて"); const [query, setQuery] = useState(""); const [newIndustry, setNewIndustry] = useState("ゲーム"); const [selected, setSelected] = useState<Company | null>(null); const industries =["すべて", ...Array.from(new Set(companies.map((c) => c.industry)))]; const filtered = companies.filter((c) => (industry === "すべて" || c.industry === industry) && c.name.toLowerCase().includes(query.toLowerCase())); const sorted = [...filtered].sort((a, b) => rank === "interest" ? b.interest - a.interest : rank === "salary" ? (b.salary ?? -1) - (a.salary ?? -1) : b.benefits.length - a.benefits.length);
  const add = () => { const name = query.trim(); if (!name) return toast.error("企業名を入力してください"); const company: Company = { id: `company-${Date.now()}`, name, industry: newIndustry, interest: 3, salary: null, benefits: "調査して追記", location: "未入力", philosophy: "", person: "", notes: "調べた情報をここに整理", sources: [`https://www.google.com/search?q=${encodeURIComponent(`${name} 採用 公式`)}`], updatedAt: today }; setCompanies((current) => [...current, company]); setQuery(""); setSelected(company); toast.success(`${name}を追加しました`); };
  const save = (updated: Company) => { setCompanies((current) => current.map((c) => c.id === updated.id ? { ...updated, updatedAt: today } : c)); setSelected({ ...updated, updatedAt: today }); toast.success("企業情報を保存しました"); };
  return <div className="screen"><Header title="企業研究" eyebrow="COMPANY RESEARCH" onMenu={() => onNavigate("settings")} /><div className="segmented-tabs research-tabs"><button className={mode === "research" ? "active" : ""} onClick={() => setMode("research")}><Search size={16} />調べる</button><button className={mode === "summary" ? "active" : ""} onClick={() => setMode("summary")}><Trophy size={16} />まとめ</button></div>{mode === "research" ? <><section className="research-intro"><div className="intro-icon"><Sparkles size={22} /></div><div><p className="eyebrow">RESEARCH DESK</p><h2>企業名から、研究メモを始める</h2><p>公式サイト・採用ページなどの参考URLを残しながら、自分の言葉で情報を整理できます。</p></div></section><div className="search-box"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="企業名を入力（例：任天堂）" /><select value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)}><option>ゲーム</option><option>IT・Web</option><option>メーカー</option><option>商社</option><option>その他</option></select><div className="search-actions"><button className="primary-button" onClick={add}><Plus size={17} />追加</button></div></div><div className="section-heading compact"><div><p className="eyebrow">YOUR LIST</p><h2>追加した企業 <span className="count-badge">{companies.length}</span></h2></div></div><div className="company-list">{companies.map((c) => <button className="company-card" key={c.id} onClick={() => setSelected(c)}><div className="company-avatar">{c.name.slice(0, 1)}</div><div className="company-card-main"><div className="company-title"><strong>{c.name}</strong><span className="industry-tag">{c.industry}</span></div><div className="company-meta"><span>勤務地 {c.location}</span><span>志望度 {"★".repeat(c.interest)}{"☆".repeat(5 - c.interest)}</span></div></div><ChevronRight size={18} /></button>)}</div></> : <><section className="summary-banner"><div><p className="eyebrow light">SUMMARY BOARD</p><h2>企業を比べて、<br />志望度を整理する</h2><p>ランキングはあなたの入力値から自動で並び替えます。</p></div><Trophy size={54} strokeWidth={1.5} /></section><div className="chip-row">{industries.map((item) => <button key={item} className={`chip ${industry === item ? "selected" : ""}`} onClick={() => setIndustry(item)}>{item}</button>)}</div><div className="rank-tabs"><button className={rank === "interest" ? "active" : ""} onClick={() => setRank("interest")}><Trophy size={16} />志望度</button><button className={rank === "salary" ? "active" : ""} onClick={() => setRank("salary")}><span className="yen-icon">¥</span>年収</button><button className={rank === "benefits" ? "active" : ""} onClick={() => setRank("benefits")}><span>＋</span>福利厚生</button></div><div className="ranking-list">{sorted.map((c, i) => <div className="ranking-row" key={c.id}><div className={`rank-number rank-${i + 1}`}>{i + 1}</div><div className="company-avatar small">{c.name.slice(0, 1)}</div><button className="ranking-info" onClick={() => setSelected(c)}><strong>{c.name}</strong><span>{c.industry} · {c.location}</span></button><div className="ranking-value"><small>{rank === "interest" ? "志望度" : rank === "salary" ? "想定年収" : "福利厚生"}</small><strong>{rank === "interest" ? `★ ${c.interest}/5` : rank === "salary" ? money(c.salary) : c.benefits === "情報を追加" ? "未入力" : "登録済み"}</strong></div><div className="rank-actions"><button onClick={() => move(companies, setCompanies, c.id, -1)}><ArrowUp size={15} /></button><button onClick={() => move(companies, setCompanies, c.id, 1)}><ArrowDown size={15} /></button></div></div>)}{!sorted.length && <div className="empty-state large"><BriefcaseBusiness size={24} />「調べる」から企業を追加してください。</div>}</div></>}{selected && <CompanyEditor company={selected} onClose={() => setSelected(null)} onSave={save} onDelete={() => { setCompanies((c) => c.filter((x) => x.id !== selected.id)); setSelected(null); toast.success("企業を削除しました"); }} />}</div>; }
function move(companies: Company[], setCompanies: Dispatch<SetStateAction<Company[]>>, id: string, delta: number) { const index = companies.findIndex((c) => c.id === id); const target = index + delta; if (index < 0 || target < 0 || target >= companies.length) return; const next = [...companies]; [next[index], next[target]] = [next[target], next[index]]; setCompanies(next); }
function CompanyEditor({ company, onClose, onSave, onDelete }: { company: Company; onClose: () => void; onSave: (c: Company) => void; onDelete: () => void }) { const [draft, setDraft] = useState(company); const update = (key: keyof Company, value: string | number | null | string[]) => setDraft((d) => ({ ...d, [key]: value })); return <div className="modal-backdrop" onClick={onClose}><section className="editor-modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">COMPANY NOTE</p><h2>{draft.name}</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="form-grid"><label>企業名<input value={draft.name} onChange={(e) => update("name", e.target.value)} /></label><label>業界<input value={draft.industry} onChange={(e) => update("industry", e.target.value)} /></label><label>志望度<select value={draft.interest} onChange={(e) => update("interest", Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></label><label>年収（万円）<input type="number" value={draft.salary ?? ""} placeholder="未入力" onChange={(e) => update("salary", e.target.value ? Number(e.target.value) : null)} /></label><label className="wide">勤務地<input value={draft.location} onChange={(e) => update("location", e.target.value)} /></label><label className="wide">福利厚生<textarea value={draft.benefits} onChange={(e) => update("benefits", e.target.value)} /></label><label className="wide">企業理念<textarea value={draft.philosophy} onChange={(e) => update("philosophy", e.target.value)} placeholder="企業理念・ミッションを記入" /></label><label className="wide">求める人物像<textarea value={draft.person} onChange={(e) => update("person", e.target.value)} placeholder="採用ページなどから記入" /></label><label className="wide">自分のメモ<textarea value={draft.notes} onChange={(e) => update("notes", e.target.value)} /></label><label className="wide">参考URL（1行に1つ）<textarea value={draft.sources.join("\n")} onChange={(e) => update("sources", e.target.value.split("\n").filter(Boolean))} /></label></div><div className="modal-footer"><button className="danger-button" onClick={onDelete}><Trash2 size={16} />削除</button><div><button className="secondary-button" onClick={onClose}>キャンセル</button><button className="primary-button" onClick={() => onSave(draft)}><Check size={16} />保存する</button></div></div></section></div>; }

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

// Long-press-to-drag reordering + rename, for the interview card categories.
// Only the grip icon starts a drag (so tapping the name to rename it can't
// be mistaken for the start of a drag). A press has to hold for LONG_PRESS_MS
// without moving far before it turns into a drag, so an ordinary tap or a
// page scroll never gets hijacked.
const LONG_PRESS_MS = 350;
function CategoryManager({ categories, onReorder, onRename, onClose }: { categories: string[]; onReorder: (next: string[]) => void; onRename: (oldName: string, newName: string) => void; onClose: () => void }) {
  const [order, setOrder] = useState(categories);
  useEffect(() => setOrder(categories), [categories]);
  const [draggingName, setDraggingName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const dragState = useRef<{ name: string; startY: number; rowHeight: number; timer: ReturnType<typeof setTimeout> | null; dragging: boolean } | null>(null);

  const startPress = (name: string, event: React.PointerEvent<HTMLSpanElement>) => {
    // Capture the actual element and pointer id synchronously — React nulls
    // out event.currentTarget as soon as this handler returns, so reading
    // it from inside the setTimeout callback below would crash.
    const handleEl = event.currentTarget;
    const row = handleEl.closest(".category-manager-row") as HTMLElement | null;
    const rowHeight = row?.offsetHeight || 44;
    const pointerId = event.pointerId;
    const timer = setTimeout(() => {
      if (dragState.current) {
        dragState.current.dragging = true;
        setDraggingName(name);
        handleEl.setPointerCapture(pointerId);
      }
    }, LONG_PRESS_MS);
    dragState.current = { name, startY: event.clientY, rowHeight, timer, dragging: false };
  };
  const movePress = (event: React.PointerEvent<HTMLSpanElement>) => {
    const state = dragState.current;
    if (!state) return;
    const deltaY = event.clientY - state.startY;
    if (!state.dragging) {
      if (Math.abs(deltaY) > 12 && state.timer) { clearTimeout(state.timer); dragState.current = null; }
      return;
    }
    const shift = Math.round(deltaY / state.rowHeight);
    if (!shift) return;
    const fromIndex = order.indexOf(state.name);
    const toIndex = Math.max(0, Math.min(order.length - 1, fromIndex + shift));
    if (toIndex === fromIndex) return;
    const next = [...order];
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, state.name);
    state.startY = event.clientY;
    setOrder(next);
    onReorder(next);
  };
  const endPress = () => {
    if (dragState.current?.timer) clearTimeout(dragState.current.timer);
    dragState.current = null;
    setDraggingName(null);
  };
  const commitRename = (name: string) => { onRename(name, editValue); setEditingName(null); };

  return <div className="modal-backdrop" onClick={onClose}>
    <section className="editor-modal category-manager-modal" onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><div><p className="eyebrow">CATEGORIES</p><h2>カテゴリを編集</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>
      <p className="category-manager-hint">アイコンを長押ししてドラッグすると並び替えられます。名前をタップすると変更できます（そのカテゴリの全カードにも反映されます）。</p>
      <div className="category-manager-list">
        {order.map((name) => <div key={name} className={`category-manager-row ${draggingName === name ? "dragging" : ""}`}>
          <span className="drag-handle" onPointerDown={(event) => startPress(name, event)} onPointerMove={movePress} onPointerUp={endPress} onPointerCancel={endPress}><GripVertical size={16} /></span>
          {editingName === name
            ? <input autoFocus value={editValue} onChange={(event) => setEditValue(event.target.value)} onBlur={() => commitRename(name)} onKeyDown={(event) => { if (event.key === "Enter") commitRename(name); if (event.key === "Escape") setEditingName(null); }} />
            : <button className="category-manager-name" onClick={() => { setEditingName(name); setEditValue(name); }}>{name}<Pencil size={13} /></button>}
        </div>)}
        {!order.length && <div className="empty-state"><BookOpen size={18} />カテゴリはまだありません。</div>}
      </div>
    </section>
  </div>;
}

// Long-press-to-drag reordering for the interview cards themselves, applied
// straight to the cards in the grid (see startCardDrag/moveCardDrag/
// endCardDrag in InterviewScreen below) — no separate "reorder" screen or
// button needed; press and hold a card, then drag it where it should go.

function InterviewScreen({ cards, setCards, onNavigate }: { cards: InterviewCard[]; setCards: Dispatch<SetStateAction<InterviewCard[]>>; onNavigate: (s: Screen) => void }) {
  const [flipped, setFlipped] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<InterviewCard | null>(null);
  const [category, setCategory] = useState("すべて");
  const [managingCategories, setManagingCategories] = useState(false);
  const [draft, setDraft] = useState({ question: "", answer: "", category: "基本" });
  // Long-press-to-drag reordering, applied straight to the cards in the
  // grid — press and hold a card, then drag it over the slot it should land
  // in. `justDraggedRef` swallows the click a long-press-and-release
  // normally fires on the flip button right after, so finishing a drag
  // never also flips the card it was just dropped on.
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const cardDragState = useRef<{ id: string; pointerId: number; startX: number; startY: number; timer: ReturnType<typeof setTimeout> | null; dragging: boolean } | null>(null);
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
  const visibleCards = category === "すべて" ? cards : cards.filter((card) => card.category === category);

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
  const add = () => {
    const finalCategory = ensureCategory(draft.category) || "基本";
    if (!draft.question || !draft.answer) return toast.error("質問と答えを入力してください");
    // New cards go to the front, not the back — a card you just wrote about
    // is usually the one you want to see (and keep practicing) first.
    setCards((current) => [{ ...draft, category: finalCategory, id: `card-${Date.now()}` }, ...current]);
    setDraft({ question: "", answer: "", category: "基本" });
    setShow(false);
    toast.success("面接カードを追加しました");
  };
  const saveEdit = () => {
    if (!editing || !editing.question || !editing.answer) return toast.error("質問と答えを入力してください");
    const finalCategory = ensureCategory(editing.category) || editing.category;
    setCards((current) => current.map((card) => card.id === editing.id ? { ...editing, category: finalCategory } : card));
    setEditing(null);
    toast.success("面接カードを更新しました");
  };
  const toggleImportant = (id: string) => setCards((current) => current.map((card) => card.id === id ? { ...card, important: !card.important } : card));
  // Tapping the currently-selected rating again clears it, so "no rating
  // yet" stays reachable without a separate button.
  const setRating = (id: string, rating: SelfRating) => setCards((current) => current.map((card) => card.id === id ? { ...card, rating: card.rating === rating ? null : rating } : card));

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
    const timer = setTimeout(() => {
      if (cardDragState.current) {
        cardDragState.current.dragging = true;
        justDraggedRef.current = true;
        dragOrderRef.current = visibleCards.map((card) => card.id);
        setDraggingCardId(id);
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
    cardDragState.current = { id, pointerId, startX: event.clientX, startY: event.clientY, timer, dragging: false };
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
    cardDragState.current = null;
    setDraggingCardId(null);
    setTimeout(() => { justDraggedRef.current = false; }, 0);
  };
  return <div className="screen">
    <Header title="面接カード" eyebrow="INTERVIEW PREP" onMenu={() => onNavigate("settings")} />
    <section className="page-lead"><div><p className="eyebrow">FLIP CARDS</p><h2>タップして、答えを確認</h2><p>カードをタップして回答を確認。鉛筆ボタンから内容もいつでも書き換えられます。</p></div><button className="primary-button" onClick={() => setShow((value) => !value)}><Plus size={17} />カード追加</button></section>
    <div className="category-filter"><span className="filter-label">カテゴリ</span>{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}<small>{item === "すべて" ? cards.length : cards.filter((card) => card.category === item).length}</small></button>)}<button className="icon-button category-manage-button" aria-label="カテゴリを編集" onClick={() => setManagingCategories(true)}><Settings size={15} /></button></div>
    <div className="card-filter"><span>{visibleCards.length} cards</span><span className="hint"><GripVertical size={14} />長押しで並び替え</span><span className="hint"><RefreshCw size={14} />表と裏をタップで切替</span></div>
    {/* Rendered right above the card list (not below it) so opening the form
        with the "カード追加" button up top never requires scrolling past
        every existing card just to start typing. */}
    {show && <div className="inline-form"><div className="form-heading"><div><p className="eyebrow">NEW CARD</p><h3>面接カードを作る</h3></div><button className="icon-button" onClick={() => setShow(false)}><X size={17} /></button></div><label>カテゴリ<CategoryPicker value={draft.category} categories={categoryOrder} onChange={(value) => setDraft({ ...draft, category: value })} resetKey={show ? "open" : "closed"} /></label><label>質問<AutoGrowTextarea value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} placeholder="例：最近気になったニュースは？" /></label><label>答え<AutoGrowTextarea value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} placeholder="自分の言葉で答えを記入" /></label><button className="primary-button" onClick={add}><Check size={16} />保存する</button></div>}
    <div className="flashcard-grid" ref={cardGridRef} onPointerMove={moveCardDrag} onPointerUp={endCardDrag} onPointerCancel={endCardDrag}>{visibleCards.map((card) => <div key={card.id} className="flashcard-item">
      <div
        className={`flashcard-wrap ${flipped === card.id ? "flipped" : ""} ${draggingCardId === card.id ? "dragging" : ""}`}
        onPointerDown={(event) => startCardDrag(card.id, event)}
      >
        <button className={`flashcard ${flipped === card.id ? "flipped" : ""}`} onClick={() => { if (justDraggedRef.current) return; setFlipped(flipped === card.id ? null : card.id); }}><div className="flash-front"><span className="card-label">{card.category} · QUESTION</span><h3>{card.question}</h3><span className="flip-hint">タップして答えを見る <ChevronRight size={15} /></span></div><div className="flash-back"><span className="card-label">{card.category} · ANSWER</span><p>{card.answer}</p><span className="flip-hint">もう一度タップで質問へ <RefreshCw size={15} /></span></div></button>
        <button className="card-edit-button" aria-label={`${card.question}を編集`} onClick={() => setEditing(card)}><Settings size={15} /></button>
      </div>
      {/* Lives outside the flip card, not on either face, so it stays put
          and tappable no matter which side (question/answer) is showing. */}
      <div className="flashcard-footer">
        <button className={`star-toggle ${card.important ? "active" : ""}`} aria-label={card.important ? "重要を解除" : "重要にする"} onClick={() => toggleImportant(card.id)}><Star size={16} fill={card.important ? "currentColor" : "none"} /></button>
        <div className="rating-group">{RATING_ORDER.map((r) => <button key={r} className={`rating-${r} ${card.rating === r ? "active" : ""}`} onClick={() => setRating(card.id, r)}>{RATING_LABEL[r]}</button>)}</div>
      </div>
    </div>)}</div>
    {!visibleCards.length && <div className="empty-state large"><BookOpen size={24} />このカテゴリにはカードがありません。</div>}
    {editing && <div className="modal-backdrop" onClick={() => setEditing(null)}><section className="editor-modal card-editor-modal" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">EDIT CARD</p><h2>面接カードを編集</h2></div><button className="icon-button" onClick={() => setEditing(null)}><X size={19} /></button></div><div className="form-grid"><label className="wide">カテゴリ<CategoryPicker value={editing.category} categories={categoryOrder} onChange={(value) => setEditing({ ...editing, category: value })} resetKey={editing.id} /></label><label className="wide">質問<AutoGrowTextarea value={editing.question} onChange={(event) => setEditing({ ...editing, question: event.target.value })} /></label><label className="wide">答え<AutoGrowTextarea value={editing.answer} onChange={(event) => setEditing({ ...editing, answer: event.target.value })} /></label></div><div className="modal-footer"><button className="danger-button" onClick={() => { setCards((current) => current.filter((card) => card.id !== editing.id)); setEditing(null); toast.success("面接カードを削除しました"); }}><Trash2 size={16} />削除</button><div><button className="secondary-button" onClick={() => setEditing(null)}>キャンセル</button><button className="primary-button" onClick={saveEdit}><Check size={16} />更新する</button></div></div></section></div>}
    {managingCategories && <CategoryManager categories={categoryOrder} onReorder={setCategoryOrder} onRename={renameCategory} onClose={() => setManagingCategories(false)} />}
  </div>;
}
function ScheduleScreen({ schedule, setSchedule, onNavigate }: { schedule: ScheduleItem[]; setSchedule: Dispatch<SetStateAction<ScheduleItem[]>>; onNavigate: (s: Screen) => void }) { const [show, setShow] = useState(false); const [draft, setDraft] = useState({ title: "", date: today, time: "19:00", category: "その他" }); const add = () => { if (!draft.title) return toast.error("予定名を入力してください"); setSchedule((c) => [...c, { ...draft, id: `task-${Date.now()}`, done: false }].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))); setDraft({ title: "", date: today, time: "19:00", category: "その他" }); setShow(false); toast.success("予定を追加しました"); }; return <div className="screen"><Header title="就活スケジュール" eyebrow="YOUR TIMELINE" onMenu={() => onNavigate("settings")} /><section className="schedule-hero"><div><p className="eyebrow light">KEEP MOVING</p><h2>締切から逆算して、<br />今日やることを決める。</h2></div><CalendarDays size={48} /></section><div className="section-heading"><div><p className="eyebrow">TIMELINE</p><h2>やることリスト</h2></div><button className="primary-button" onClick={() => setShow((v) => !v)}><Plus size={17} />予定追加</button></div>{show && <div className="inline-form schedule-form"><div className="form-grid"><label className="wide">予定名<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="例：一次面接の準備" /></label><label>日付<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label><label>時間<input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></label><label className="wide">カテゴリ<input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></label></div><button className="primary-button" onClick={add}><Check size={16} />保存する</button></div>}<div className="timeline">{schedule.map((item) => <div className={`timeline-item ${item.done ? "done" : ""}`} key={item.id}><button className="check-circle" onClick={() => setSchedule((c) => c.map((x) => x.id === item.id ? { ...x, done: !x.done } : x))}>{item.done && <Check size={14} />}</button><div className="timeline-main"><div className="timeline-top"><strong>{item.title}</strong><span>{item.date} · {item.time}</span></div><p>{item.category}</p></div><button className="delete-plain" onClick={() => setSchedule((c) => c.filter((x) => x.id !== item.id))}><Trash2 size={16} /></button></div>)}</div></div>; }

function SettingsScreen({ onNavigate, onUpdateApp }: { onNavigate: (s: Screen) => void; onUpdateApp: () => void }) {
  const [status, setStatus] = useState("");
  const getData = () => ({ companies: load("cc_companies", starterCompanies), cards: load("cc_cards", starterCards), schedule: load("cc_schedule", starterSchedule), exportedAt: new Date().toISOString(), formatVersion: 1 });
  const download = (bytes: Uint8Array, filename: string, type: string) => { const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type })); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); };
  const backup = () => { download(strToU8(JSON.stringify(getData(), null, 2)), `career-compass-backup-${today}.json`, "application/json"); setStatus("JSONバックアップを書き出しました"); };
  const backupZip = () => { const data = getData(); download(createBackupZip(data), `career-compass-backup-${today}.zip`, "application/zip"); setStatus("ZIPバックアップを書き出しました"); };
  const restore = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const isZip = file.name.toLowerCase().endsWith(".zip"); const reader = new FileReader(); reader.onload = () => { try { const bytes = isZip ? new Uint8Array(reader.result as ArrayBuffer) : strToU8(String(reader.result)); const data = parseBackupBytes(bytes, file.name) as CloudPayload; ["companies", "cards", "schedule"].forEach((key) => { const value = data[key as keyof CloudPayload]; if (Array.isArray(value)) localStorage.setItem(`cc_${key}`, JSON.stringify(value)); }); setStatus("バックアップを復元しました。画面を再読み込みします"); setTimeout(() => location.reload(), 700); } catch { setStatus("バックアップを読み込めませんでした。Career CompassのJSONまたはZIPを選択してください"); } }; if (isZip) reader.readAsArrayBuffer(file); else reader.readAsText(file); e.target.value = ""; };
  return <div className="screen"><Header title="設定" eyebrow="PREFERENCES & DATA" onMenu={() => onNavigate("home")} /><section className="page-lead"><div><p className="eyebrow">YOUR SPACE</p><h2>安心して、積み上げる</h2><p>アプリの更新でデータが消えないように、この端末に自動保存しています。</p></div><Settings size={42} /></section><section className="settings-card"><div className="settings-icon"><FileDown size={20} /></div><div><h3>就活データのバックアップ</h3><p>企業・面接カード・予定をJSONまたはZIPで保存できます。他の端末に移すときは、こちらのZIPを復元してください。</p><div className="settings-actions"><button className="secondary-button" onClick={backupZip}><FileDown size={16} />ZIPで保存</button><button className="secondary-button" onClick={backup}>JSONで保存</button><label className="secondary-button"><FileUp size={16} />JSON / ZIP復元<input type="file" accept="application/json,.json,application/zip,.zip" onChange={restore} hidden /></label></div>{status && <small className="status-message">{status}</small>}</div></section><section className="settings-card"><div className="settings-icon green"><RefreshCw size={20} /></div><div><h3>端末に自動保存中</h3><p>企業・面接カード・予定は、このブラウザのローカル領域に自動保存されます。別の端末で使うときは上のバックアップ機能でデータを移してください。</p></div></section><section className="settings-card"><div className="settings-icon green"><RefreshCw size={20} /></div><div><h3>PWAを最新バージョンに更新</h3><p>設定画面からいつでも新しいアプリ本体を確認できます。更新後は自動的に再読み込みします。</p><button className="secondary-button" onClick={onUpdateApp}><RefreshCw size={16} />今すぐ更新を確認</button></div></section><button className="outline-wide" onClick={() => onNavigate("home")}><HomeIcon size={17} />ホームに戻る</button></div>;
}
export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [companies, setCompanies] = usePersisted<Company[]>("cc_companies", starterCompanies);
  const [cards, setCards] = usePersisted<InterviewCard[]>("cc_cards", starterCards);
  const [schedule, setSchedule] = usePersisted<ScheduleItem[]>("cc_schedule", starterSchedule);
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

  return <div className="app-shell"><aside className="side-rail"><Logo /><div className="rail-label">WORKSPACE</div>{([{ id: "home", label: "ホーム", Icon: HomeIcon }, { id: "research", label: "企業研究", Icon: BriefcaseBusiness }, { id: "interview", label: "面接カード", Icon: BookOpen }, { id: "schedule", label: "スケジュール", Icon: CalendarDays }, { id: "settings", label: "設定", Icon: Settings }] as Array<{ id: Screen; label: string; Icon: typeof HomeIcon }>).map(({ id, label, Icon }) => <button key={id} className={`rail-button ${screen === id ? "active" : ""}`} onClick={() => setScreen(id)}><Icon size={18} />{label}</button>)}<div className="rail-spacer" /><div className="rail-footer"><div className="avatar">自</div><div><strong>My workspace</strong><small>この端末に自動保存</small></div></div></aside><main className="main-content">{screen === "home" && <HomeScreen companies={companies} schedule={schedule} onNavigate={setScreen} />}{screen === "research" && <ResearchScreen companies={companies} setCompanies={setCompanies} onNavigate={setScreen} />}{screen === "interview" && <InterviewScreen cards={cards} setCards={setCards} onNavigate={setScreen} />}{screen === "schedule" && <ScheduleScreen schedule={schedule} setSchedule={setSchedule} onNavigate={setScreen} />}{screen === "settings" && <SettingsScreen onNavigate={setScreen} onUpdateApp={updateApp} />}</main><BottomNav screen={screen} onChange={setScreen} /></div>;
}
