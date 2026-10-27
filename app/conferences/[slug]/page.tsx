import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConferenceBrowser } from "@/components/ConferenceBrowser";
import { ConferenceSeriesPlayer } from "@/components/ConferenceSeriesPlayer";
import { RequestCoverageStrip, SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { loadConferences, toSummary } from "@/lib/conferences/hub";
import { formatConferenceDates } from "@/lib/conferences/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const conference = (await loadConferences()).find((item) => item.slug === slug);
  if (!conference) return { title: "Conference not found | ConferenceHype" };
  const title = `${conference.displayName} coverage: ${conference.videoCount} videos | ConferenceHype`;
  const description = `Every ConferenceHype video from ${conference.fullName}, ${conference.specialty.toLowerCase()} updates in series order.`;
  return {
    title,
    description,
    alternates: { canonical: `/conferences/${conference.slug}` },
    openGraph: { title, description, type: "website" }
  };
}

export default async function ConferencePage({ params }: Params) {
  const { slug } = await params;
  const conferences = await loadConferences();
  const conference = conferences.find((item) => item.slug === slug);
  if (!conference) notFound();
  const dates = formatConferenceDates(conference.startDate, conference.endDate);

  return (
    <main className="min-h-screen">
      <SiteHeader active="conferences" />
      <section className="hype-grid border-b border-ink/10 px-4 py-6 sm:px-5 md:px-8">
        <div className="mx-auto max-w-7xl">
          <Link href="/" className="text-xs font-black uppercase text-broadcast">
            All conferences
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="bg-ink px-2 py-1 text-[11px] font-black uppercase text-white">{conference.specialty}</span>
            {[dates, conference.city].filter(Boolean).length > 0 ? (
              <span className="text-xs font-bold text-ink/65">{[dates, conference.city].filter(Boolean).join(" · ")}</span>
            ) : null}
          </div>
          <h1 className="mt-2 text-3xl font-black leading-tight text-ink md:text-5xl">{conference.fullName}</h1>
          <div className="mt-5">
            <ConferenceSeriesPlayer videos={conference.videos} displayName={conference.displayName} />
          </div>
        </div>
      </section>
      <ConferenceBrowser conferences={conferences.map(toSummary)} heading="More conferences" currentSlug={conference.slug} />
      <RequestCoverageStrip />
      <SiteFooter />
    </main>
  );
}
