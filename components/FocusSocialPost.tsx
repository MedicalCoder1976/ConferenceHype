"use client";

import { Megaphone, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { personas } from "@/lib/generation/personas";

type OperatorItemType = "x_tweet" | "url" | "statement" | "sponsor_message" | "emergency_message";

async function focusSocialPost({
  postUrl,
  postText,
  operatorNote,
  sponsorName,
  itemType,
  personaId,
  approveNow,
  repeatEveryHalfHour,
  repeatCount
}: {
  postUrl: string;
  postText: string;
  operatorNote: string;
  sponsorName: string;
  itemType: OperatorItemType;
  personaId: string;
  approveNow: boolean;
  repeatEveryHalfHour: boolean;
  repeatCount: number;
}) {
  const response = await fetch("/api/admin/focus-social", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postUrl,
      postText,
      operatorNote,
      sponsorName,
      itemType,
      personaId,
      approveNow,
      repeatEveryHalfHour,
      repeatCount
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Could not focus the item.");
  }
  return payload as { segment?: { title?: string } };
}

export function FocusSocialPost() {
  const [postUrl, setPostUrl] = useState("");
  const [postText, setPostText] = useState("");
  const [operatorNote, setOperatorNote] = useState("");
  const [sponsorName, setSponsorName] = useState("");
  const [itemType, setItemType] = useState<OperatorItemType>("x_tweet");
  const [personaId, setPersonaId] = useState("vesper-quill");
  const [approveNow, setApproveNow] = useState(true);
  const [repeatEveryHalfHour, setRepeatEveryHalfHour] = useState(false);
  const [repeatCount, setRepeatCount] = useState(2);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      try {
        const result = await focusSocialPost({
          postUrl,
          postText,
          operatorNote,
          sponsorName,
          itemType,
          personaId,
          approveNow,
          repeatEveryHalfHour,
          repeatCount
        });
        setMessage(
          `${result.segment?.title ?? "Operator item"} ${approveNow ? "added to rundown" : "added to review queue"}. Refresh admin to review.`
        );
        setPostUrl("");
        setPostText("");
        setOperatorNote("");
        setSponsorName("");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not focus the item.");
      }
    });
  };

  return (
    <section className="border border-ink/10 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-broadcast" />
        <h2 className="text-xl font-black text-ink">
          Operator broadcast injection
        </h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink/65">
        Add an X tweet, URL, emergency note, operator statement, or sponsor
        message. The narrator reads free text as a card that can be placed or
        swapped into the presentation queue.
      </p>
      {message ? (
        <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold text-ink">
          {message}
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-black uppercase text-ink/60">
          Item type
          <select
            value={itemType}
            onChange={(event) => setItemType(event.target.value as OperatorItemType)}
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 text-sm font-semibold normal-case outline-none focus:border-broadcast"
          >
            <option value="x_tweet">X tweet</option>
            <option value="url">URL or article</option>
            <option value="emergency_message">Emergency content</option>
            <option value="statement">Operator break-in mention</option>
            <option value="sponsor_message">Sponsor message</option>
          </select>
        </label>
        <label className="block text-xs font-black uppercase text-ink/60">
          Voice
          <select
            value={personaId}
            onChange={(event) => setPersonaId(event.target.value)}
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 text-sm font-semibold normal-case outline-none focus:border-broadcast"
          >
            {personas.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.name} - {persona.specialty}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-4 block text-xs font-black uppercase text-ink/60">
        URL or X tweet
      </label>
      <input
        value={postUrl}
        onChange={(event) => setPostUrl(event.target.value)}
        placeholder="x.com/medicalconference/status/..., or https://example.com/story"
        className="mt-2 w-full border border-ink/20 px-3 py-3 text-sm outline-none focus:border-broadcast"
      />
      <label className="mt-4 block text-xs font-black uppercase text-ink/60">
        Tweet text, emergency content, sponsor copy, or talking point
      </label>
      <textarea
        value={postText}
        onChange={(event) => setPostText(event.target.value)}
        placeholder="Paste the exact text to read or summarize. Emergency and sponsor messages should be clearly labeled."
        className="mt-2 min-h-32 w-full resize-y border border-ink/20 p-3 text-sm leading-6 outline-none focus:border-broadcast"
      />
      {itemType === "sponsor_message" ? (
        <>
          <label className="mt-4 block text-xs font-black uppercase text-ink/60">
            Sponsor name
          </label>
          <input
            value={sponsorName}
            onChange={(event) => setSponsorName(event.target.value)}
            placeholder="Legal advertiser or sponsor name"
            className="mt-2 w-full border border-ink/20 px-3 py-3 text-sm outline-none focus:border-broadcast"
          />
          <p className="mt-2 text-xs font-bold leading-5 text-ink/60">
            Sponsor cards always enter human review and remain clearly labeled as paid content.
          </p>
        </>
      ) : null}
      <label className="mt-4 block text-xs font-black uppercase text-ink/60">
        Operator note
      </label>
      <input
        value={operatorNote}
        onChange={(event) => setOperatorNote(event.target.value)}
        placeholder="Why should this be considered for broadcast?"
        className="mt-2 w-full border border-ink/20 px-3 py-3 text-sm outline-none focus:border-broadcast"
      />
      <div className="mt-4 grid gap-3 border border-ink/10 bg-paper/60 p-4">
        <label className="flex items-start gap-3 text-sm font-bold text-ink">
          <input
            type="checkbox"
            checked={itemType === "sponsor_message" ? false : approveNow}
            onChange={(event) => setApproveNow(event.target.checked)}
            disabled={itemType === "sponsor_message"}
            className="mt-1 h-4 w-4"
          />
          Add directly to the approved broadcast rundown
        </label>
        <label className="flex items-start gap-3 text-sm font-bold text-ink">
          <input
            type="checkbox"
            checked={repeatEveryHalfHour}
            onChange={(event) => setRepeatEveryHalfHour(event.target.checked)}
            disabled={!approveNow || itemType === "sponsor_message"}
            className="mt-1 h-4 w-4"
          />
          Repeat once every half hour
        </label>
        <label className="block text-xs font-black uppercase text-ink/60">
          Total reads
          <input
            type="number"
            min={1}
            max={12}
            value={repeatCount}
            onChange={(event) => setRepeatCount(Number(event.target.value))}
            disabled={!approveNow || !repeatEveryHalfHour || itemType === "sponsor_message"}
            className="mt-2 w-28 border border-ink/20 bg-white px-3 py-2 text-sm font-semibold normal-case outline-none focus:border-broadcast disabled:opacity-50"
          />
        </label>
      </div>
      <button
        className="mt-4 inline-flex w-full items-center justify-center gap-2 bg-broadcast px-4 py-3 text-sm font-black uppercase text-white disabled:opacity-50"
        disabled={
          pending ||
          (!postUrl.trim() && postText.trim().length < 4) ||
          (itemType === "sponsor_message" && sponsorName.trim().length < 2)
        }
        onClick={submit}
      >
        <Send className="h-4 w-4" />
        Create broadcast card
      </button>
    </section>
  );
}
