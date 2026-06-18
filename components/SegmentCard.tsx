import { ExternalLink } from "lucide-react";
import { cardTypeLabel } from "@/lib/broadcast/cardTypes";
import type { Segment } from "@/lib/types";

export function SegmentCard({ segment }: { segment: Segment }) {
  return (
    <article className="border border-ink/10 bg-white p-5 shadow-panel">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-cyanline px-3 py-1 text-xs font-black uppercase text-white">
          {cardTypeLabel(segment)}
        </span>
        <span className="rounded-full bg-paper px-3 py-1 text-xs font-bold uppercase text-ink">
          {segment.personaName}
        </span>
        <span className="rounded-full border border-ink/15 px-3 py-1 text-xs font-bold uppercase text-ink/70">
          {segment.hypeLevel}
        </span>
      </div>
      <h3 className="mt-4 text-xl font-black text-ink">{segment.title}</h3>
      <p className="mt-2 leading-7 text-ink/72">{segment.summary}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {segment.citations.map((citation) => (
          <a
            key={citation.url}
            href={citation.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 border border-ink/10 px-3 py-2 text-xs font-bold text-ink/70 hover:border-ink"
          >
            {citation.label}
            <ExternalLink className="h-3 w-3" />
          </a>
        ))}
      </div>
    </article>
  );
}
