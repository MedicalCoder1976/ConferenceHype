import Link from "next/link";
import { PublicPlayer } from "@/components/PublicPlayer";
import { getPublicBroadcastContext } from "@/lib/data";
import { monitoredSocialTags } from "@/lib/sources/registry";

export const dynamic = "force-dynamic";

export default async function Home() {
  const broadcast = await getPublicBroadcastContext();

  return (
    <main className="min-h-screen">
      <section className="hype-grid border-b border-ink/10 px-4 py-4 sm:px-5 md:px-8 md:py-8 xl:py-10">
        <div className="mx-auto grid max-w-[1500px] gap-6 md:gap-8 xl:grid-cols-[minmax(560px,0.95fr)_minmax(520px,1.05fr)] xl:items-center">
          <div className="order-2 min-w-0 xl:order-1">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-broadcast px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                Live medical conference coverage
              </span>
              <span className="rounded-full border border-ink/15 bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink">
                Source-attributed programming
              </span>
            </div>
            <h1 className="max-w-full text-4xl font-black leading-[0.95] text-ink sm:text-5xl xl:text-6xl">
              ConferenceHype
            </h1>
            <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-ink/78 lg:text-lg lg:leading-8">
              Interactive conference/journal commentary when you cannot attend
              or read, and a live companion when you can. Suggest coverage with{" "}
              <strong>{monitoredSocialTags.primaryHashtag}</strong> or tag{" "}
              <strong>{monitoredSocialTags.botHandle}</strong>.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row lg:max-w-xl">
              <a
                href="#player"
                className="inline-flex min-h-12 items-center justify-center bg-ink px-5 py-3 text-sm font-black uppercase text-white"
              >
                Listen now
              </a>
              <a
                href={`https://x.com/intent/tweet?text=${encodeURIComponent(
                  `Suggesting a topic for ConferenceHype ${monitoredSocialTags.primaryHashtag}`
                )}`}
                className="inline-flex min-h-12 items-center justify-center border border-ink bg-white/80 px-5 py-3 text-sm font-black uppercase text-ink"
              >
                Suggest on X
              </a>
            </div>
          </div>
          <div id="player" className="order-1 scroll-mt-3 xl:order-2 xl:sticky xl:top-6">
            <PublicPlayer
              streamState={broadcast.streamState}
              currentCard={broadcast.currentCard}
            />
          </div>
        </div>
      </section>

      {broadcast.cards.length > 0 ? (
        <section className="border-b border-ink/10 bg-white px-4 py-7 sm:px-5 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-wide text-broadcast">
                Latest completed program
              </div>
              <h2 className="mt-1 text-2xl font-black text-ink">
                Latest broadcast
              </h2>
            </div>
            <span className="border border-ink/10 bg-paper px-3 py-2 text-xs font-black uppercase text-ink/60">
              {broadcast.cards.length} cards
            </span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {broadcast.cards.slice(0, 12).map((card) => (
              <article
                key={card.id}
                className="grid gap-2 border border-ink/10 bg-paper/50 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-ink px-2 py-1 text-[11px] font-black uppercase text-white">
                    {String(card.position).padStart(2, "0")}
                  </span>
                  {card.personaName ? (
                    <span className="text-[11px] font-black uppercase text-ink/50">
                      {card.personaName}
                    </span>
                  ) : null}
                </div>
                <h3 className="text-sm font-black leading-5 text-ink">{card.title}</h3>
                <p className="text-xs font-semibold leading-5 text-ink/65">
                  {card.summary}
                </p>
                {card.sourceUrl ? (
                  <a
                    href={card.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-black uppercase text-broadcast"
                  >
                    {card.sourceLabel ?? "Source"}
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        </div>
        </section>
      ) : null}

      <footer className="border-t border-ink/10 bg-ink px-4 py-7 text-white md:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-xl font-black">Important disclaimer</h2>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-white/78">
            <p>
              ConferenceHype is interactive AI commentary only. It is not
              reporting, journalism, medical education, clinical guidance,
              scientific validation, legal advice, or financial advice.
            </p>
            <p>
              Posts using {monitoredSocialTags.primaryHashtag},{" "}
              {monitoredSocialTags.secondaryHashtag},{" "}
              {monitoredSocialTags.conferenceHashtag}, or{" "}
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
