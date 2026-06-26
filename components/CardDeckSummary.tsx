"use client";

import { useEffect, useState } from "react";
import type { EntityCardDeck } from "@/lib/cardDeck";

export function CardDeckSummary({
  deck,
  autoExpand = false
}: {
  deck: EntityCardDeck;
  autoExpand?: boolean;
}) {
  const [open, setOpen] = useState(autoExpand);

  // Checking a conference/journal/source should immediately surface its
  // card content for review, not hide it behind one more click. Once open,
  // leave it to the admin's own toggle — unchecking doesn't snap it shut.
  useEffect(() => {
    if (autoExpand) {
      setOpen(true);
    }
  }, [autoExpand]);

  return (
    <div className="mt-2">
      <div className="text-xs font-black uppercase text-broadcast">
        {deck.total} card{deck.total === 1 ? "" : "s"} available
        {deck.total > 0 ? (
          <span className="ml-1 font-semibold text-ink/45">
            ({deck.notPresentedCount} ready / {deck.presentedCount} presented)
          </span>
        ) : null}
      </div>
      {deck.total > 0 ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="mt-1 text-[11px] font-bold uppercase text-ink/50 underline"
        >
          {open ? "Hide deck" : "View deck"}
        </button>
      ) : null}
      {open ? (
        <ol className="mt-2 grid max-h-96 gap-2 overflow-y-auto border border-ink/10 bg-paper/60 p-2">
          {deck.cards.map((card) => {
            const summary = card.segment.summary || card.segment.script;
            return (
              <li key={card.segment.id} className="border-b border-ink/10 pb-2 text-xs last:border-none">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-ink/80">{card.segment.title}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                      card.presented ? "bg-ink/10 text-ink/60" : "bg-cyanline/20 text-ink"
                    }`}
                  >
                    {card.presented ? "Presented" : "Not presented"}
                  </span>
                </div>
                <p className="mt-1 font-semibold leading-5 text-ink/65">
                  {summary.length > 360 ? `${summary.slice(0, 357)}...` : summary}
                </p>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
