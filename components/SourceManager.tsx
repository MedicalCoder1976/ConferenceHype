import { Hash, Rss } from "lucide-react";
import type { SourceConfig } from "@/lib/types";
import {
  instagramPushPrompts,
  monitoredSocialTags,
  monitoredXVoices
} from "@/lib/sources/registry";

export function SourceManager({ sources }: { sources: SourceConfig[] }) {
  return (
    <section className="border border-ink/10 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <Rss className="h-5 w-5 text-mint" />
        <h2 className="text-xl font-black text-ink">Source intake</h2>
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
          the queue as social buzz and require human review before airing.
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
        <p className="mt-3 text-sm leading-6 text-ink/65">
          Use the X voices panel above to focus one of these handles into the
          human review queue.
        </p>
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
        {sources.map((source) => (
          <div
            key={source.id}
            className="flex items-center justify-between gap-4 border border-ink/10 p-3"
          >
            <div>
              <div className="text-sm font-black text-ink">{source.name}</div>
              <div className="text-xs font-bold uppercase text-ink/50">
                {source.type} - tier {source.rank}
              </div>
            </div>
            <span className="rounded-full bg-paper px-3 py-1 text-xs font-bold uppercase text-ink">
              {source.enabled ? "on" : "off"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
