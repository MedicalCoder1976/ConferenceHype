"use client";

import { CheckCircle2, ListChecks, LoaderCircle, Youtube } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { buildFiveThingsSearchTitle, FIVE_THINGS_SPECIALTIES, fiveThingsItemTitles } from "@/lib/story/fiveThingsConfig";

type DeliveryStatus = { status: string; title: string; youtubeVideoId?: string; youtubeUrl?: string; publicReachable: boolean; failureReason?: string };

function responseError(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const value = (body as { error?: unknown }).error;
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const detail = value as Record<string, unknown>;
    for (const candidate of [detail.message, detail.details, detail.hint]) if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return fallback;
}

const WRITEUP_TEMPLATE = `INTRO:
Briefly explain why these five developments matter today.

1. First searchable clinical topic
What happened:
Key evidence:
Why it matters:
Limitation:
What to watch next:


2. Second searchable clinical topic
What happened:
Key evidence:
Why it matters:
Limitation:
What to watch next:


3. Third searchable clinical topic
What happened:
Key evidence:
Why it matters:
Limitation:
What to watch next:


4. Fourth searchable clinical topic
What happened:
Key evidence:
Why it matters:
Limitation:
What to watch next:


5. Fifth searchable clinical topic
What happened:
Key evidence:
Why it matters:
Limitation:
What to watch next:
`;

export function FiveThingsDesk() {
  const specialtyField = useRef<HTMLSelectElement>(null);
  const [specialty, setSpecialty] = useState<(typeof FIVE_THINGS_SPECIALTIES)[number]>("Cardiology");
  const [writeup, setWriteup] = useState("");
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [publishAt, setPublishAt] = useState("");
  const [message, setMessage] = useState("");
  const [broadcastId, setBroadcastId] = useState("");
  const [delivery, setDelivery] = useState<DeliveryStatus | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [pending, startTransition] = useTransition();
  const titles = useMemo(() => fiveThingsItemTitles(writeup), [writeup]);
  const searchTitle = buildFiveThingsSearchTitle(specialty, titles);
  const title = titleOverride ?? searchTitle;
  const wordCount = writeup.trim() ? writeup.trim().split(/\s+/).length : 0;
  const sourceCount = new Set(writeup.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []).size;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("conferencehype:five-things-draft");
      if (raw) {
        const draft = JSON.parse(raw);
        if (FIVE_THINGS_SPECIALTIES.includes(draft.specialty)) setSpecialty(draft.specialty);
        if (typeof draft.writeup === "string") setWriteup(draft.writeup);
        if (typeof draft.titleOverride === "string") setTitleOverride(draft.titleOverride);
        if (typeof draft.publishAt === "string") setPublishAt(draft.publishAt);
      }
    } catch { /* A damaged draft must not prevent opening the form. */ }
    setDraftLoaded(true);
    const saved = window.localStorage.getItem("conferencehype:last-five-things-broadcast-id");
    if (saved) setBroadcastId(saved);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    try {
      if (!writeup && titleOverride === null && !publishAt) {
        window.localStorage.removeItem("conferencehype:five-things-draft");
      } else {
        window.localStorage.setItem("conferencehype:five-things-draft", JSON.stringify({ specialty, writeup, titleOverride, publishAt }));
      }
    } catch {
      setMessage("Your browser could not save this draft. Copy the write-up and edited title before refreshing.");
    }
  }, [draftLoaded, specialty, writeup, titleOverride, publishAt]);

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
          window.localStorage.removeItem("conferencehype:last-five-things-broadcast-id");
          setSpecialty("Cardiology");
          setWriteup("");
          setTitleOverride(null);
          setPublishAt("");
          setBroadcastId("");
          setMessage("5 Things to Know was verified public on YouTube. The form is ready for the next specialty briefing.");
          specialtyField.current?.focus({ preventScroll: true });
          specialtyField.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        setMessage(body.delivery.status === "verified" ? "Upload finished. Waiting for the public YouTube watch page…" : "Developing the video now. This page will verify YouTube automatically when rendering finishes.");
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
    setMessage("Validating exactly five items and preparing the search-focused YouTube video…");
    setDelivery(null);
    try {
      const response = await fetch("/api/admin/five-things/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ specialty, writeup, title: title.trim(), startsAt: publishAt ? new Date(publishAt).toISOString() : undefined }) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(responseError(body, "The video did not start."));
      const id = body.broadcastId ?? body.broadcast?.id;
      if (!id) throw new Error("The video was accepted but no delivery ID was returned.");
      window.localStorage.setItem("conferencehype:last-five-things-broadcast-id", id);
      setBroadcastId(id);
      setMessage(body.alreadyExists ? "This write-up already exists. Verifying its saved YouTube delivery now…" : `Video development started with the title: ${body.title}`);
    } catch (error) {
      setMessage(`Video generation did not start: ${error instanceof Error ? error.message : "Could not create the specialty briefing."}`);
    }
  });

  const canDevelop = titles.length === 5 && wordCount >= 400 && writeup.length >= 1_500 && title.trim().length > 0 && title.trim().length <= 100;
  const working = pending || Boolean(broadcastId && !(delivery?.status === "failed" || (delivery?.status === "verified" && delivery.publicReachable)));

  return <section className="grid gap-5">
    <div className="border-2 border-broadcast/30 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-broadcast" /><h2 className="text-2xl font-black">5 Things to Know</h2></div>
      <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-ink/65">Paste a completed Claude or Grok write-up with exactly five numbered items. Source URLs are optional. ConferenceHype preserves the supplied evidence, develops one search-focused title and one fixed thumbnail, renders the narration, publishes it, and verifies the public YouTube video.</p>
      <label className="mt-5 grid gap-1 text-xs font-black uppercase text-ink/55">Specialty
        <select ref={specialtyField} value={specialty} onChange={(event) => setSpecialty(event.target.value as (typeof FIVE_THINGS_SPECIALTIES)[number])} className="min-h-12 border border-ink/20 bg-white px-3 text-sm font-semibold normal-case text-ink">
          {FIVE_THINGS_SPECIALTIES.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label className="mt-4 grid gap-1 text-xs font-black uppercase text-ink/55">Claude or Grok write-up
        <textarea value={writeup} onChange={(event) => setWriteup(event.target.value)} rows={28} placeholder={WRITEUP_TEMPLATE} className="w-full border border-ink/20 px-3 py-3 text-sm font-semibold normal-case leading-6 text-ink" />
      </label>
      <label className="mt-4 grid gap-1 text-xs font-black uppercase text-ink/55">YouTube release time, optional
        <input type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} className="min-h-12 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" />
        <span className="font-semibold normal-case text-ink/45">Leave blank to publish when rendering completes. Set one daily release time to upload now and release later.</span>
      </label>
      <div className="mt-2 grid gap-2 text-xs font-bold text-ink/60 sm:grid-cols-3">
        <span className={titles.length === 5 ? "text-emerald-700" : ""}>{titles.length}/5 numbered items</span>
        <span>{sourceCount} optional source URLs</span>
        <span className={wordCount >= 400 ? "text-emerald-700" : ""}>{wordCount} words · minimum 400</span>
      </div>
      <div className="mt-4 border border-cyanline/25 bg-cyanline/10 p-3">
        <label className="grid gap-1 text-xs font-black uppercase text-ink/55">Search-focused YouTube title
          <input value={title} onChange={(event) => setTitleOverride(event.target.value)} disabled={working} maxLength={100} className="min-h-12 w-full border border-ink/20 bg-white px-3 text-sm font-semibold normal-case text-ink" />
        </label>
        <div className="mt-1 flex items-center justify-between gap-3 text-xs font-semibold text-ink/55">
          <span>{title.length}/100 characters · Edit before publishing.</span>
          <button type="button" disabled={working || titleOverride === null} onClick={() => setTitleOverride(null)} className="underline disabled:opacity-50">Use suggested title</button>
        </div>
        <div className="mt-3 text-xs font-black uppercase text-ink/55">Topics · {specialty}</div>
        {titles.length ? <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm font-semibold text-ink">{titles.map((topic, index) => <li key={index}>{topic}</li>)}</ol> : <p className="mt-1 text-sm text-ink/55">The five item topics will appear here after you paste the write-up.</p>}
        <div className="mt-1 text-xs font-semibold text-ink/50">Thumbnail and first slide: full title above · first three item topics.</div>
      </div>
      <button disabled={!canDevelop || working} onClick={develop} className="mt-5 inline-flex min-h-13 w-full items-center justify-center gap-2 bg-broadcast px-5 py-4 text-sm font-black uppercase text-white disabled:opacity-50">
        {working ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Youtube className="h-5 w-5" />}{working ? "Developing and verifying YouTube video…" : "Develop and publish 5 Things to Know"}
      </button>
      {message ? <div role="status" aria-live="polite" className={`mt-4 border p-3 text-sm font-bold ${delivery?.status === "verified" && delivery.publicReachable ? "border-emerald-600/30 bg-emerald-50 text-emerald-950" : "border-cyanline/30 bg-cyanline/10"}`}>{message}</div> : null}
      {delivery?.status === "verified" && delivery.publicReachable && delivery.youtubeUrl ? <a href={delivery.youtubeUrl} target="_blank" rel="noreferrer" className="mt-3 flex min-h-12 items-center justify-center gap-2 bg-ink px-4 text-sm font-black uppercase text-white"><CheckCircle2 className="h-5 w-5 text-emerald-400" />Verified public on YouTube · Watch video</a> : null}
    </div>
  </section>;
}
