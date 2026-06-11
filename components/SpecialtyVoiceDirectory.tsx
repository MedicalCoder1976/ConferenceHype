"use client";

import { AtSign, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { medicalSpecialties } from "@/lib/catalog/medicalSpecialties";
import type { SpecialtyXVoice } from "@/lib/types";

export function SpecialtyVoiceDirectory({ initialVoices }: { initialVoices: SpecialtyXVoice[] }) {
  const [voices, setVoices] = useState(initialVoices);
  const [specialty, setSpecialty] = useState<(typeof medicalSpecialties)[number]>("Cardiology");
  const [label, setLabel] = useState("");
  const [handle, setHandle] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const grouped = useMemo(
    () =>
      medicalSpecialties.map((name) => ({
        name,
        voices: voices
          .filter((voice) => voice.enabled && voice.specialty === name)
          .sort((a, b) => b.score - a.score || a.rank - b.rank)
          .slice(0, 20)
      })),
    [voices]
  );

  const addVoice = () => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/specialty-voices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ specialty, label, handle, note })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not add specialty voice.");
        }
        setVoices((current) => [
          ...current.filter((voice) => voice.id !== payload.voice.id),
          payload.voice
        ]);
        setLabel("");
        setHandle("");
        setNote("");
        setMessage(`${payload.voice.handle} added to ${payload.voice.specialty}.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not add specialty voice.");
      }
    });
  };

  const removeVoice = (voice: SpecialtyXVoice) => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/specialty-voices", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: voice.id })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not remove specialty voice.");
        }
        setVoices((current) => current.filter((item) => item.id !== voice.id));
        setMessage(`${voice.handle} removed from active monitoring.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not remove specialty voice.");
      }
    });
  };

  return (
    <section className="grid gap-5">
      <div className="border border-ink/10 bg-white p-5 shadow-panel">
        <div className="flex items-center gap-2">
          <AtSign className="h-5 w-5 text-broadcast" />
          <h2 className="text-xl font-black text-ink">Top X voices by medical specialty</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-ink/65">
          Each specialty keeps up to 20 active voices. Live post engagement determines ranking;
          administrators can add or remove inappropriate accounts here.
        </p>
        {message ? <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold">{message}</div> : null}
        <div className="mt-4 grid gap-3 border border-ink/10 bg-paper/60 p-4 md:grid-cols-2">
          <select value={specialty} onChange={(event) => setSpecialty(event.target.value as typeof specialty)} className="border border-ink/20 bg-white px-3 py-3 text-sm">
            {medicalSpecialties.map((item) => <option key={item}>{item}</option>)}
          </select>
          <input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="@handle" className="border border-ink/20 px-3 py-3 text-sm" />
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Display name" className="border border-ink/20 px-3 py-3 text-sm" />
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why this voice matters" className="border border-ink/20 px-3 py-3 text-sm" />
          <button type="button" disabled={pending || !label.trim() || !handle.trim()} onClick={addVoice} className="inline-flex min-h-11 items-center justify-center gap-2 bg-broadcast px-4 text-sm font-black uppercase text-white disabled:opacity-50 md:col-span-2">
            <Plus className="h-4 w-4" /> Add specialty voice
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {grouped.map((group) => (
          <article key={group.name} className="border border-ink/10 bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-black text-ink">{group.name}</h3>
              <span className="bg-ink px-2 py-1 text-xs font-black text-white">{group.voices.length}/20</span>
            </div>
            <div className="mt-3 grid gap-2">
              {group.voices.length === 0 ? (
                <div className="border border-dashed border-ink/20 bg-paper p-3 text-sm font-semibold text-ink/55">No active voices yet.</div>
              ) : null}
              {group.voices.map((voice, index) => (
                <div key={voice.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border border-ink/10 p-3">
                  <span className="font-black text-broadcast">#{index + 1}</span>
                  <div>
                    <div className="text-sm font-black">{voice.label} <span className="text-broadcast">{voice.handle}</span></div>
                    <div className="mt-1 text-xs font-semibold text-ink/55">{voice.note} · score {voice.score}</div>
                  </div>
                  <button type="button" disabled={pending} onClick={() => removeVoice(voice)} aria-label={`Remove ${voice.handle}`} className="border border-ink/20 p-2 text-ink">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
