import Link from "next/link";
import { ConferenceBrowser } from "@/components/ConferenceBrowser";
import { RequestCoverageStrip, SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { loadConferences, toSummary } from "@/lib/conferences/hub";
import type { ConferenceSummary } from "@/lib/conferences/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  // A database hiccup should not take the whole home page down.
  let conferences: ConferenceSummary[] = [];
  let loadFailed = false;
  try {
    conferences = (await loadConferences()).map(toSummary);
  } catch (error) {
    console.error(error);
    loadFailed = true;
  }
  const videoCount = conferences.reduce((total, conference) => total + conference.videoCount, 0);

  return (
    <main className="min-h-screen">
      <SiteHeader active="conferences" />
      {loadFailed ? (
        <p className="mx-auto max-w-7xl px-4 py-6 text-sm font-semibold text-ink/70 sm:px-5 md:px-8">
          The conference list could not be loaded right now. Please try again in a minute.
        </p>
      ) : (
        <ConferenceBrowser
          conferences={conferences}
          intro={
            <div className="mt-5">
              <h1 className="text-3xl font-black leading-tight text-ink md:text-4xl">Conference coverage, one meeting at a time</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-ink/75 md:text-base">
                Pick a conference to watch every ConferenceHype video we made from it, in series order.
                {videoCount > 0 ? ` ${conferences.length} conferences and ${videoCount} videos so far.` : ""}{" "}
                <Link href="/live" className="text-broadcast underline">
                  Listen live
                </Link>
              </p>
            </div>
          }
        />
      )}
      <RequestCoverageStrip />
      <SiteFooter />
    </main>
  );
}
