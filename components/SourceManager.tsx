"use client";

import { Hash, Plus, Rss } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { CardDeckSummary } from "@/components/CardDeckSummary";
import { EMPTY_CARD_DECK, type EntityCardDeck } from "@/lib/cardDeck";
import type { SourceConfig } from "@/lib/types";
import {
  instagramPushPrompts,
  monitoredSocialTags,
  monitoredXVoices
} from "@/lib/sources/registry";

type SourceKind = "x_user" | "news_site";

async function addSource({
  kind,
  name,
  urlOrHandle,
  note
}: {
  kind: SourceKind;
  name: string;
  urlOrHandle: string;
  note: string;
}) {
  const response = await fetch("/api/admin/sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, name, urlOrHandle, note })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Could not add source.");
  }
  return payload.source as SourceConfig;
}

export function SourceManager({
  sources,
  cardDecks = {}
}: {
  sources: SourceConfig[];
  cardDecks?: Record<string, EntityCardDeck>;
}) {
  const [visibleSources, setVisibleSources] = useState(sources);
  const [kind, setKind] = useState<SourceKind>("x_user");
  const [name, setName] = useState("");
  const [urlOrHandle, setUrlOrHandle] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setVisibleSources(sources);
  }, [sources]);

  const submit = () => {
    startTransition(async () => {
      try {
        const source = await addSource({ kind, name, urlOrHandle, note });
        setVisibleSources((current) => {
          const withoutDuplicate = current.filter((item) => item.url !== source.url);
          return [...withoutDuplicate, source].sort((a, b) => a.rank - b.rank);
        });
        setMessage(`${source.name} added to source intake.`);
        setName("");
        setUrlOrHandle("");
        setNote("");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not add source.");
      }
    });
  };

  return (
    <section className="min-w-0 border border-ink/10 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <Rss className="h-5 w-5 text-mint" />
        <h2 className="text-xl font-black text-ink">Source intake</h2>
      </div>
      <div className="mt-4 border border-ink/10 bg-paper/60 p-4">
        <div className="text-sm font-black uppercase text-ink">
          Add X user or news site
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-black uppercase text-ink/60">
            Source type
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as SourceKind)}
              className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 text-sm font-semibold normal-case outline-none focus:border-broadcast"
            >
              <option value="x_user">X user</option>
              <option value="news_site">News site / RSS</option>
            </select>
          </label>
          <label className="block text-xs font-black uppercase text-ink/60">
            Display name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={kind === "x_user" ? "Erika Hamilton" : "Cancer news site"}
              className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 text-sm font-semibold normal-case outline-none focus:border-broadcast"
            />
          </label>
        </div>
        <label className="mt-3 block text-xs font-black uppercase text-ink/60">
          {kind === "x_user" ? "X handle or URL" : "Site URL or RSS feed"}
          <input
            value={urlOrHandle}
            onChange={(event) => setUrlOrHandle(event.target.value)}
            placeholder={kind === "x_user" ? "@account or x.com/account" : "https://example.com/feed"}
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 text-sm font-semibold normal-case outline-none focus:border-broadcast"
          />
        </label>
        {kind === "x_user" ? (
          <label className="mt-3 block text-xs font-black uppercase text-ink/60">
            X source note
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why should this account be monitored?"
              className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 text-sm font-semibold normal-case outline-none focus:border-broadcast"
            />
          </label>
        ) : null}
        <button
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 bg-ink px-4 text-xs font-black uppercase text-white disabled:opacity-50"
          disabled={pending || urlOrHandle.trim().length < 2}
          onClick={submit}
        >
          <Plus className="h-4 w-4" />
          {pending ? "Adding" : "Add source"}
        </button>
        {message ? (
          <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold text-ink">
            {message}
          </div>
        ) : null}
      </div>
      <div className="mt-4 border border-cyanline/30 bg-cyanline/10 p-4">
        <div className="flex items-center gap-2 text-sm font-black uppercase text-ink">
          <Hash className="h-4 w-4" />
          Audience tag loop
        </div>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          Monitor {monitoredSocialTags.primaryHashtag},{" "}
          {monitoredSocialTags.secondaryHashtag},{" "}
          {monitoredSocialTags.conferenceHashtag}, and{" "}
          {monitoredSocialTags.botHandle}. Instagram pushes also use{" "}
          {monitoredSocialTags.instagramPrimaryHashtag} and{" "}
          {monitoredSocialTags.instagramConferenceHashtag}. Tagged posts enter
          the queue as social buzz and require human review before placement.
        </p>
      </div>
      <div className="mt-4 border border-ink/10 bg-paper/60 p-4">
        <div className="text-sm font-black uppercase text-ink">
          X voices to call out after review
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {monitoredXVoices.map((voice) => (
            <span
              key={voice.handle}
              className="border border-ink/15 bg-white px-3 py-2 text-xs font-bold text-ink/75"
              title={voice.note}
            >
              {voice.label} {voice.handle}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4 border border-ink/10 bg-paper/60 p-4">
        <div className="text-sm font-black uppercase text-ink">
          Instagram push prompts
        </div>
        <div className="mt-3 grid gap-2">
          {instagramPushPrompts.map((item) => (
            <div key={item.label} className="border border-ink/10 bg-white p-3">
              <div className="text-xs font-black uppercase text-ink/55">
                {item.label}
              </div>
              <p className="mt-1 text-sm font-semibold leading-6 text-ink/70">
                {item.prompt}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {visibleSources.map((source) => (
          <div key={source.id} className="min-w-0 border border-ink/10 p-3">
            <div className="flex min-w-0 items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-ink">{source.name}</div>
                <div className="text-xs font-bold uppercase text-ink/50">
                  {source.type} - tier {source.rank}
                </div>
                <div className="truncate text-xs font-semibold text-ink/45">
                  {source.url}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-paper px-3 py-1 text-xs font-bold uppercase text-ink">
                {source.enabled ? "on" : "off"}
              </span>
            </div>
            <CardDeckSummary deck={cardDecks[source.id] ?? EMPTY_CARD_DECK} />
          </div>
        ))}
      </div>
    </section>
  );
}
