"use client";

import { useId, useState } from "react";
import { CardDeckSummary } from "@/components/CardDeckSummary";
import { EMPTY_CARD_DECK, type EntityCardDeck } from "@/lib/cardDeck";
import {
  groupJournalsBySpecialty,
  journalWatchSpecialties,
  type JournalWatchSpecialty
} from "@/lib/catalog/journalWatchSpecialties";
import type { OncologyJournal } from "@/lib/types";

// Single-select variant of SpecialtyJournalTabs, used to pick exactly one
// journal for a 30-minute journal-only broadcast slot. Reuses that
// component's specialty-tab grouping/rendering pattern -- multi-select
// (SpecialtyJournalTabs' checkbox/toggle) doesn't fit "pick one journal for
// this slot," so this is a UI-pattern reuse, not a shared-logic reuse.
export function SingleJournalPicker({
  journals,
  selectedJournalId,
  onSelect,
  journalCardDecks
}: {
  journals: OncologyJournal[];
  selectedJournalId: string | undefined;
  onSelect: (id: string) => void;
  journalCardDecks: Record<string, EntityCardDeck>;
}) {
  const radioGroupName = useId();
  const [activeTab, setActiveTab] = useState<JournalWatchSpecialty>(journalWatchSpecialties[0]);
  const groups = groupJournalsBySpecialty(journals);
  const activeJournals = groups.get(activeTab) ?? [];

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {journalWatchSpecialties.map((specialty) => {
          const group = groups.get(specialty) ?? [];
          const isActive = specialty === activeTab;
          const hasSelection = group.some((journal) => journal.id === selectedJournalId);
          return (
            <button
              key={specialty}
              type="button"
              onClick={() => setActiveTab(specialty)}
              className={`border px-2.5 py-1.5 text-xs font-black uppercase transition ${
                isActive
                  ? "border-broadcast bg-broadcast text-white"
                  : hasSelection
                    ? "border-mint bg-mint/10 text-ink/70 hover:border-broadcast/50"
                    : "border-ink/10 bg-white text-ink/70 hover:border-broadcast/50"
              }`}
            >
              {specialty}
              {group.length > 0 ? (
                <span className={isActive ? "text-white/70" : "text-ink/40"}> ({group.length})</span>
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
                type="radio"
                name={radioGroupName}
                checked={selectedJournalId === journal.id}
                onChange={() => onSelect(journal.id)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-black">{journal.name}</span>
                <span className="block truncate text-xs font-semibold text-ink/50">
                  {journal.rssUrl}
                </span>
                <CardDeckSummary
                  deck={journalCardDecks[journal.id] ?? EMPTY_CARD_DECK}
                  autoExpand={selectedJournalId === journal.id}
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
