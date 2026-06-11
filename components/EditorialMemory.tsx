"use client";

import { Clock3, Library } from "lucide-react";
import { useState, useTransition } from "react";
import type { EditorialPackage } from "@/lib/types";

export function EditorialMemory({ initialPackages }: { initialPackages: EditorialPackage[] }) {
  const [packages, setPackages] = useState(initialPackages);
  const [startsAt, setStartsAt] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const schedule = (editorialPackage: EditorialPackage) => startTransition(async () => {
    try {
      const localStart = startsAt[editorialPackage.id];
      if (!localStart) throw new Error("Choose a broadcast start time.");
      const response = await fetch("/api/admin/editorial-packages/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: editorialPackage.id,
          startsAt: new Date(localStart).toISOString()
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not schedule package.");
      setPackages((current) => current.map((item) => item.id === editorialPackage.id ? payload.editorialPackage : item));
      setMessage(`${editorialPackage.title} added as ${payload.segmentCount} broadcast cards.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not schedule package.");
    }
  });

  return (
    <section className="grid gap-5">
      <div className="border border-ink/10 bg-white p-5 shadow-panel">
        <div className="flex items-center gap-2"><Library className="h-5 w-5 text-broadcast" /><h2 className="text-2xl font-black">Editorial Memory</h2></div>
        <p className="mt-2 text-sm font-semibold text-ink/65">Review developed Journal Watch and Meeting Watch programs before scheduling.</p>
        {message ? <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold">{message}</div> : null}
      </div>
      {packages.length === 0 ? <div className="border border-dashed border-ink/20 bg-white p-6 font-bold text-ink/60">No programs developed yet.</div> : null}
      {packages.map((editorialPackage) => (
        <article key={editorialPackage.id} className="border border-ink/10 bg-white p-5 shadow-panel">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-broadcast px-3 py-1 text-xs font-black uppercase text-white">{editorialPackage.category.replace("_", " ")}</span>
            <span className="border border-ink/15 px-3 py-1 text-xs font-black uppercase">{editorialPackage.status}</span>
          </div>
          <h3 className="mt-3 text-xl font-black">{editorialPackage.title}</h3>
          <p className="mt-2 text-sm font-semibold text-ink/65">{editorialPackage.introScript}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {editorialPackage.sections.map((section) => (
              <details key={section.title} className="border border-ink/10 p-3">
                <summary className="cursor-pointer font-black">{section.title} ({section.cards.length} cards)</summary>
                <div className="mt-3 grid gap-2">
                  {section.cards.map((card, index) => <div key={`${card.title}-${index}`} className="border-l-2 border-cyanline pl-3 text-sm"><div className="font-black">{card.title}</div><div className="mt-1 text-ink/65">{card.script}</div></div>)}
                </div>
              </details>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs font-black uppercase text-ink/60">
              Broadcast start
              <input type="datetime-local" value={startsAt[editorialPackage.id] ?? ""} onChange={(event) => setStartsAt((current) => ({ ...current, [editorialPackage.id]: event.target.value }))} className="border border-ink/20 px-3 py-2 text-sm font-semibold normal-case text-ink" />
            </label>
            <button disabled={pending} onClick={() => schedule(editorialPackage)} className="inline-flex min-h-11 items-center gap-2 bg-ink px-4 text-xs font-black uppercase text-white disabled:opacity-50"><Clock3 className="h-4 w-4" /> Add to broadcast schedule</button>
          </div>
        </article>
      ))}
    </section>
  );
}
