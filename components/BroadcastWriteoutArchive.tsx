import { ExternalLink, FileText } from "lucide-react";
import type { BroadcastWriteout } from "@/lib/types";

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(value));
}

export function BroadcastWriteoutArchive({
  writeouts
}: {
  writeouts: BroadcastWriteout[];
}) {
  return (
    <section className="border border-ink/10 bg-white shadow-panel">
      <div className="border-b border-ink/10 p-5">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-broadcast" />
          <h2 className="text-2xl font-black text-ink">Broadcast writeouts</h2>
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-ink/60">
          The ordered, source-linked script record saved when each one-hour
          broadcast is rendered.
        </p>
      </div>
      <div className="grid gap-4 p-5">
        {writeouts.length === 0 ? (
          <div className="border border-dashed border-ink/20 bg-paper/60 p-5">
            <h3 className="text-lg font-black text-ink">No writeouts saved yet</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-ink/65">
              The next rendered broadcast will appear here automatically with
              every spoken card, source, and delivery link.
            </p>
          </div>
        ) : null}
        {writeouts.map((writeout) => (
          <details key={writeout.id} className="border border-ink/10">
            <summary className="cursor-pointer list-none p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-ink px-2 py-1 text-xs font-black uppercase text-white">
                      {dateTime(writeout.startsAt)}
                    </span>
                    <span className="bg-broadcast px-2 py-1 text-xs font-black uppercase text-white">
                      {writeout.status.replace(/_/g, " ")}
                    </span>
                    <span className="border border-ink/15 px-2 py-1 text-xs font-bold uppercase text-ink/70">
                      {writeout.cards.filter((card) => card.kind === "content").length} spoken cards
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-black text-ink">{writeout.title}</h3>
                </div>
                <span className="text-xs font-black uppercase text-ink/50">
                  Open full writeout
                </span>
              </div>
            </summary>
            <div className="border-t border-ink/10 p-4">
              <div className="mb-4 flex flex-wrap gap-2">
                {writeout.youtubeUrl ? (
                  <a
                    className="inline-flex items-center gap-2 bg-broadcast px-3 py-2 text-xs font-black uppercase text-white"
                    href={writeout.youtubeUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    YouTube video <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                {writeout.workflowUrl ? (
                  <a
                    className="inline-flex items-center gap-2 border border-ink px-3 py-2 text-xs font-black uppercase text-ink"
                    href={writeout.workflowUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Workflow run <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
              {writeout.deliveryError ? (
                <p className="mb-4 border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">
                  {writeout.deliveryError}
                </p>
              ) : null}
              <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap bg-ink p-4 text-sm leading-6 text-white">
                {writeout.writeoutMarkdown}
              </pre>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
