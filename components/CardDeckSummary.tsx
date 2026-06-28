"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { EntityCardDeck } from "@/lib/cardDeck";

export function CardDeckSummary({
  deck,
  autoExpand = false,
  entityType,
  entityId
}: {
  deck: EntityCardDeck;
  autoExpand?: boolean;
  // When provided, renders a "Generate more cards" button that re-checks
  // sources/X for this one entity and adds any new cards to its deck —
  // for when the admin reviews what's here and doesn't like it.
  entityType?: "conference" | "journal" | "source";
  entityId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(autoExpand);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  // Checking a conference/journal/source should immediately surface its
  // card content for review, not hide it behind one more click. Once open,
  // leave it to the admin's own toggle — unchecking doesn't snap it shut.
  useEffect(() => {
    if (autoExpand) {
      setOpen(true);
    }
  }, [autoExpand]);

  const generateMore = () => {
    if (!entityType || !entityId) {
      return;
    }
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/source-cards/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType, entityId })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not generate more cards.");
        }
        setMessage(
          payload.generated > 0
            ? `Added ${payload.generated} new card${payload.generated === 1 ? "" : "s"}.`
            : "No new cards found — nothing has changed since the last check."
        );
        setOpen(true);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not generate more cards.");
      }
    });
  };

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
      <div className="mt-1 flex flex-wrap items-center gap-3">
        {deck.total > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="text-[11px] font-bold uppercase text-ink/50 underline"
          >
            {open ? "Hide deck" : "View deck"}
          </button>
        ) : null}
        {entityType && entityId ? (
          <button
            type="button"
            disabled={pending}
            onClick={generateMore}
            className="text-[11px] font-bold uppercase text-broadcast underline disabled:opacity-50"
          >
            {pending ? "Looking again..." : "Don't like these? Generate more cards"}
          </button>
        ) : null}
      </div>
      {message ? <div className="mt-1 text-[11px] font-bold text-ink/60">{message}</div> : null}
      {open ? (
        <ol className="mt-2 grid max-h-96 gap-2 overflow-y-auto border border-ink/10 bg-paper/60 p-2">
          {deck.cards.map((card) => {
            // Review shows the entire broadcast script, every time -- never
            // the shorter `summary` field. No fallback to summary: a blank
            // script is a real bug to surface, not something to mask by
            // quietly substituting different (and shorter) text.
            const spokenText = card.segment.script || "No script on this card — flag for review.";
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
                <p className="mt-1 whitespace-pre-line font-semibold leading-5 text-ink/65">
                  {spokenText}
                </p>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
