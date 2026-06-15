"use client";

import { AtSign, Plus, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { monitoredXVoices, type XVoice } from "@/lib/sources/registry";

function handleToUrl(handle: string) {
  return `https://x.com/${handle.replace(/^@/, "")}`;
}

async function focusXVoice({
  handle,
  label,
  note
}: {
  handle: string;
  label: string;
  note: string;
}) {
  const response = await fetch("/api/admin/focus-social", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postUrl: handleToUrl(handle),
      postText: `${label} ${handle} is a watched X voice for ConferenceHype commentary ideas.`,
      operatorNote: `${note}. Treat this as a source-attributed X voice callout for broadcast.`,
      itemType: "x_tweet",
      personaId: "vesper-quill",
      approveNow: true,
      repeatEveryHalfHour: false,
      repeatCount: 1
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Could not focus this X voice.");
  }
  return payload as { segment?: { title?: string } };
}

async function addXFollow({
  handle,
  label,
  note
}: {
  handle: string;
  label: string;
  note: string;
}) {
  const response = await fetch("/api/admin/x-follows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, label, note })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Could not add this X account.");
  }
  return payload as { voice: XVoice };
}

function dedupeVoices(voices: XVoice[]) {
  const seen = new Set<string>();
  return voices.filter((voice) => {
    const key = voice.handle.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function XVoiceCallouts({ customVoices = [] }: { customVoices?: XVoice[] }) {
  const [voices, setVoices] = useState(() =>
    dedupeVoices([...monitoredXVoices, ...customVoices])
  );
  const [newHandle, setNewHandle] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newNote, setNewNote] = useState("");
  const [message, setMessage] = useState("");
  const [activeHandle, setActiveHandle] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (voice: XVoice) => {
    setActiveHandle(voice.handle);
    startTransition(async () => {
      try {
        const result = await focusXVoice(voice);
        setMessage(
          `${result.segment?.title ?? voice.handle} added to the approved rundown. Refresh admin to review.`
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not focus this X voice.");
      } finally {
        setActiveHandle("");
      }
    });
  };

  const saveFollow = () => {
    startTransition(async () => {
      try {
        const result = await addXFollow({
          handle: newHandle,
          label: newLabel,
          note: newNote
        });
        setVoices((current) => dedupeVoices([...current, result.voice]));
        setMessage(`${result.voice.handle} added to X follows.`);
        setNewHandle("");
        setNewLabel("");
        setNewNote("");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not add this X account.");
      }
    });
  };

  return (
    <section className="border border-ink/10 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <AtSign className="h-5 w-5 text-broadcast" />
        <h2 className="text-xl font-black text-ink">X voices to call out</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink/65">
        Watch these voices for commentary ideas. A focus action adds a
        source-attributed X voice callout to the approved rundown.
      </p>
      {message ? (
        <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold text-ink">
          {message}
        </div>
      ) : null}
      <div className="mt-4 border border-ink/10 bg-paper/60 p-4">
        <div className="text-sm font-black uppercase text-ink">
          Add X account to follow
        </div>
        <div className="mt-3 grid gap-3">
          <input
            value={newHandle}
            onChange={(event) => setNewHandle(event.target.value)}
            placeholder="@account or x.com/account"
            className="w-full border border-ink/20 px-3 py-3 text-sm outline-none focus:border-broadcast"
          />
          <input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Display name, optional"
            className="w-full border border-ink/20 px-3 py-3 text-sm outline-none focus:border-broadcast"
          />
          <input
            value={newNote}
            onChange={(event) => setNewNote(event.target.value)}
            placeholder="Why follow this account?"
            className="w-full border border-ink/20 px-3 py-3 text-sm outline-none focus:border-broadcast"
          />
          <button
            className="inline-flex items-center justify-center gap-2 bg-broadcast px-4 py-3 text-sm font-black uppercase text-white disabled:opacity-50"
            disabled={pending || newHandle.trim().length < 2}
            onClick={saveFollow}
          >
            <Plus className="h-4 w-4" />
            Add X follow
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {voices.map((voice) => (
          <div key={voice.handle} className="border border-ink/10 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-black text-ink">
                  {voice.label} <span className="text-broadcast">{voice.handle}</span>
                </div>
                <div className="mt-1 text-xs font-bold uppercase text-ink/50">
                  {voice.note}
                </div>
              </div>
              <button
                className="inline-flex items-center justify-center gap-2 bg-ink px-3 py-2 text-xs font-black uppercase text-white disabled:opacity-50"
                disabled={pending}
                onClick={() => run(voice)}
              >
                <Send className="h-3 w-3" />
                {pending && activeHandle === voice.handle ? "Focusing" : "Focus"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
