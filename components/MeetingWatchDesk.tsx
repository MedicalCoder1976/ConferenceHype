"use client";

import { CalendarSearch, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CardDeckSummary } from "@/components/CardDeckSummary";
import { EMPTY_CARD_DECK, type EntityCardDeck } from "@/lib/cardDeck";
import type { MedicalConference } from "@/lib/types";

export function MeetingWatchDesk({
  conferences,
  cardDecks = {}
}: {
  conferences: MedicalConference[];
  cardDecks?: Record<string, EntityCardDeck>;
}) {
  const [message, setMessage] = useState("");
  const router = useRouter();
  const [activeId, setActiveId] = useState("");
  const [pending, startTransition] = useTransition();
  const oncologyMeetings = conferences.filter((conference) =>
    conference.specialties.some((specialty) => specialty === "Oncology" || specialty === "Hematology")
  );

  const develop = (conference: MedicalConference) => startTransition(async () => {
    setActiveId(conference.id);
    try {
      const response = await fetch("/api/admin/editorial-packages/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conferenceId: conference.id })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not develop Meeting Watch.");
      setMessage(`${conference.name} Meeting Watch developed and saved to Memory.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not develop Meeting Watch.");
    } finally {
      setActiveId("");
    }
  });

  return (
    <section className="grid gap-4">
      <div className="border border-ink/10 bg-white p-5 shadow-panel">
        <div className="flex items-center gap-2">
          <CalendarSearch className="h-5 w-5 text-broadcast" />
          <h2 className="text-2xl font-black">Oncology Meeting Watch</h2>
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-ink/65">
          Develop four-section packages covering abstracts, exhibition booths,
          attributed conference chatter, and media reporting.
        </p>
        {message ? <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold">{message}</div> : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {oncologyMeetings.map((conference) => (
          <article key={conference.id} className="border border-ink/10 bg-white p-4 shadow-panel">
            <div className="text-xs font-black uppercase text-broadcast">{conference.acronym ?? "Meeting Watch"}</div>
            <h3 className="mt-1 text-lg font-black">{conference.name}</h3>
            <div className="mt-2 text-xs font-semibold text-ink/55">
              {conference.startDate ?? `${conference.year}-${String(conference.month).padStart(2, "0")}`} {conference.city ? `- ${conference.city}` : ""}
            </div>
            <CardDeckSummary deck={cardDecks[conference.id] ?? EMPTY_CARD_DECK} />
            <button disabled={pending} onClick={() => develop(conference)} className="mt-4 inline-flex min-h-11 items-center gap-2 bg-ink px-4 text-xs font-black uppercase text-white disabled:opacity-50">
              <WandSparkles className="h-4 w-4" />
              {activeId === conference.id ? "Developing..." : "Develop material"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
