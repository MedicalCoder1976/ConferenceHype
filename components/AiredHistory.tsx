import { History } from "lucide-react";
import { cardTypeLabel } from "@/lib/broadcast/cardTypes";
import { SendBackButton } from "@/components/SendBackButton";
import type { Segment } from "@/lib/types";

type XMention = {
  handle: string;
  label: string;
  airedAt: string;
  segmentTitle: string;
  personaName: string;
  url: string;
};

function airedTime(segment: Segment) {
  const value = segment.updatedAt ?? segment.approvedAt ?? segment.createdAt;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short"
  }).format(new Date(value));
}

function normalizeHandle(value: string) {
  return value.replace(/^@/, "").trim();
}

function handleFromUrl(value: string) {
  const match = value.match(/\b(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})/i);
  return match?.[1] ? `@${match[1]}` : "";
}

function handlesFromText(value: string) {
  const handles = new Set<string>();
  for (const match of value.matchAll(/(^|[^\w])@([A-Za-z0-9_]{1,15})\b/g)) {
    handles.add(`@${match[2]}`);
  }
  for (const match of value.matchAll(/\b(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})/gi)) {
    handles.add(`@${match[1]}`);
  }
  return Array.from(handles);
}

function labelForHandle(handle: string, sourceText: string) {
  const username = normalizeHandle(handle);
  const beforeHandle = sourceText.match(new RegExp(`([A-Za-z][A-Za-z .,'-]{1,60})\\s+@${username}\\b`, "i"));
  const label = beforeHandle?.[1]?.trim().replace(/[,\s]+$/g, "");
  return label && !/\b(https?|x|twitter)\b/i.test(label) ? label : handle;
}

function buildXMentionLog(segments: Segment[]) {
  const mentions = new Map<string, XMention>();
  for (const segment of segments) {
    const airedAt = airedTime(segment);
    const sources = [...segment.citations, ...segment.socialBuzzItems];
    for (const source of sources) {
      const fromUrl = handleFromUrl(source.url);
      const handles = new Set([
        ...(fromUrl ? [fromUrl] : []),
        ...handlesFromText(`${source.label} ${source.url}`)
      ]);
      for (const handle of handles) {
        const key = `${handle.toLowerCase()}|${airedAt}|${segment.id}`;
        mentions.set(key, {
          handle,
          label: labelForHandle(handle, source.label),
          airedAt,
          segmentTitle: segment.title,
          personaName: segment.personaName,
          url: source.url || `https://x.com/${normalizeHandle(handle)}`
        });
      }
    }
    for (const handle of handlesFromText(segment.script)) {
      const key = `${handle.toLowerCase()}|${airedAt}|${segment.id}`;
      if (!mentions.has(key)) {
        mentions.set(key, {
          handle,
          label: labelForHandle(handle, segment.script),
          airedAt,
          segmentTitle: segment.title,
          personaName: segment.personaName,
          url: `https://x.com/${normalizeHandle(handle)}`
        });
      }
    }
  }
  return Array.from(mentions.values());
}

export function AiredHistory({ segments }: { segments: Segment[] }) {
  const xMentions = buildXMentionLog(segments);

  return (
    <section className="border border-ink/10 bg-white shadow-panel">
      <div className="border-b border-ink/10 p-5">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-broadcast" />
          <h2 className="text-2xl font-black text-ink">Talked about</h2>
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-ink/60">
          Every card that has actually aired, newest first. These no longer
          appear in their journal/conference/source deck — use "Send back for
          re-presentation" on a card here to make it schedulable again.
        </p>
      </div>
      <div className="grid gap-4 p-5">
        <section className="border border-ink/10 bg-paper/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-black text-ink">
              X voices mentioned on ConferenceHype
            </h3>
            <span className="text-xs font-black uppercase text-ink/50">
              {xMentions.length} broadcast mentions
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {xMentions.length === 0 ? (
              <div className="border border-dashed border-ink/20 bg-white p-4">
                <p className="text-sm font-semibold leading-6 text-ink/65">
                  No X voice mentions have been recorded from completed segments yet.
                </p>
              </div>
            ) : null}
            {xMentions.map((mention) => (
              <article
                key={`${mention.handle}-${mention.airedAt}-${mention.segmentTitle}`}
                className="grid gap-3 border border-ink/10 bg-white p-3 md:grid-cols-[1fr_auto]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      className="bg-ink px-2 py-1 text-xs font-black uppercase text-white"
                      href={mention.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {mention.handle}
                    </a>
                    <span className="border border-ink/15 px-2 py-1 text-xs font-bold uppercase text-ink/70">
                      {mention.label}
                    </span>
                    <span className="bg-broadcast px-2 py-1 text-xs font-black uppercase text-white">
                      {mention.airedAt}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-black leading-5 text-ink">
                    {mention.segmentTitle}
                  </p>
                </div>
                <div className="text-xs font-bold uppercase text-ink/50">
                  Mentioned by {mention.personaName}
                </div>
              </article>
            ))}
          </div>
        </section>
        {segments.length === 0 ? (
          <div className="border border-dashed border-ink/20 bg-paper/60 p-5">
            <h3 className="text-lg font-black text-ink">
              No talked-about history has been recorded yet
            </h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-ink/65">
              Once the runner marks completed items as rendered, they will appear
              here with timestamps.
            </p>
          </div>
        ) : null}
        {segments.map((segment) => (
          <article key={segment.id} className="border border-ink/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-ink px-2 py-1 text-xs font-black uppercase text-white">
                  {airedTime(segment)}
                </span>
                <span className="bg-broadcast px-2 py-1 text-xs font-black uppercase text-white">
                  {segment.personaName}
                </span>
                <span className="border border-ink/15 px-2 py-1 text-xs font-bold uppercase text-ink/70">
                  {cardTypeLabel(segment)}
                </span>
                {segment.citations[0]?.label ? (
                  <span className="border border-ink/15 bg-paper/60 px-2 py-1 text-xs font-bold uppercase text-ink/70">
                    {segment.citations[0].label}
                  </span>
                ) : null}
              </div>
              <SendBackButton segmentId={segment.id} script={segment.script} />
            </div>
            <h3 className="mt-3 text-lg font-black leading-6 text-ink">
              {segment.title}
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-ink/65">
              {segment.script || "No script on this card — flag for review."}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
