"use client";

import { useState } from "react";
import type { EntityCardDeck } from "@/lib/cardDeck";

export function CardDeckSummary({ deck }: { deck: EntityCardDeck }) {
  const [open, setOpen] = useState(false);

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
        <ol className="mt-2 grid max-h-48 gap-1 overflow-y-auto border border-ink/10 bg-paper/60 p-2">
          {deck.cards.map((card) => (
            <li
              key={card.segment.id}
              className="flex items-center justify-between gap-2 border-b border-ink/5 py-1 text-xs last:border-none"
            >
              <span className="truncate font-semibold text-ink/75">{card.segment.title}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                  card.presented ? "bg-ink/10 text-ink/60" : "bg-cyanline/20 text-ink"
                }`}
              >
                {card.presented ? "Presented" : "Not presented"}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
