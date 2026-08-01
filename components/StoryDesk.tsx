"use client";

import { BookOpenCheck, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

type StoryPreview = {
  title: string;
  topic: string;
  spokenWords: number;
  durationMinutes: number;
  cards: Array<{ position: number; title: string; script: string }>;
};

export function StoryDesk() {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [narrative, setNarrative] = useState("");
  const [preview, setPreview] = useState<StoryPreview | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const payload = { title, topic, sourceUrl, narrative };

  const previewStory = () => startTransition(async () => {
    setMessage("");
    setPreview(null);
    try {
      const response = await fetch("/api/admin/story/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Could not preview the story.");
      setPreview(body);
      setMessage("Validated. Review all 12 story cards before approving the broadcast.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not preview the story.");
    }
  });

  const publishStory = () => startTransition(async () => {
    try {
      const response = await fetch("/api/admin/story/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Could not publish the story.");
      setMessage(body.alreadyExists ? "This exact story already exists; no duplicate was dispatched." : `Story render started: ${body.cardCount} narrative cards, about ${Math.round(body.durationSeconds / 60)} minutes.`);
      if (!body.alreadyExists) {
        setTitle("");
        setTopic("");
        setSourceUrl("");
        setNarrative("");
        setPreview(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not publish the story.");
    }
  });

  return (
    <section className="grid gap-5">
      <div className="border-2 border-broadcast/30 bg-white p-5 shadow-panel">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-broadcast" />
          <h2 className="text-2xl font-black">Create a Story</h2>
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-ink/65">
          Ask Claude to write a source-grounded narrative about your topic, then paste the finished prose here. ConferenceHype does not call an AI model in this step, so the in-app generation cost is zero. We divide the prose into 12 narrated story cards and use the existing verified YouTube broadcast pipeline.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-black uppercase text-ink/55">
            YouTube title
            <input value={title} maxLength={100} onChange={(event) => { setTitle(event.target.value); setPreview(null); }} placeholder="The story viewers should open" className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" />
          </label>
          <label className="grid gap-1 text-xs font-black uppercase text-ink/55">
            Topic
            <input value={topic} onChange={(event) => { setTopic(event.target.value); setPreview(null); }} placeholder="e.g. How GLP-1 medicines changed obesity care" className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" />
          </label>
        </div>
        <label className="mt-3 grid gap-1 text-xs font-black uppercase text-ink/55">
          Primary source URL
          <input value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); setPreview(null); }} placeholder="https://..." className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" />
        </label>
        <label className="mt-3 grid gap-1 text-xs font-black uppercase text-ink/55">
          Claude narrative
          <textarea value={narrative} onChange={(event) => { setNarrative(event.target.value); setPreview(null); }} rows={18} placeholder="Paste at least 420 spoken words of finished narrative prose..." className="w-full border border-ink/20 px-3 py-3 text-sm font-semibold normal-case leading-6 text-ink" />
        </label>
        <div className="mt-3 flex flex-wrap gap-3">
          <button disabled={pending || !title || !topic || !sourceUrl || narrative.length < 1200} onClick={previewStory} className="inline-flex min-h-11 items-center gap-2 bg-ink px-4 text-xs font-black uppercase text-white disabled:opacity-50">
            <BookOpenCheck className="h-4 w-4" />
            {pending ? "Checking..." : "Validate and preview"}
          </button>
          {preview ? <button disabled={pending} onClick={publishStory} className="min-h-11 bg-broadcast px-4 text-xs font-black uppercase text-white disabled:opacity-50">Approve, narrate and upload</button> : null}
        </div>
        {message ? <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold">{message}</div> : null}
      </div>
      {preview ? (
        <div className="border border-ink/10 bg-white p-5 shadow-panel">
          <h3 className="text-xl font-black">{preview.title}</h3>
          <div className="mt-2 grid gap-2 text-sm font-semibold md:grid-cols-3">
            <div><b>Topic:</b> {preview.topic}</div>
            <div><b>Spoken words:</b> {preview.spokenWords}</div>
            <div><b>Estimated video:</b> {preview.durationMinutes} min</div>
          </div>
          <div className="mt-4 grid gap-3">
            {preview.cards.map((card) => <article key={card.position} className="border border-ink/10 p-3"><div className="text-xs font-black uppercase text-broadcast">Story card {card.position}</div><div className="mt-1 font-black">{card.title}</div><p className="mt-2 text-sm font-semibold leading-6 text-ink/70">{card.script}</p></article>)}
          </div>
        </div>
      ) : null}
    </section>
  );
}
