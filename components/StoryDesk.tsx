"use client";

import Image from "next/image";
import { BookOpenCheck, CalendarClock, CheckCircle2, ImageIcon, Sparkles, Youtube } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

type StoryPreview = {
  title: string;
  topic: string;
  spokenWords: number;
  durationMinutes: number;
  cards: Array<{ position: number; title: string; script: string }>;
};

function concise(value: string, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  const prefix = normalized.slice(0, max - 1);
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, boundary > max * 0.65 ? boundary : undefined).trim()}…`;
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => concise(value, 100)).filter((value) => value.length >= 8))];
}

export function StoryDesk() {
  const [topic, setTopic] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [narrative, setNarrative] = useState("");
  const [title, setTitle] = useState("");
  const [descriptionOpening, setDescriptionOpening] = useState("");
  const [thumbnailHeadline, setThumbnailHeadline] = useState("");
  const [releaseMode, setReleaseMode] = useState<"now" | "schedule">("now");
  const [startsAt, setStartsAt] = useState("");
  const [preview, setPreview] = useState<StoryPreview | null>(null);
  const [approvedPackaging, setApprovedPackaging] = useState(false);
  const [approvedCards, setApprovedCards] = useState(false);
  const [approvedSource, setApprovedSource] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const invalidate = () => {
    setPreview(null);
    setApprovedPackaging(false);
    setApprovedCards(false);
    setApprovedSource(false);
  };

  const titleOptions = useMemo(() => unique([
    articleTitle ? `${topic}: What ${concise(articleTitle, 58)} Reveals` : "",
    topic ? `${topic}: The Evidence and the Story Behind It` : "",
    topic ? `How ${topic} Changed — and What Comes Next` : ""
  ]), [articleTitle, topic]);

  const thumbnailOptions = useMemo(() => unique([
    topic ? `What Changed in ${topic}?` : "",
    topic ? `${topic}: What the Evidence Shows` : "",
    topic ? `The Story Behind ${topic}` : ""
  ]).map((value) => concise(value, 58)), [topic]);

  const resolvedDescription = descriptionOpening.trim() || (topic
    ? `The evidence, people, and turning points behind ${topic}, explained in a source-attributed ConferenceHype narrative.`
    : "");
  const resolvedTitle = title.trim() || titleOptions[0] || "";
  const resolvedThumbnail = thumbnailHeadline.trim() || thumbnailOptions[0] || "";
  const scheduleIso = releaseMode === "schedule" && startsAt ? new Date(startsAt).toISOString() : undefined;
  const payload = {
    title: resolvedTitle,
    topic,
    sourceUrl,
    sourceName,
    articleTitle,
    authors,
    specialty: specialty || "Story",
    descriptionOpening: resolvedDescription,
    thumbnailHeadline: resolvedThumbnail,
    startsAt: scheduleIso,
    narrative
  };

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
      setTitle(resolvedTitle);
      setThumbnailHeadline(resolvedThumbnail);
      setDescriptionOpening(resolvedDescription);
      setPreview(body);
      setMessage("Validated. Select the final packaging, then review all 12 story chapters before approving the broadcast.");
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
      setMessage(body.alreadyExists
        ? "This exact story already exists; no duplicate was dispatched."
        : releaseMode === "schedule"
          ? `Story render started. YouTube publication is scheduled for ${new Date(scheduleIso!).toLocaleString()}.`
          : `Story render started: ${body.cardCount} narrative cards, about ${Math.round(body.durationSeconds / 60)} minutes.`);
      if (!body.alreadyExists) {
        setTopic(""); setSourceUrl(""); setSourceName(""); setArticleTitle(""); setAuthors(""); setSpecialty("");
        setNarrative(""); setTitle(""); setDescriptionOpening(""); setThumbnailHeadline(""); setStartsAt(""); setPreview(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not publish the story.");
    }
  });

  const canPreview = Boolean(topic && sourceUrl && resolvedTitle && resolvedThumbnail && resolvedDescription.length >= 40 && narrative.length >= 1200 && (releaseMode === "now" || startsAt));
  const canPublish = Boolean(preview && approvedPackaging && approvedCards && approvedSource);

  return (
    <section className="grid gap-5">
      <div className="border-2 border-broadcast/30 bg-white p-5 shadow-panel">
        <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-broadcast" /><h2 className="text-2xl font-black">Create a Story Video Package</h2></div>
        <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-ink/65">
          Paste Claude&apos;s finished evidence narrative. ConferenceHype turns it into 12 narrated chapters, a searchable YouTube package, a story-specific thumbnail, and a scheduled or immediate video upload. No additional AI call is made here.
        </p>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="grid gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-wide text-broadcast">1 · Story and source</div>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-xs font-black uppercase text-ink/55">Story topic<input value={topic} onChange={(event) => { setTopic(event.target.value); invalidate(); }} placeholder="How GLP-1 medicines changed obesity care" className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" /></label>
                <label className="grid gap-1 text-xs font-black uppercase text-ink/55">Specialty<input value={specialty} onChange={(event) => { setSpecialty(event.target.value); invalidate(); }} placeholder="Endocrinology" className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" /></label>
                <label className="grid gap-1 text-xs font-black uppercase text-ink/55">Publication or source<input value={sourceName} onChange={(event) => { setSourceName(event.target.value); invalidate(); }} placeholder="Journal, institution, or report" className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" /></label>
                <label className="grid gap-1 text-xs font-black uppercase text-ink/55">Authors, optional<input value={authors} onChange={(event) => { setAuthors(event.target.value); invalidate(); }} placeholder="Names exactly as published" className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" /></label>
              </div>
              <label className="mt-3 grid gap-1 text-xs font-black uppercase text-ink/55">Article or report title<input value={articleTitle} onChange={(event) => { setArticleTitle(event.target.value); invalidate(); }} placeholder="Exact source title" className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" /></label>
              <label className="mt-3 grid gap-1 text-xs font-black uppercase text-ink/55">Primary source URL<input value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); invalidate(); }} placeholder="https://..." className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" /></label>
            </div>

            <div>
              <div className="text-xs font-black uppercase tracking-wide text-broadcast">2 · Claude narrative</div>
              <label className="mt-2 grid gap-1 text-xs font-black uppercase text-ink/55">Finished narrative<textarea value={narrative} onChange={(event) => { setNarrative(event.target.value); invalidate(); }} rows={18} placeholder="Paste at least 420 spoken words of finished, source-supported narrative prose..." className="w-full border border-ink/20 px-3 py-3 text-sm font-semibold normal-case leading-6 text-ink" /></label>
              <div className="mt-1 text-xs font-semibold text-ink/45">{narrative.trim() ? narrative.trim().split(/\s+/).length : 0} words · minimum 420 spoken words and 12 substantive chapters</div>
            </div>

            <div>
              <div className="text-xs font-black uppercase tracking-wide text-broadcast">3 · Title and discovery</div>
              <div className="mt-2 grid gap-2">
                {titleOptions.map((option, index) => <label key={option} className="flex cursor-pointer gap-3 border border-ink/10 p-3"><input type="radio" name="story-title" checked={resolvedTitle === option} onChange={() => { setTitle(option); invalidate(); }} /><span><b className="block text-xs uppercase text-broadcast">{index === 0 ? "Search-led" : index === 1 ? "Evidence-led" : "Story-led"}</b><span className="text-sm font-bold">{option}</span></span></label>)}
                <label className="grid gap-1 text-xs font-black uppercase text-ink/55">Custom YouTube title<input value={title} maxLength={100} onChange={(event) => { setTitle(event.target.value); invalidate(); }} placeholder={titleOptions[0] || "Lead with the topic viewers will search"} className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" /><span className="text-right font-semibold normal-case">{resolvedTitle.length}/100</span></label>
                <label className="grid gap-1 text-xs font-black uppercase text-ink/55">Description opening<textarea value={descriptionOpening} maxLength={500} onChange={(event) => { setDescriptionOpening(event.target.value); invalidate(); }} rows={3} placeholder={resolvedDescription} className="border border-ink/20 px-3 py-2 text-sm font-semibold normal-case text-ink" /><span className="font-semibold normal-case text-ink/45">The first lines viewers see before “Show more.” Chapters are added from real render timing.</span></label>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-broadcast"><ImageIcon className="h-4 w-4" />4 · Thumbnail</div>
              <div className="mt-2 grid gap-3 md:grid-cols-3">
                {thumbnailOptions.map((option) => {
                  const query = new URLSearchParams({ tier: "roundup", specialty: specialty || "STORY", headline: option, topicLabel: concise(topic, 48), panelLabel: "CONFERENCEHYPE STORY", seriesLabel: "THE STORY BEHIND THE EVIDENCE", promiseLabel: "WHY THIS STORY MATTERS" });
                  return <label key={option} className={`cursor-pointer border-2 p-2 ${resolvedThumbnail === option ? "border-broadcast" : "border-ink/10"}`}><input className="sr-only" type="radio" name="story-thumbnail" checked={resolvedThumbnail === option} onChange={() => { setThumbnailHeadline(option); invalidate(); }} /><Image unoptimized src={`/api/youtube-thumbnail?${query}`} width={1280} height={720} alt={`Thumbnail option: ${option}`} className="h-auto w-full" /><span className="mt-2 block text-xs font-black">{option}</span></label>;
                })}
              </div>
              <label className="mt-3 grid gap-1 text-xs font-black uppercase text-ink/55">Custom thumbnail headline<input value={thumbnailHeadline} maxLength={58} onChange={(event) => { setThumbnailHeadline(event.target.value); invalidate(); }} placeholder={thumbnailOptions[0] || "Short, truthful, mobile-readable hook"} className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" /></label>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-broadcast"><CalendarClock className="h-4 w-4" />5 · Release</div>
              <div className="mt-2 flex flex-wrap gap-3">
                <label className="flex min-h-11 items-center gap-2 border border-ink/20 px-3 text-sm font-bold"><input type="radio" checked={releaseMode === "now"} onChange={() => { setReleaseMode("now"); invalidate(); }} />Publish after render</label>
                <label className="flex min-h-11 items-center gap-2 border border-ink/20 px-3 text-sm font-bold"><input type="radio" checked={releaseMode === "schedule"} onChange={() => { setReleaseMode("schedule"); invalidate(); }} />Schedule on YouTube</label>
              </div>
              {releaseMode === "schedule" ? <label className="mt-3 grid gap-1 text-xs font-black uppercase text-ink/55">Publication date and time<input type="datetime-local" value={startsAt} onChange={(event) => { setStartsAt(event.target.value); invalidate(); }} className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" /></label> : null}
            </div>

            <button disabled={pending || !canPreview} onClick={previewStory} className="inline-flex min-h-12 items-center justify-center gap-2 bg-ink px-5 text-xs font-black uppercase text-white disabled:opacity-50"><BookOpenCheck className="h-4 w-4" />{pending ? "Checking..." : "Validate and build video preview"}</button>
            {message ? <div className="border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold">{message}</div> : null}
          </div>

          <aside className="h-fit border border-ink/10 bg-paper p-4 lg:sticky lg:top-4">
            <div className="text-xs font-black uppercase text-broadcast">Video readiness</div>
            <div className="mt-3 grid gap-2 text-sm font-bold">
              {[['Source', Boolean(sourceUrl)], ['Narrative', narrative.length >= 1200], ['Title', Boolean(resolvedTitle)], ['Thumbnail', Boolean(resolvedThumbnail)], ['Description', resolvedDescription.length >= 40], ['12 chapters', Boolean(preview?.cards.length === 12)], ['Release', releaseMode === 'now' || Boolean(startsAt)]].map(([label, ready]) => <div key={String(label)} className="flex items-center justify-between"><span>{label}</span><span className={ready ? "text-emerald-700" : "text-ink/35"}>{ready ? "Ready" : "Needed"}</span></div>)}
            </div>
            <div className="mt-4 border-t border-ink/10 pt-4 text-xs font-semibold leading-5 text-ink/55">Story narration uses Kokoro at 1.05x. Viewer-facing output uses ConferenceHype and the story topic; “Physician Education” is prohibited.</div>
          </aside>
        </div>
      </div>

      {preview ? <div className="border border-ink/10 bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-black uppercase text-broadcast">Validated video package</div><h3 className="mt-1 text-xl font-black">{preview.title}</h3></div><div className="text-sm font-semibold text-ink/60">{preview.spokenWords} words · {preview.durationMinutes} minutes · {preview.cards.length} chapters</div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">{preview.cards.map((card) => <article key={card.position} className="border border-ink/10 p-3"><div className="text-xs font-black uppercase text-broadcast">Chapter {card.position}</div><div className="mt-1 font-black">{card.title}</div><p className="mt-2 text-sm font-semibold leading-6 text-ink/70">{card.script}</p></article>)}</div>
        <div className="mt-5 grid gap-2 border-t border-ink/10 pt-5 text-sm font-bold">
          <label className="flex gap-2"><input type="checkbox" checked={approvedSource} onChange={(event) => setApprovedSource(event.target.checked)} />I verified the narrative and visible claims against the primary source.</label>
          <label className="flex gap-2"><input type="checkbox" checked={approvedPackaging} onChange={(event) => setApprovedPackaging(event.target.checked)} />The selected title and thumbnail accurately represent the video.</label>
          <label className="flex gap-2"><input type="checkbox" checked={approvedCards} onChange={(event) => setApprovedCards(event.target.checked)} />I reviewed all 12 substantive chapters and the closing.</label>
        </div>
        <button disabled={pending || !canPublish} onClick={publishStory} className="mt-4 inline-flex min-h-12 items-center gap-2 bg-broadcast px-5 text-xs font-black uppercase text-white disabled:opacity-50"><Youtube className="h-4 w-4" />{pending ? "Starting render..." : releaseMode === "schedule" ? "Approve, render and schedule" : "Approve, render and upload"}</button>
        {canPublish ? <div className="mt-2 flex items-center gap-2 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />All release checks are complete.</div> : null}
      </div> : null}
    </section>
  );
}
