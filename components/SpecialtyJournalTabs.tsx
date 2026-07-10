"use client";

import { useState } from "react";
import { CardDeckSummary } from "@/components/CardDeckSummary";
import { EMPTY_CARD_DECK, type EntityCardDeck } from "@/lib/cardDeck";
import {
  groupJournalsBySpecialty,
  journalWatchSpecialties,
  type JournalWatchSpecialty
} from "@/lib/catalog/journalWatchSpecialties";
import type { OncologyJournal } from "@/lib/types";

export function SpecialtyJournalTabs({
  journals,
  journalIds,
  toggle,
  journalCardDecks
}: {
  journals: OncologyJournal[];
  journalIds: string[];
  toggle: (field: "journalIds", id: string) => void;
  journalCardDecks: Record<string, EntityCardDeck>;
}) {
  const [activeTab, setActiveTab] = useState<JournalWatchSpecialty>(journalWatchSpecialties[0]);
  const groups = groupJournalsBySpecialty(journals);
  const activeJournals = groups.get(activeTab) ?? [];

  return (
    <div className="col-span-full">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {journalWatchSpecialties.map((specialty) => {
          const group = groups.get(specialty) ?? [];
          const selectedCount = group.filter((journal) => journalIds.includes(journal.id)).length;
          const isActive = specialty === activeTab;
          return (
            <button
              key={specialty}
              type="button"
              onClick={() => setActiveTab(specialty)}
              className={`border px-2.5 py-1.5 text-xs font-black uppercase transition ${
                isActive
                  ? "border-broadcast bg-broadcast text-white"
                  : "border-ink/10 bg-white text-ink/70 hover:border-broadcast/50"
              }`}
            >
              {specialty}
              {group.length > 0 ? (
                <span className={isActive ? "text-white/70" : "text-ink/40"}>
                  {" "}
                  ({selectedCount}/{group.length})
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {activeJournals.length === 0 ? (
          <p className="text-xs font-semibold text-ink/50">
            No journals catalogued under this specialty yet.
          </p>
        ) : (
          activeJournals.map((journal) => (
            <label key={journal.id} className="flex gap-3 border border-ink/10 bg-white p-3">
              <input
                type="checkbox"
                checked={journalIds.includes(journal.id)}
                onChange={() => toggle("journalIds", journal.id)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-black">{journal.name}</span>
                <span className="block truncate text-xs font-semibold text-ink/50">
                  {journal.rssUrl}
                </span>
                <CardDeckSummary
                  deck={journalCardDecks[journal.id] ?? EMPTY_CARD_DECK}
                  autoExpand={journalIds.includes(journal.id)}
                  entityType="journal"
                  entityId={journal.id}
                />
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
