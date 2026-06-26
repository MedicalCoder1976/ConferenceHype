"use client";

import { BookOpen, Plus, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CardDeckSummary } from "@/components/CardDeckSummary";
import { EMPTY_CARD_DECK, type EntityCardDeck } from "@/lib/cardDeck";
import type { EditorialPackage, OncologyJournal } from "@/lib/types";

export function JournalWatchDesk({
  initialJournals,
  cardDecks = {},
  onPackageDeveloped
}: {
  initialJournals: OncologyJournal[];
  cardDecks?: Record<string, EntityCardDeck>;
  onPackageDeveloped?: (editorialPackage: EditorialPackage) => void;
}) {
  const [journals, setJournals] = useState(initialJournals);
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [activeId, setActiveId] = useState("");
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: "", abbreviation: "", rssUrl: "", officialUrl: "" });

  const develop = (journal: OncologyJournal) => startTransition(async () => {
    setActiveId(journal.id);
    try {
      const response = await fetch("/api/admin/editorial-packages/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journalId: journal.id })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not develop issue.");
      setMessage(`${journal.name} Journal Watch package developed with four sections and 60 cards.`);
      onPackageDeveloped?.(payload.editorialPackage);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not develop issue.");
    } finally {
      setActiveId("");
    }
  });

  const addJournal = () => startTransition(async () => {
    try {
      const response = await fetch("/api/admin/oncology-journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not add journal.");
      setJournals((current) => [...current.filter((item) => item.id !== payload.journal.id), payload.journal]);
      setForm({ name: "", abbreviation: "", rssUrl: "", officialUrl: "" });
      setMessage(`${payload.journal.name} added to automatic Journal Watch.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add journal.");
    }
  });

  return (
    <section className="grid gap-5">
      <div className="border border-ink/10 bg-white p-5 shadow-panel">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-broadcast" />
          <h2 className="text-2xl font-black">Oncology Journal Watch</h2>
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-ink/65">
          New RSS editions are detected automatically. Each issue becomes a one-hour,
          four-section, sixty-card review in Memory before scheduling.
        </p>
        {message ? <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold">{message}</div> : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {journals.map((journal) => (
          <article key={journal.id} className="border border-ink/10 bg-white p-4 shadow-panel">
            <div className="text-xs font-black uppercase text-broadcast">{journal.abbreviation}</div>
            <h3 className="mt-1 text-lg font-black">{journal.name}</h3>
            <div className="mt-2 text-xs font-semibold text-ink/55">
              Last package: {journal.lastIssueKey ?? "awaiting first issue"}
            </div>
            <CardDeckSummary
              deck={cardDecks[journal.id] ?? EMPTY_CARD_DECK}
              entityType="journal"
              entityId={journal.id}
            />
            <button disabled={pending} onClick={() => develop(journal)} className="mt-4 inline-flex min-h-11 items-center gap-2 bg-ink px-4 text-xs font-black uppercase text-white disabled:opacity-50">
              <WandSparkles className="h-4 w-4" />
              {activeId === journal.id ? "Developing..." : "Develop latest issue"}
            </button>
          </article>
        ))}
      </div>
      <div className="border border-ink/10 bg-white p-5 shadow-panel">
        <h3 className="text-lg font-black">Add oncology journal RSS</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Journal name" className="border border-ink/20 px-3 py-3" />
          <input value={form.abbreviation} onChange={(event) => setForm({ ...form, abbreviation: event.target.value })} placeholder="Abbreviation" className="border border-ink/20 px-3 py-3" />
          <input value={form.rssUrl} onChange={(event) => setForm({ ...form, rssUrl: event.target.value })} placeholder="https://... RSS feed" className="border border-ink/20 px-3 py-3" />
          <input value={form.officialUrl} onChange={(event) => setForm({ ...form, officialUrl: event.target.value })} placeholder="https://... journal home" className="border border-ink/20 px-3 py-3" />
        </div>
        <button disabled={pending || !form.name || !form.rssUrl || !form.officialUrl} onClick={addJournal} className="mt-3 inline-flex min-h-11 items-center gap-2 bg-broadcast px-4 text-xs font-black uppercase text-white disabled:opacity-50">
          <Plus className="h-4 w-4" /> Add journal
        </button>
      </div>
    </section>
  );
}
