"use client";

import { Camera, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { instagramPushPrompts, monitoredSocialTags } from "@/lib/sources/registry";

async function focusInstagramItem({
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
    throw new Error(payload.error ?? "Could not focus this Instagram item.");
  }
  return payload as { segment?: { title?: string } };
}

const captionStarter = `ASCO Hype is live from the conference desk. Tag ${monitoredSocialTags.instagramPrimaryHashtag} and ${monitoredSocialTags.instagramConferenceHashtag} with the best snack finds, coffee stops, W-poster buzz, and media moments you think deserve a broadcast callout.

Audience tips are reviewed before anything airs. Locations can change unexpectedly, so verify rooms and halls in the ASCO app and on-site signage.`;

export function InstagramPushPanel() {
  const [postUrl, setPostUrl] = useState("");
  const [postText, setPostText] = useState("");
  const [operatorNote, setOperatorNote] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      try {
        const result = await focusInstagramItem({
          postUrl,
          postText,
          operatorNote: operatorNote || "Instagram item or caption idea selected for operator review."
        });
        setMessage(
          `${result.segment?.title ?? "Instagram item"} added to review queue. Refresh admin to review.`
        );
        setPostUrl("");
        setPostText("");
        setOperatorNote("");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not focus this Instagram item.");
      }
    });
  };

  return (
    <section className="border border-ink/10 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <Camera className="h-5 w-5 text-broadcast" />
        <h2 className="text-xl font-black text-ink">Instagram intake and push prep</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink/65">
        Paste an Instagram post, reel, profile, or caption idea. It enters the
        same human review queue before anything becomes broadcast material.
      </p>
      {message ? (
        <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold text-ink">
          {message}
        </div>
      ) : null}
      <label className="mt-4 block text-xs font-black uppercase text-ink/60">
        Instagram URL
      </label>
      <input
        value={postUrl}
        onChange={(event) => setPostUrl(event.target.value)}
        placeholder="instagram.com/p/... or instagram.com/reel/..."
        className="mt-2 w-full border border-ink/20 px-3 py-3 text-sm outline-none focus:border-broadcast"
      />
      <label className="mt-4 block text-xs font-black uppercase text-ink/60">
        Caption, post text, or tip
      </label>
      <textarea
        value={postText}
        onChange={(event) => setPostText(event.target.value)}
        placeholder="Example: W-poster crowd building near Hall A. Verify location before broadcast."
        className="mt-2 min-h-28 w-full resize-y border border-ink/20 p-3 text-sm leading-6 outline-none focus:border-broadcast"
      />
      <label className="mt-4 block text-xs font-black uppercase text-ink/60">
        Operator note
      </label>
      <input
        value={operatorNote}
        onChange={(event) => setOperatorNote(event.target.value)}
        placeholder="Why should this enter the broadcast review queue?"
        className="mt-2 w-full border border-ink/20 px-3 py-3 text-sm outline-none focus:border-broadcast"
      />
      <button
        className="mt-4 inline-flex w-full items-center justify-center gap-2 bg-broadcast px-4 py-3 text-sm font-black uppercase text-white disabled:opacity-50"
        disabled={pending || (!postUrl.trim() && postText.trim().length < 4)}
        onClick={submit}
      >
        <Send className="h-4 w-4" />
        Focus Instagram for review
      </button>
      <div className="mt-5 border border-ink/10 bg-paper/60 p-4">
        <div className="text-sm font-black uppercase text-ink">
          Instagram caption starter
        </div>
        <textarea
          readOnly
          value={captionStarter}
          className="mt-3 min-h-36 w-full resize-y border border-ink/15 bg-white p-3 text-sm leading-6 text-ink/75"
        />
      </div>
      <div className="mt-4 grid gap-2">
        {instagramPushPrompts.map((item) => (
          <div key={item.label} className="border border-ink/10 p-3">
            <div className="text-xs font-black uppercase text-ink/60">
              {item.label}
            </div>
            <p className="mt-1 text-sm font-semibold leading-6 text-ink/70">
              {item.prompt}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
