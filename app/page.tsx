import Link from "next/link";
import { PublicPlayer } from "@/components/PublicPlayer";
import { getPublicSegments, getStreamState } from "@/lib/data";
import { monitoredSocialTags } from "@/lib/sources/registry";

export default async function Home() {
  const [segments, streamState] = await Promise.all([
    getPublicSegments(),
    getStreamState()
  ]);
  const current = segments[0];

  return (
    <main className="min-h-screen">
      <section className="hype-grid border-b border-ink/10 px-4 py-4 sm:px-5 md:px-8 md:py-8 xl:py-10">
        <div className="mx-auto grid max-w-7xl gap-5 md:gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(460px,1.1fr)] lg:items-center xl:grid-cols-[minmax(0,0.85fr)_minmax(560px,1.15fr)]">
          <div className="order-2 lg:order-1">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-broadcast px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                ASCO 2026 follow-along channel
              </span>
              <span className="rounded-full border border-ink/15 bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink">
                Opens from X and plays
              </span>
            </div>
            <h1 className="max-w-4xl text-4xl font-black leading-[0.95] text-ink sm:text-5xl lg:text-6xl xl:text-7xl">
              ASCO Hype
            </h1>
            <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-ink/78 lg:text-lg lg:leading-8">
              Interactive Conference Commentary if you cannot attend. Better if
              you do attend and follow along. Suggest topics to go live with{" "}
              <strong>{monitoredSocialTags.primaryHashtag}</strong> or tag{" "}
              <strong>{monitoredSocialTags.botHandle}</strong>.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
              <div className="border-l-4 border-broadcast bg-white/85 p-4 shadow-panel">
                <div className="text-xl font-black md:text-2xl">May 25</div>
                <div className="text-sm font-semibold text-ink/65">
                  Favourite this link now. Listen and contribute to the ASCO
                  experience.
                </div>
              </div>
              <div className="border-l-4 border-cyanline bg-white/85 p-4 shadow-panel">
                <div className="text-xl font-black md:text-2xl">May 29-Jun 2</div>
                <div className="text-sm font-semibold text-ink/65">
                  ASCO 2026 annual meeting
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row lg:max-w-xl">
              <a
                href="#player"
                className="inline-flex min-h-12 items-center justify-center bg-ink px-5 py-3 text-sm font-black uppercase text-white"
              >
                Listen now
              </a>
              <a
                href={`https://x.com/intent/tweet?text=${encodeURIComponent(
                  `Suggesting a topic for ASCO Hype ${monitoredSocialTags.primaryHashtag}`
                )}`}
                className="inline-flex min-h-12 items-center justify-center border border-ink bg-white/80 px-5 py-3 text-sm font-black uppercase text-ink"
              >
                Suggest on X
              </a>
            </div>
          </div>
          <div id="player" className="order-1 scroll-mt-3 lg:order-2 lg:sticky lg:top-6">
            <PublicPlayer streamState={streamState} currentSegment={current} />
          </div>
        </div>
      </section>

      <footer className="border-t border-ink/10 bg-ink px-4 py-7 text-white md:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-xl font-black">Important disclaimer</h2>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-white/78">
            <p>
              ASCO Hype is interactive AI commentary only. It is not reporting,
              journalism, medical education, clinical guidance, scientific
              validation, legal advice, or financial advice.
            </p>
            <p>
              ASCO Hype is not associated with, endorsed by, sponsored by, or
              affiliated with the American Society of Clinical Oncology in any
              way.
            </p>
            <p>
              Posts using {monitoredSocialTags.primaryHashtag},{" "}
              {monitoredSocialTags.secondaryHashtag}, or{" "}
              {monitoredSocialTags.botHandle} may be considered as topic
              suggestions for the commentary stream.
            </p>
          </div>
          <div className="mt-5">
            <Link
              href="/terms"
              className="inline-flex border border-white/40 px-4 py-2 text-sm font-bold text-white hover:border-white"
            >
              Terms and Conditions
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
