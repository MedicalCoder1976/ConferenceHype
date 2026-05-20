"use client";

import { Megaphone, Send } from "lucide-react";
import { useState, useTransition } from "react";

async function focusSocialPost({
  postUrl,
  postText,
  operatorNote
}: {
  postUrl: string;
  postText: string;
  operatorNote: string;
}) {
  const response = await fetch("/api/admin/focus-social", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postUrl, postText, operatorNote })
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
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      try {
        const result = await focusSocialPost({ postUrl, postText, operatorNote });
        setMessage(
          `${result.segment?.title ?? "Focused item"} added to review queue. Refresh admin to review.`
        );
        setPostUrl("");
        setPostText("");
        setOperatorNote("");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not focus the item.");
      }
    });
  };

  return (
    <section className="border border-ink/10 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-broadcast" />
        <h2 className="text-xl font-black text-ink">Focus a URL or X post</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink/65">
        Paste a URL, X post, or attendee tip. It becomes a high-energy
        review segment before anything airs.
      </p>
      {message ? (
        <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold text-ink">
          {message}
        </div>
      ) : null}
      <label className="mt-4 block text-xs font-black uppercase text-ink/60">
        URL or X post
      </label>
      <input
        value={postUrl}
        onChange={(event) => setPostUrl(event.target.value)}
        placeholder="x.com/asco or https://example.com/story"
        className="mt-2 w-full border border-ink/20 px-3 py-3 text-sm outline-none focus:border-broadcast"
      />
      <label className="mt-4 block text-xs font-black uppercase text-ink/60">
        Text, post, or tip
      </label>
      <textarea
        value={postText}
        onChange={(event) => setPostText(event.target.value)}
        placeholder="Optional if the URL has enough context. Example: #ASCOHype coffee tip near Hall A, worth checking..."
        className="mt-2 min-h-32 w-full resize-y border border-ink/20 p-3 text-sm leading-6 outline-none focus:border-broadcast"
      />
      <label className="mt-4 block text-xs font-black uppercase text-ink/60">
        Operator note
      </label>
      <input
        value={operatorNote}
        onChange={(event) => setOperatorNote(event.target.value)}
        placeholder="Why should this be considered for broadcast?"
        className="mt-2 w-full border border-ink/20 px-3 py-3 text-sm outline-none focus:border-broadcast"
      />
      <button
        className="mt-4 inline-flex w-full items-center justify-center gap-2 bg-broadcast px-4 py-3 text-sm font-black uppercase text-white disabled:opacity-50"
        disabled={pending || (!postUrl.trim() && postText.trim().length < 4)}
        onClick={submit}
      >
        <Send className="h-4 w-4" />
        Focus for review
      </button>
    </section>
  );
}
