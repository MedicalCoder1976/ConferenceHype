import { Radio } from "lucide-react";
import { oncologyReporters } from "@/lib/generation/oncologyReporters";

export function OncologyReporterGrid() {
  return (
    <section className="border border-ink/10 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <Radio className="h-5 w-5 text-broadcast" />
        <h2 className="text-xl font-black text-ink">Cancer reporters</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink/65">
        Disease desks are assigned for source-labeled coverage throughout the
        day. Spoken scripts pronounce ASCO as Ask-oh.
      </p>

      <div className="mt-4 grid gap-3">
        {oncologyReporters.map((reporter) => (
          <article key={reporter.id} className="border border-ink/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-ink">
                  {reporter.name}
                </h3>
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-broadcast">
                  {reporter.desk} / {reporter.voiceRole}
                </p>
              </div>
              <span className="bg-ink px-2 py-1 text-xs font-black uppercase text-white">
                assigned
              </span>
            </div>

            <p className="mt-3 text-sm font-semibold leading-6 text-ink/75">
              {reporter.onAirStyle}
            </p>

            <ul className="mt-3 grid gap-2 text-xs font-semibold leading-5 text-ink/70">
              {reporter.coverageFocus.map((focus) => (
                <li key={focus} className="bg-paper p-2">
                  {focus}
                </li>
              ))}
            </ul>

            <p className="mt-3 bg-mint/10 p-3 text-xs font-bold leading-5 text-ink/75">
              {reporter.handoffLine}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
