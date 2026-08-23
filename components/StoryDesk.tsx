"use client";

import { CheckCircle2, ChevronDown, LoaderCircle, Sparkles, Youtube } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

type DeliveryStatus = {
  status: string;
  title: string;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  publicReachable: boolean;
  failureReason?: string;
};

function responseError(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const value = (body as { error?: unknown }).error;
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const detail = value as Record<string, unknown>;
    for (const candidate of [detail.message, detail.details, detail.hint]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
  }
  return fallback;
}

function notifyVideoDeveloped(delivery: DeliveryStatus) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const notification = new Notification("ConferenceHype video developed", {
    body: `${delivery.title} is verified public on YouTube. The Story form is ready for the next video.`
  });
  notification.onclick = () => {
    window.focus();
    if (delivery.youtubeUrl) window.open(delivery.youtubeUrl, "_blank", "noopener,noreferrer");
  };
}

function concise(value: string, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  const prefix = normalized.slice(0, max - 1);
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, boundary > max * 0.65 ? boundary : undefined).trim()}…`;
}

function completeHeadline(value: string, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized.replace(/\.{3,}$|…$/g, "").trim();
  const firstCompleteSentence = normalized
    .match(/[^.!?]+[.!?]+/g)
    ?.map((sentence) => sentence.trim())
    .find((sentence) => sentence.length >= 16 && sentence.length <= max);
  if (firstCompleteSentence) return firstCompleteSentence.replace(/[.!?]+$/, "").trim();
  const prefix = normalized.slice(0, max + 1);
  const strongBoundary = Math.max(prefix.lastIndexOf(":"), prefix.lastIndexOf(";"), prefix.lastIndexOf(" — "), prefix.lastIndexOf(" - "));
  const bounded = strongBoundary >= Math.floor(max * 0.6)
    ? prefix.slice(0, strongBoundary)
    : prefix.slice(0, prefix.lastIndexOf(" "));
  return bounded
    .replace(/\b(?:just\s+)?(?:crushed|changed|shocked|stunned|destroyed|blew away)$/i, "")
    .replace(/\b(?:and|or|but|for|with|from|to|the|a|an)$/i, "")
    .replace(/[,:;\-–—\s]+$/, "")
    .trim();
}

function inferTopic(narrative: string) {
  if (/\bASPC\s+2026\b/i.test(narrative)) return "ASPC 2026 Preventive Cardiology Congress";
  const firstSentence = narrative.match(/^.*?[.!?](?:\s|$)/)?.[0] ?? narrative;
  return concise(firstSentence.replace(/[.!?]+$/, ""), 160);
}

function inferTitle(narrative: string, topic: string) {
  if (/\bPREVENT\b/i.test(narrative) && /psoriatic/i.test(narrative)) {
    return "ASPC 2026: PREVENT Risk Scores and Hidden Coronary Calcium";
  }
  return completeHeadline(topic || narrative, 100);
}

export function StoryDesk() {
  const [narrative, setNarrative] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [titleOverride, setTitleOverride] = useState("");
  const [topicOverride, setTopicOverride] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [authors, setAuthors] = useState("");
  const [message, setMessage] = useState("");
  const [broadcastId, setBroadcastId] = useState("");
  const [delivery, setDelivery] = useState<DeliveryStatus | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const savedBroadcastId = window.localStorage.getItem("conferencehype:last-story-broadcast-id");
    if (savedBroadcastId) setBroadcastId(savedBroadcastId);
  }, []);

  const wordCount = narrative.trim() ? narrative.trim().split(/\s+/).length : 0;
  const topic = topicOverride.trim() || inferTopic(narrative);
  const title = completeHeadline(titleOverride.trim() || inferTitle(narrative, topic), 100);
  const thumbnailHeadline = completeHeadline(title, 58);
  const descriptionOpening = topic
    ? `The findings, limitations, and clinical implications from ${topic}, explained in a source-attributed ConferenceHype meeting review.`
    : "";
  const payload = useMemo(() => ({
    title,
    topic,
    sourceUrl,
    sourceName,
    articleTitle: title,
    authors,
    specialty: specialty || "Story",
    descriptionOpening,
    thumbnailHeadline,
    narrative
  }), [authors, descriptionOpening, narrative, sourceName, sourceUrl, specialty, thumbnailHeadline, title, topic]);

  useEffect(() => {
    if (!broadcastId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const response = await fetch(`/api/admin/story/status?broadcastId=${encodeURIComponent(broadcastId)}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(responseError(body, "Could not verify delivery."));
        if (stopped) return;
        setDelivery(body.delivery);
        if (body.delivery.status === "failed") {
          setMessage(`Video delivery failed: ${body.delivery.failureReason ?? "Open the render workflow for details."}`);
          return;
        }
        if (body.delivery.status === "verified" && body.delivery.publicReachable) {
          window.localStorage.removeItem("conferencehype:last-story-broadcast-id");
          setNarrative("");
          setSourceUrl("");
          setTitleOverride("");
          setTopicOverride("");
          setSpecialty("");
          setSourceName("");
          setAuthors("");
          setBroadcastId("");
          setMessage("Video developed and verified public on YouTube. The form is ready for the next video.");
          notifyVideoDeveloped(body.delivery);
          return;
        }
        setMessage(body.delivery.status === "verified"
          ? "Upload finished. Waiting for YouTube to expose the public watch page…"
          : "Developing the video now. This page will verify YouTube automatically when rendering finishes.");
        timer = setTimeout(check, 10_000);
      } catch (error) {
        if (stopped) return;
        setMessage(error instanceof Error ? error.message : "Could not verify delivery.");
        timer = setTimeout(check, 15_000);
      }
    };
    void check();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [broadcastId]);

  const develop = () => startTransition(async () => {
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    setMessage("Validating Claude's narrative and preparing the YouTube video…");
    setDelivery(null);
    setBroadcastId("");
    try {
      const response = await fetch("/api/admin/story/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(responseError(body, "The video did not start. Please review the Story details and try again."));
      const id = body.broadcastId ?? body.broadcast?.id;
      if (!id) throw new Error("The video was accepted but no delivery ID was returned.");
      window.localStorage.setItem("conferencehype:last-story-broadcast-id", id);
      setBroadcastId(id);
      setMessage(body.alreadyExists
        ? "This narrative already exists. Verifying its saved YouTube delivery now…"
        : "Video development started. Rendering, upload, and public YouTube verification will continue automatically.");
    } catch (error) {
      setMessage(`Video generation did not start: ${error instanceof Error ? error.message : "Could not create the Story broadcast."}`);
    }
  });

  const canDevelop = Boolean(sourceUrl && wordCount >= 420 && narrative.length >= 1_200 && title.length >= 8 && topic.length >= 3);
  const working = pending || Boolean(broadcastId && !(delivery?.status === "failed" || (delivery?.status === "verified" && delivery.publicReachable)));

  return (
    <section className="grid gap-5">
      <div className="border-2 border-broadcast/30 bg-white p-5 shadow-panel">
        <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-broadcast" /><h2 className="text-2xl font-black">Create a Story</h2></div>
        <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-ink/65">
          Paste Claude&apos;s completed meeting review and its primary source. One click validates the narrative, creates 12 substantive chapters, develops the title and thumbnail, renders the video, uploads it publicly, and verifies the exact YouTube video ID.
        </p>

        <label className="mt-5 grid gap-1 text-xs font-black uppercase text-ink/55">
          Primary source URL
          <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" className="min-h-12 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" />
        </label>
        <label className="mt-4 grid gap-1 text-xs font-black uppercase text-ink/55">
          Claude narrative
          <textarea value={narrative} onChange={(event) => setNarrative(event.target.value)} rows={22} placeholder="Paste Claude's complete, source-supported meeting review here…" className="w-full border border-ink/20 px-3 py-3 text-sm font-semibold normal-case leading-6 text-ink" />
          <span className={wordCount >= 420 ? "font-semibold normal-case text-emerald-700" : "font-semibold normal-case text-ink/45"}>{wordCount} words · minimum 420</span>
        </label>

        <details className="mt-4 border border-ink/10 bg-paper p-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-black uppercase text-ink/60"><ChevronDown className="h-4 w-4" />Optional title and source overrides</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-black uppercase text-ink/55">YouTube title<input value={titleOverride} maxLength={100} onChange={(event) => setTitleOverride(event.target.value)} placeholder={title || "Developed automatically"} className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" /></label>
            <label className="grid gap-1 text-xs font-black uppercase text-ink/55">Topic<input value={topicOverride} maxLength={160} onChange={(event) => setTopicOverride(event.target.value)} placeholder={topic || "Developed automatically"} className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" /></label>
            <label className="grid gap-1 text-xs font-black uppercase text-ink/55">Specialty, optional<input value={specialty} onChange={(event) => setSpecialty(event.target.value)} placeholder="Leave blank for news Stories" className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" /></label>
            <label className="grid gap-1 text-xs font-black uppercase text-ink/55">Publication or organization<input value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="American Society for Preventive Cardiology" className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" /></label>
            <label className="grid gap-1 text-xs font-black uppercase text-ink/55 md:col-span-2">Authors, optional<input value={authors} onChange={(event) => setAuthors(event.target.value)} placeholder="Names exactly as published" className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" /></label>
          </div>
        </details>

        <button disabled={!canDevelop || working} onClick={develop} className="mt-5 inline-flex min-h-13 w-full items-center justify-center gap-2 bg-broadcast px-5 py-4 text-sm font-black uppercase text-white disabled:opacity-50">
          {working ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Youtube className="h-5 w-5" />}
          {working ? "Developing and verifying YouTube video…" : "Develop and publish YouTube video"}
        </button>

        {message ? <div role="status" aria-live="polite" className={`mt-4 border p-3 text-sm font-bold ${delivery?.status === "verified" && delivery.publicReachable ? "border-emerald-600/30 bg-emerald-50 text-emerald-950" : "border-cyanline/30 bg-cyanline/10"}`}>{message}</div> : null}
        {delivery?.status === "verified" && delivery.publicReachable && delivery.youtubeUrl ? (
          <a href={delivery.youtubeUrl} target="_blank" rel="noreferrer" className="mt-3 flex min-h-12 items-center justify-center gap-2 bg-ink px-4 text-sm font-black uppercase text-white">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />Verified public on YouTube · Watch video
          </a>
        ) : null}
      </div>
    </section>
  );
}
