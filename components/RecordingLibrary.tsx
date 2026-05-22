import { Headphones, RefreshCw } from "lucide-react";
import type { CachedRecording } from "@/lib/media/recordings";

export function RecordingLibrary({
  recordings
}: {
  recordings: CachedRecording[];
}) {
  return (
    <section className="border border-ink/10 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <Headphones className="h-5 w-5 text-broadcast" />
        <h2 className="text-xl font-black text-ink">Recording library</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink/65">
        Saved narrations can be reused for reruns without another ElevenLabs
        charge. Generate once, render many times.
      </p>

      <div className="mt-4 grid gap-3">
        {recordings.length === 0 ? (
          <div className="bg-paper p-4 text-sm font-semibold text-ink/65">
            No cached recordings found yet.
          </div>
        ) : (
          recordings.map((recording) => (
            <article key={recording.id} className="border border-ink/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-ink">
                    {recording.title}
                  </h3>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wide text-ink/55">
                    {recording.personaName} / {recording.voiceName} /{" "}
                    {recording.durationSeconds}s
                  </p>
                </div>
                <span className="bg-mint px-2 py-1 text-xs font-black uppercase text-white">
                  reusable
                </span>
              </div>

              <audio
                className="mt-3 w-full"
                controls
                preload="metadata"
                src={recording.audioPath}
              />

              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <Info label="voice id" value={recording.voiceId} />
                <Info label="generated" value={recording.generatedAt} />
                <Info label="audio" value={recording.audioPath} />
                <Info label="script" value={recording.scriptPath} />
              </dl>

              <div className="mt-3 bg-paper p-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-ink/60">
                  <RefreshCw className="h-4 w-4" />
                  Rerun without ElevenLabs
                </div>
                <code className="mt-2 block break-words text-xs font-bold text-ink">
                  {recording.reuseCommand}
                </code>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper p-2">
      <dt className="font-black uppercase text-ink/50">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-ink/75">{value}</dd>
    </div>
  );
}
