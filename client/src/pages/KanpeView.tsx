import { useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/basePath";
import type { InterviewCard } from "@/pages/Home";

// Same per-color gradients as the flashcard's front face (see index.css's
// .card-color-* rules) — duplicated as plain values here rather than shared,
// because this view intentionally skips the main app's CSS/providers
// entirely (see below), the same way SharedCompanyView does.
const CARD_GRADIENTS: Record<string, [string, string]> = {
  purple: ["#6554d9", "#8976ee"],
  blue: ["#2f6fd6", "#63a0ef"],
  green: ["#2f9c74", "#5cc79f"],
  orange: ["#d17a2e", "#eaa563"],
  pink: ["#c94f83", "#e585ac"],
  gray: ["#5c5c6e", "#8a8a9c"],
};

function loadCards(): InterviewCard[] {
  try {
    const raw = localStorage.getItem("cc_cards");
    return raw ? (JSON.parse(raw) as InterviewCard[]) : [];
  } catch {
    return [];
  }
}

// Rendered instead of the whole app (see App.tsx) when the URL's hash starts
// with #kanpe= — a single interview card blown up to fill its own small
// window, meant to sit near the webcam during an online interview (opened
// via lib/kanpe.ts's openKanpeWindow). It's a same-origin popup of this same
// app, so — unlike the #share= view, which has to carry its whole payload
// inside the link itself — it just reads this device's own localStorage
// directly, live, and a "storage" listener keeps it in sync if the card is
// edited in the main tab while this window stays open.
export default function KanpeView({ cardId }: { cardId: string }) {
  const [cards, setCards] = useState<InterviewCard[]>(() => loadCards());

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "cc_cards" || event.key === null) setCards(loadCards());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const card = cards.find((item) => item.id === cardId);

  useEffect(() => {
    document.title = card ? `カンペ｜${card.question.slice(0, 18)}` : "カンペ｜Career Compass";
  }, [card]);

  if (!card) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-800 text-white text-center text-sm p-4 leading-relaxed">
        このカードが見つかりませんでした。
        <br />
        メイン画面で削除されたか、リンクが正しくない可能性があります。
        <br />
        <a href={`${BASE_PATH}/`} className="text-[#b6aedd] underline mt-2 inline-block">
          Career Compassを開く
        </a>
      </div>
    );
  }

  const [colorA, colorB] = CARD_GRADIENTS[card.color ?? "purple"] ?? CARD_GRADIENTS.purple;

  return (
    <div
      className="min-h-screen w-full flex flex-col gap-2 p-4 overflow-auto text-white select-none"
      style={{ background: `linear-gradient(145deg, ${colorA}, ${colorB})` }}
    >
      <span className="text-[10px] font-bold tracking-widest opacity-80 uppercase shrink-0">{card.category}</span>
      <p className="text-[clamp(12px,3.4vw,17px)] font-bold leading-snug whitespace-pre-line shrink-0">{card.question}</p>
      <div className="mt-1 pt-2 border-t border-white/25 text-[clamp(13px,4vw,21px)] leading-snug whitespace-pre-line font-medium">
        {card.answer}
      </div>
    </div>
  );
}
