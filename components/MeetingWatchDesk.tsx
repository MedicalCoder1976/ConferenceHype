"use client";

import { CalendarSearch, Radio, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
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
export function PreparedNarrativeBroadcast() {
  const [raw, setRaw] = useState("");
  const [title, setTitle] = useState("");
  const [thumbnailStatement, setThumbnailStatement] = useState("");
  const [packagingStatus, setPackagingStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [packagingMessage, setPackagingMessage] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setTitle("");
    setThumbnailStatement("");
    setPackagingMessage("");
    if (raw.trim().length < 2000) {
      setPackagingStatus("idle");
      return;
    }
    setPackagingStatus("loading");
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/admin/meeting-watch/prepared/preview", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw }),
          signal: controller.signal
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not generate the video packaging.");
        setTitle(payload.package.program.title);
        setThumbnailStatement(payload.package.program.thumbnail_headline);
        setPackagingStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setPackagingStatus("error");
        setPackagingMessage(error instanceof Error ? error.message : "Could not generate the video packaging.");
      }
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [raw]);

  const packagingValid = packagingStatus === "ready" && title.trim().length >= 10 && title.length <= 150 && thumbnailStatement.trim().length >= 8 && thumbnailStatement.length <= 120;
  const publish = () => startTransition(async () => {
    setMessage("");
    try {
      const response = await fetch("/api/admin/meeting-watch/prepared/publish", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw, title, thumbnailStatement }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not develop and publish this broadcast.");
      setRaw("");
      setMessage(payload.alreadyExists ? "This exact narrative already exists; no duplicate was dispatched." : `Video development started: ${payload.cardCount} abstracts, ${Math.round(payload.durationSeconds / 60)} estimated minutes, and ${payload.speakerTurnCount} narrated sections.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not develop and publish this broadcast."); }
  });
  return <div className="border-2 border-broadcast/30 bg-white p-5 shadow-panel">
    <div className="flex items-center gap-2"><WandSparkles className="h-5 w-5 text-broadcast" /><h2 className="text-2xl font-black">Meeting Watch: Complete Narrative</h2></div>
    <p className="mt-2 text-sm font-semibold leading-6 text-ink/65">Paste Claude or Grok&apos;s complete beginning-to-end narrative for 5-10 source-grounded abstracts. The first words are its concise meeting-and-pharma hook. ConferenceHype narrates the supplied text in order, inserts 16-second speech-free music transitions, and rejects anything estimated beyond 10 minutes.</p>
    <details className="mt-4 border border-ink/15 bg-paper p-3"><summary className="cursor-pointer text-xs font-black uppercase">Copy Claude or Grok instructions and output format</summary><p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6">{MEETING_WATCH_CLAUDE_INSTRUCTIONS}</p><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap border border-ink/10 bg-white p-3 text-xs">{MEETING_WATCH_CLAUDE_OUTPUT_FORMAT}</pre></details>
    <textarea value={raw} onChange={(event) => setRaw(event.target.value)} rows={14} placeholder='Paste JSON beginning with { "schema_version": "conferencehype_meeting_watch_full_narrative_v3" ...' className="mt-4 w-full border border-ink/20 px-3 py-3 font-mono text-xs text-ink" />
    <div className="mt-3 border-2 border-cyanline/30 bg-cyanline/5 p-4">
      <div className="text-sm font-black">Video headline and thumbnail</div>
      <p className="mt-1 text-xs font-semibold leading-5 text-ink/60">These are generated automatically from the pasted narrative. Edit them for maximum impact before publishing while keeping every claim source-grounded.</p>
      <div className="mt-3 grid gap-3">
        <label className="grid gap-1 text-xs font-black uppercase text-ink/60">
          YouTube headline
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={150} disabled={packagingStatus !== "ready"} placeholder={packagingStatus === "loading" ? "Generating headline..." : "Paste valid JSON to generate the headline"} className="min-h-12 border border-ink/20 bg-white px-3 text-sm font-bold normal-case text-ink disabled:bg-paper" />
          <span className="text-right text-[11px] normal-case text-ink/50">{title.length}/150 characters</span>
        </label>
        <label className="grid gap-1 text-xs font-black uppercase text-ink/60">
          Thumbnail writeup
          <textarea value={thumbnailStatement} onChange={(event) => setThumbnailStatement(event.target.value)} maxLength={120} disabled={packagingStatus !== "ready"} rows={2} placeholder={packagingStatus === "loading" ? "Generating thumbnail copy..." : "Paste valid JSON to generate the thumbnail copy"} className="border border-ink/20 bg-white px-3 py-3 text-sm font-black normal-case text-ink disabled:bg-paper" />
          <span className="text-right text-[11px] normal-case text-ink/50">{thumbnailStatement.length}/120 characters</span>
        </label>
      </div>
      {packagingMessage ? <div className="mt-2 text-xs font-bold text-broadcast">{packagingMessage}</div> : null}
    </div>
    <div className="mt-3 flex flex-wrap gap-3"><button disabled={pending || !packagingValid} onClick={publish} className="min-h-11 bg-broadcast px-4 text-xs font-black uppercase text-white disabled:opacity-50">{pending ? "Developing video..." : "Develop and publish YouTube video"}</button></div>
    {message ? <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold">{message}</div> : null}
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
        payload.episodes.map((episode: PreviewEpisode) => ({
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
