"use client";

import { useState, type FormEvent } from "react";
import { BookOpenText } from "lucide-react";

type CreatedPaper = { title: string; diseaseType: string; journal: string; targetAt: string; dispatched: boolean };

export function BreakingPaperDesk() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [placement, setPlacement] = useState<"top" | "bottom">("top");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [created, setCreated] = useState<CreatedPaper | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("Reading the paper and preparing a source-grounded broadcast…"); setCreated(null);
    try {
      const response = await fetch("/api/admin/breaking-paper", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceUrl, placement }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Could not create the breaking-paper broadcast.");
      setCreated(result.paper);
      setMessage(result.paper.dispatched ? "Breaking-paper broadcast accepted. GitHub is rendering and uploading it to YouTube." : result.dispatch?.error ?? "The paper was saved, but the YouTube render was not dispatched.");
      setSourceUrl("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create the breaking-paper broadcast."); }
    finally { setBusy(false); }
  }

  return <section className="grid gap-5 border border-ink/15 bg-white p-5 shadow-panel">
    <div className="flex items-start gap-3"><BookOpenText className="mt-1 h-6 w-6 text-broadcast" /><div>
      <div className="text-xs font-black uppercase text-broadcast">Physician Education</div><h2 className="text-2xl font-black text-ink">Breaking Paper broadcast</h2>
      <p className="mt-2 max-w-3xl text-sm font-semibold text-ink/65">Paste an important PubMed or publisher paper link. ConferenceHype will use the page&apos;s title and abstract to prepare a focused, source-grounded broadcast without a paid AI call.</p>
    </div></div>
    <form className="grid gap-3" onSubmit={submit}>
      <label className="grid gap-1 text-xs font-black uppercase text-ink/70">Important paper link<input required type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://pubmed.ncbi.nlm.nih.gov/…" className="min-h-12 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" /></label>
      <label className="grid max-w-md gap-1 text-xs font-black uppercase text-ink/70">YouTube broadcast placement<select value={placement} onChange={(event) => setPlacement(event.target.value as "top" | "bottom")} className="min-h-12 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink"><option value="top">Top of the next hour (:00)</option><option value="bottom">Bottom of the next hour (:30)</option></select></label>
      <button disabled={busy} className="w-fit bg-broadcast px-5 py-3 text-xs font-black uppercase text-white disabled:opacity-50">{busy ? "Preparing paper broadcast…" : "Create breaking-paper YouTube broadcast"}</button>
    </form>
    {created ? <article className="border border-mint/40 bg-paper p-4"><div className="text-xs font-black uppercase text-broadcast">Physician Education: Breaking Paper</div><div className="mt-2 text-lg font-black text-ink">{created.diseaseType}</div><div className="mt-1 text-base font-bold text-ink">{created.title}</div><div className="mt-2 text-xs font-semibold text-ink/60">{created.journal} · scheduled {new Date(created.targetAt).toLocaleString()}</div></article> : null}
    {message ? <p role="status" className="border border-ink/10 bg-paper p-3 text-sm font-bold text-ink">{message}</p> : null}
  </section>;
}
