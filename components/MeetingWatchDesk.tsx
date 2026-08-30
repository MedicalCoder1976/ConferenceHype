"use client";

import { CalendarSearch, Radio, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CardDeckSummary } from "@/components/CardDeckSummary";
import { EMPTY_CARD_DECK, type EntityCardDeck } from "@/lib/cardDeck";
import type { MedicalConference } from "@/lib/types";
import { MEETING_WATCH_CLAUDE_INSTRUCTIONS, MEETING_WATCH_CLAUDE_OUTPUT_FORMAT } from "@/lib/meetingWatch/claudeFormat";
import { meetingWatchCaption } from "@/lib/meetingWatch/packaging";

type PreviewEpisode = {
  index: number;
  articleCount: number;
  cardIds: string[];
  cards: Array<{ id: string; title: string; script: string }>;
  clusters: string[];
};

type Preview = {
  sourceUrl: string;
  meetingLabel: string;
  specialty?: string;
  episodes: PreviewEpisode[];
};

// Any meeting, any specialty: paste a URL, pick how many 30-minute episodes,
// and the pipeline (lib/editorial/meetingWatchPipeline.ts) discovers,
// dedupes, and generates enough real cards to fill each one. This desk
// covers the general case; the per-conference "Develop material" section
// below is the older Oncology/Hematology-only editorial-package path, kept
// as-is since it feeds a different (Journal-Watch-style) package format.
type PreparedPreview = {
  ok: true;
  package: {
    content_type: string;
    program: { title: string };
    opening_hook: { visible_text: string };
    cards: Array<{ position: number; title: string; visible_text: string; source_anchor: string; speaker_turns: Array<{ speaker: string; text: string }> }>;
  };
  spokenWords: number;
  durationMinutes: number;
  preambleRemoved: boolean;
  trialOrderNormalized: boolean;
};
export function PreparedNarrativeBroadcast() {
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<PreparedPreview | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const requestPreview = async () => {
    const send = () => fetch("/api/admin/meeting-watch/prepared/preview", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ raw })
    });
    let response: Response;
    try {
      response = await send();
    } catch {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      response = await send();
    }
    const responseText = await response.text();
    let payload: PreparedPreview & { error?: string };
    try {
      payload = JSON.parse(responseText) as PreparedPreview & { error?: string };
    } catch {
      throw new Error(`Preview service returned HTTP ${response.status}. Reload the admin page and try again.`);
    }
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? `Preview failed with HTTP ${response.status}.`);
    return payload;
  };
  const validate = () => startTransition(async () => {
    setMessage(""); setPreview(null);
    try { const payload = await requestPreview(); setPreview(payload); setMessage(payload.trialOrderNormalized ? "Validated. Trial cards were automatically grouped so each trial is discussed once without interruption. Review the corrected sequence below." : payload.preambleRemoved ? "Validated. Introductory text outside the JSON was removed automatically." : "Validated and ready to render."); } catch (error) { setMessage(error instanceof TypeError ? "Could not reach the preview service after two attempts. Reload this admin page and try again." : error instanceof Error ? error.message : "Could not validate this package."); }
  });
  const publish = () => startTransition(async () => {
    try { const response = await fetch("/api/admin/meeting-watch/prepared/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw }) }); const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not start this broadcast."); setRaw(""); setPreview(null); setMessage(payload.alreadyExists ? "This exact package already exists; no duplicate was dispatched. The form is ready for another narrative." : `Broadcast render started: ${payload.cardCount} cards, ${Math.round(payload.durationSeconds / 60)} estimated minutes, ${payload.speakerTurnCount} speaker turns. The form is ready for another narrative.`); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start this broadcast."); }
  });
  return <div className="border-2 border-broadcast/30 bg-white p-5 shadow-panel">
    <div className="flex items-center gap-2"><WandSparkles className="h-5 w-5 text-broadcast" /><h2 className="text-2xl font-black">Meeting Watch: 5 News + Story</h2></div>
    <p className="mt-2 text-sm font-semibold leading-6 text-ink/65">Paste Claude&apos;s five-news Meeting Watch JSON. Every video leads with the meeting name and year, uses a specialty-specific alert, attributes company names only when a primary source supports them, repeats the meeting name and dates, and removes the generic evidence labels from thumbnails and video panels.</p>
    <details className="mt-4 border border-ink/15 bg-paper p-3"><summary className="cursor-pointer text-xs font-black uppercase">Copy Claude instructions and output format</summary><p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6">{MEETING_WATCH_CLAUDE_INSTRUCTIONS}</p><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap border border-ink/10 bg-white p-3 text-xs">{MEETING_WATCH_CLAUDE_OUTPUT_FORMAT}</pre></details>
    <textarea value={raw} onChange={(event) => { setRaw(event.target.value); setPreview(null); }} rows={14} placeholder='Paste Claude JSON beginning with { "schema_version": "conferencehype_meeting_watch_five_news_v1" ...' className="mt-4 w-full border border-ink/20 px-3 py-3 font-mono text-xs text-ink" />
    <div className="mt-3 flex flex-wrap gap-3"><button disabled={pending || raw.length < 2000} onClick={validate} className="min-h-11 bg-ink px-4 text-xs font-black uppercase text-white disabled:opacity-50">{pending ? "Checking..." : "Validate and preview"}</button>{preview ? <button disabled={pending} onClick={publish} className="min-h-11 bg-broadcast px-4 text-xs font-black uppercase text-white disabled:opacity-50">Approve, render and upload</button> : null}</div>
    {message ? <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold">{message}</div> : null}
    {preview ? <div className="mt-4 grid gap-3 border border-ink/10 p-4"><div className="text-lg font-black">{preview.package.program.title}</div><div className="grid gap-2 text-sm font-semibold md:grid-cols-4"><div><b>Type:</b> {preview.package.content_type}</div><div><b>Cards:</b> {preview.package.cards.length}</div><div><b>Spoken words:</b> {preview.spokenWords}</div><div><b>Estimated video:</b> {preview.durationMinutes} min</div></div><div className="text-sm"><b>Opening hook:</b> {preview.package.opening_hook.visible_text}</div><details><summary className="cursor-pointer text-xs font-black uppercase">Review every card</summary><div className="mt-2 grid gap-2">{preview.package.cards.map((card) => <div key={card.position} className="border border-ink/10 p-3"><div className="font-black">{card.position}. {card.title}</div><div className="mt-1 text-sm">{card.visible_text}</div><div className="mt-2 text-xs font-semibold text-ink/55">{card.speaker_turns.length} speaker turn(s) · Source: {card.source_anchor}</div></div>)}</div></details></div> : null}
  </div>;
}

export function NewMeetingWatchBroadcast() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [meetingLabel, setMeetingLabel] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [episodeCount, setEpisodeCount] = useState(2);
  const [startsAt, setStartsAt] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [episodeMeta, setEpisodeMeta] = useState<Array<{ title: string; description: string }>>([]);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const develop = () => startTransition(async () => {
    setMessage("");
    setPreview(null);
    try {
      const response = await fetch("/api/admin/meeting-watch/develop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl, meetingLabel, specialty: specialty || undefined, episodeCount })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not develop this Meeting Watch broadcast.");
      setPreview(payload);
      setEpisodeMeta(
        payload.episodes.map((episode: PreviewEpisode, index: number) => ({
          title: meetingWatchCaption(payload.meetingLabel, payload.specialty, episode.clusters.slice(0, 2).join(" and ") || "Five Meeting News Updates"),
          description: `${meetingWatchCaption(payload.meetingLabel, payload.specialty, episode.clusters.slice(0, 2).join(" and ") || "Five Meeting News Updates")}.\n\nFive source-attributed news and abstract updates from ${payload.meetingLabel}.`
        }))
      );
      setMessage(`Found enough real content for ${payload.episodes.length} episode(s) -- review the cards below, then set a start time and schedule.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not develop this Meeting Watch broadcast.");
    }
  });

  const schedule = () => startTransition(async () => {
    if (!preview) return;
    try {
      const response = await fetch("/api/admin/meeting-watch/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: preview.sourceUrl,
          meetingLabel: preview.meetingLabel,
          specialty: preview.specialty,
          startsAt: new Date(startsAt).toISOString(),
          episodes: preview.episodes.map((episode, index) => ({
            cardIds: episode.cardIds,
            title: episodeMeta[index]?.title ?? `${preview.meetingLabel} - Part ${index + 1}`,
            description: episodeMeta[index]?.description ?? ""
          }))
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not schedule these broadcasts.");
      setMessage(`Scheduled ${payload.broadcasts.length} broadcast(s). They'll render automatically at their start times.`);
      setPreview(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not schedule these broadcasts.");
    }
  });

  return (
    <div className="border border-ink/10 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <Radio className="h-5 w-5 text-broadcast" />
        <h2 className="text-2xl font-black">New Meeting Watch broadcast</h2>
      </div>
      <p className="mt-2 text-sm font-semibold leading-6 text-ink/65">
        Paste a meeting source page, include the meeting name and year, and choose how many five-news episodes to produce. Each episode uses five distinct primary sources and meeting-first Specialist Alert packaging.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs font-black uppercase text-ink/55">
          Source URL
          <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" />
        </label>
        <label className="grid gap-1 text-xs font-black uppercase text-ink/55">
          Meeting label
          <input value={meetingLabel} onChange={(event) => setMeetingLabel(event.target.value)} placeholder="e.g. ASH 2025" className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" />
        </label>
        <label className="grid gap-1 text-xs font-black uppercase text-ink/55">
          Specialty (optional)
          <input value={specialty} onChange={(event) => setSpecialty(event.target.value)} placeholder="e.g. Hematology" className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" />
        </label>
        <label className="grid gap-1 text-xs font-black uppercase text-ink/55">
          Episode count
          <input type="number" min={1} max={6} value={episodeCount} onChange={(event) => setEpisodeCount(Number(event.target.value))} className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" />
        </label>
      </div>
      <button
        disabled={pending || !sourceUrl || !meetingLabel}
        onClick={develop}
        className="mt-4 inline-flex min-h-11 items-center gap-2 bg-ink px-4 text-xs font-black uppercase text-white disabled:opacity-50"
      >
        <WandSparkles className="h-4 w-4" />
        {pending && !preview ? "Finding content..." : "Develop material"}
      </button>
      {message ? <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold">{message}</div> : null}

      {preview ? (
        <div className="mt-5 grid gap-4">
          {preview.episodes.map((episode, index) => (
            <div key={episode.index} className="border border-ink/10 p-3">
              <div className="text-xs font-black uppercase text-broadcast">
                Episode {index + 1}: {episode.cards.length} card(s) from {episode.articleCount} article(s) -- {episode.clusters.join(", ")}
              </div>
              <input
                value={episodeMeta[index]?.title ?? ""}
                onChange={(event) =>
                  setEpisodeMeta((prev) => prev.map((meta, i) => (i === index ? { ...meta, title: event.target.value } : meta)))
                }
                className="mt-2 min-h-11 w-full border border-ink/20 px-3 text-sm font-bold text-ink"
              />
              <textarea
                value={episodeMeta[index]?.description ?? ""}
                onChange={(event) =>
                  setEpisodeMeta((prev) => prev.map((meta, i) => (i === index ? { ...meta, description: event.target.value } : meta)))
                }
                rows={4}
                className="mt-2 w-full border border-ink/20 px-3 py-2 text-sm font-semibold text-ink"
              />
              <details className="mt-2 text-xs font-semibold text-ink/70">
                <summary className="cursor-pointer font-black uppercase text-ink/55">View {episode.cards.length} card script(s)</summary>
                <ul className="mt-2 grid gap-2">
                  {episode.cards.map((card) => (
                    <li key={card.id} className="border border-ink/10 p-2">
                      <div className="font-black">{card.title}</div>
                      <div className="mt-1">{card.script}</div>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
          <label className="grid gap-1 text-xs font-black uppercase text-ink/55">
            First episode start time
            <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" />
          </label>
          <button
            disabled={pending || !startsAt}
            onClick={schedule}
            className="inline-flex min-h-11 items-center gap-2 bg-broadcast px-4 text-xs font-black uppercase text-white disabled:opacity-50"
          >
            {pending ? "Scheduling..." : `Schedule ${preview.episodes.length} broadcast(s)`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

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
      <PreparedNarrativeBroadcast />
      <NewMeetingWatchBroadcast />
      <div className="border border-ink/10 bg-white p-5 shadow-panel">
        <div className="flex items-center gap-2">
          <CalendarSearch className="h-5 w-5 text-broadcast" />
          <h2 className="text-2xl font-black">Tracked-conference Meeting Watch (Memory packages)</h2>
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-ink/65">
          Develop four-section packages covering abstracts, exhibition booths,
          attributed conference chatter, and media reporting, from a conference already tracked in the system.
        </p>
        {message ? <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold">{message}</div> : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {conferences.map((conference) => (
          <article key={conference.id} className="border border-ink/10 bg-white p-4 shadow-panel">
            <div className="text-xs font-black uppercase text-broadcast">{conference.acronym ?? "Meeting Watch"}</div>
            <h3 className="mt-1 text-lg font-black">{conference.name}</h3>
            <div className="mt-2 text-xs font-semibold text-ink/55">
              {conference.startDate ?? `${conference.year}-${String(conference.month).padStart(2, "0")}`} {conference.city ? `- ${conference.city}` : ""}
            </div>
            <CardDeckSummary
              deck={cardDecks[conference.id] ?? EMPTY_CARD_DECK}
              entityType="conference"
              entityId={conference.id}
            />
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
