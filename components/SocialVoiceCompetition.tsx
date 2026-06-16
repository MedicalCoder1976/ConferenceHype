"use client";

import { Ban, Plus, RotateCcw, Trophy, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { medicalSpecialties } from "@/lib/catalog/medicalSpecialties";
import type { SocialVoiceLeader, SpecialtyXVoice } from "@/lib/types";

function momentumLabel(momentum: SocialVoiceLeader["momentum"]) {
  if (momentum === "rising") {
    return "rising fast";
  }
  if (momentum === "steady") {
    return "on the board";
  }
  return "new challenger";
}

export function SocialVoiceCompetition({
  leaders,
  cadence,
  dueNow,
  specialtyVoices
}: {
  leaders: SocialVoiceLeader[];
  cadence: string;
  dueNow: boolean;
  specialtyVoices: SpecialtyXVoice[];
}) {
  const router = useRouter();
  const [visibleLeaders, setVisibleLeaders] = useState(leaders);
  const [voices, setVoices] = useState(specialtyVoices);
  const [specialty, setSpecialty] = useState<(typeof medicalSpecialties)[number]>("Oncology");
  const [newHandle, setNewHandle] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newNote, setNewNote] = useState("");
  const [pendingHandle, setPendingHandle] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setVisibleLeaders(leaders);
  }, [leaders]);

  useEffect(() => {
    setVoices(specialtyVoices);
  }, [specialtyVoices]);

  const selectedVoices = useMemo(
    () =>
      voices
        .filter((voice) => voice.specialty === specialty && voice.enabled)
        .sort((a, b) => a.rank - b.rank || b.score - a.score)
        .slice(0, 20),
    [specialty, voices]
  );

  const rejectedVoices = useMemo(
    () =>
      voices
        .filter((voice) => voice.specialty === specialty && !voice.enabled)
        .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label)),
    [specialty, voices]
  );

  const blacklist = (leader: SocialVoiceLeader) => {
    setPendingHandle(leader.handle);
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/social-voices/blacklist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handle: leader.handle,
            label: leader.label
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not blacklist voice.");
        }
        setVisibleLeaders((current) =>
          current.filter((item) => item.handle.toLowerCase() !== leader.handle.toLowerCase())
        );
        setMessage(`${leader.handle} blacklisted and removed from social voice competition.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not blacklist voice.");
      } finally {
        setPendingHandle("");
      }
    });
  };

  const addVoice = () => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/specialty-voices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            specialty,
            label: newLabel.trim() || newHandle.trim(),
            handle: newHandle,
            note: newNote
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not add specialty voice.");
        }
        setVoices((current) => [
          ...current.filter((voice) => voice.id !== payload.voice.id),
          payload.voice
        ]);
        setNewHandle("");
        setNewLabel("");
        setNewNote("");
        setMessage(`${payload.voice.handle} added to ${payload.voice.specialty}.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not add specialty voice.");
      }
    });
  };

  const rejectVoice = (voice: SpecialtyXVoice) => {
    setPendingHandle(voice.handle);
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/specialty-voices", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: voice.id })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not reject specialty voice.");
        }
        setVoices((current) =>
          current.map((item) => item.id === voice.id ? payload.voice : item)
        );
        setMessage(`${voice.handle} rejected for ${voice.specialty}.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not reject specialty voice.");
      } finally {
        setPendingHandle("");
      }
    });
  };

  const restoreVoice = (voice: SpecialtyXVoice) => {
    setPendingHandle(voice.handle);
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/specialty-voices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            specialty: voice.specialty,
            label: voice.label,
            handle: voice.handle,
            note: voice.note,
            rank: voice.rank
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not restore specialty voice.");
        }
        setVoices((current) =>
          current.map((item) => item.id === voice.id ? payload.voice : item)
        );
        setMessage(`${voice.handle} restored to ${voice.specialty}.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not restore specialty voice.");
      } finally {
        setPendingHandle("");
      }
    });
  };

  return (
    <section className="border border-ink/10 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-gold" />
        <h2 className="text-xl font-black text-ink">Social voice competition</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink/65">
        The leaderboard is ranked from recent X search results, watched handles,
        mention counts, and engagement signals. The specialty watchlist below is
        curated separately and only becomes ranked after real monitored posts are
        ingested.
      </p>
      <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold text-ink">
        {dueNow ? "Competition segment is available in this one-hour block." : cadence}
      </div>
      {message ? (
        <div className="mt-3 border border-ink/10 bg-paper p-3 text-sm font-bold text-ink">
          {message}
        </div>
      ) : null}
      {visibleLeaders.length === 0 ? (
        <div className="mt-4 border border-ink/10 bg-paper p-4 text-sm font-bold text-ink/60">
          No recent X mentions have cleared the leaderboard yet. The specialty watchlist below is still active for monitoring and operator callouts.
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {visibleLeaders.map((leader, index) => (
            <div
              key={leader.handle}
              className="grid gap-3 border border-ink/10 p-3 sm:grid-cols-[auto_1fr_auto_auto]"
            >
              <div className="flex h-10 w-10 items-center justify-center bg-ink text-sm font-black text-white">
                {`#${index + 1}`}
              </div>
              <div>
                <div className="text-sm font-black text-ink">
                  {leader.label} <span className="text-broadcast">{leader.handle}</span>
                </div>
                <div className="mt-1 text-xs font-bold uppercase text-ink/50">
                  {momentumLabel(leader.momentum)} - {leader.mentions} post{leader.mentions === 1 ? "" : "s"} - {leader.note}
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-black text-ink">
                <Zap className="h-4 w-4 text-broadcast" />
                {leader.score}
              </div>
              <button
                type="button"
                className="inline-flex min-h-9 items-center justify-center gap-2 border border-ink bg-white px-3 text-xs font-black uppercase text-ink disabled:opacity-50"
                disabled={pending}
                onClick={() => blacklist(leader)}
              >
                <Ban className="h-4 w-4" />
                {pendingHandle === leader.handle ? "Blacklisting" : "Blacklist"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 border border-ink/10 bg-paper/60 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-black uppercase text-ink">
              Specialty voice watchlist
            </h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-ink/60">
              Add or reject specialty-specific oncology and medical conference voices without inventing rankings.
            </p>
          </div>
          <label className="grid gap-1 text-xs font-black uppercase text-ink/60">
            Specialty
            <select
              value={specialty}
              onChange={(event) => setSpecialty(event.target.value as typeof specialty)}
              className="border border-ink/20 bg-white px-3 py-2 text-sm font-semibold normal-case text-ink"
            >
              {medicalSpecialties.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 grid gap-2">
          {selectedVoices.length === 0 ? (
            <div className="border border-dashed border-ink/20 bg-white p-3 text-sm font-bold text-ink/55">
              No active voices for {specialty}.
            </div>
          ) : null}
          {selectedVoices.map((voice, index) => (
            <div
              key={voice.id}
              className="grid gap-3 border border-ink/10 bg-white p-3 sm:grid-cols-[auto_1fr_auto]"
            >
              <div className="font-black text-broadcast">#{index + 1}</div>
              <div>
                <div className="text-sm font-black text-ink">
                  {voice.label} <span className="text-broadcast">{voice.handle}</span>
                </div>
                <div className="mt-1 text-xs font-bold uppercase text-ink/50">
                  {voice.note || "operator-curated specialty voice"}
                </div>
              </div>
              <button
                type="button"
                className="inline-flex min-h-9 items-center justify-center gap-2 border border-ink bg-white px-3 text-xs font-black uppercase text-ink disabled:opacity-50"
                disabled={pending}
                onClick={() => rejectVoice(voice)}
              >
                <Ban className="h-4 w-4" />
                {pendingHandle === voice.handle ? "Rejecting" : "Reject"}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 border border-ink/10 bg-white p-3 md:grid-cols-2">
          <input
            value={newHandle}
            onChange={(event) => setNewHandle(event.target.value)}
            placeholder="@handle or x.com/handle"
            className="border border-ink/20 px-3 py-3 text-sm"
          />
          <input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Display name"
            className="border border-ink/20 px-3 py-3 text-sm"
          />
          <input
            value={newNote}
            onChange={(event) => setNewNote(event.target.value)}
            placeholder={`Why this ${specialty} voice matters`}
            className="border border-ink/20 px-3 py-3 text-sm md:col-span-2"
          />
          <button
            type="button"
            disabled={pending || !newHandle.trim()}
            onClick={addVoice}
            className="inline-flex min-h-11 items-center justify-center gap-2 bg-broadcast px-4 text-xs font-black uppercase text-white disabled:opacity-50 md:col-span-2"
          >
            <Plus className="h-4 w-4" />
            Add specialty voice
          </button>
        </div>

        {rejectedVoices.length ? (
          <details className="mt-4 border border-ink/10 bg-white">
            <summary className="cursor-pointer list-none p-3 text-xs font-black uppercase text-ink/60">
              Rejected {specialty} voices ({rejectedVoices.length})
            </summary>
            <div className="grid gap-2 border-t border-ink/10 p-3">
              {rejectedVoices.map((voice) => (
                <div key={voice.id} className="flex flex-wrap items-center justify-between gap-3 border border-ink/10 p-3">
                  <div>
                    <div className="text-sm font-black text-ink">
                      {voice.label} <span className="text-broadcast">{voice.handle}</span>
                    </div>
                    <div className="mt-1 text-xs font-bold uppercase text-ink/45">
                      {voice.note || "rejected specialty voice"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex min-h-9 items-center justify-center gap-2 border border-ink bg-white px-3 text-xs font-black uppercase text-ink disabled:opacity-50"
                    disabled={pending}
                    onClick={() => restoreVoice(voice)}
                  >
                    <RotateCcw className="h-4 w-4" />
                    {pendingHandle === voice.handle ? "Restoring" : "Restore"}
                  </button>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
