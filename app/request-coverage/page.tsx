import type { Metadata } from "next";
import Link from "next/link";
import { RequestCoverageForm } from "@/components/RequestCoverageForm";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export const metadata: Metadata = {
  title: "Request conference coverage | ConferenceHype",
  description: "Ask ConferenceHype to cover your conference, in medicine and beyond.",
  alternates: { canonical: "/request-coverage" }
};

export default function RequestCoveragePage() {
  return (
    <main className="min-h-screen">
      <SiteHeader active="request" />
      <section className="hype-grid px-4 py-8 sm:px-5 md:px-8">
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div>
            <h1 className="text-3xl font-black leading-tight text-ink md:text-5xl">Request coverage</h1>
            <p className="mt-3 text-base font-semibold leading-7 text-ink/75">
              Tell us about a conference you would like ConferenceHype to cover. Medicine is our home field today, and we
              are adding engineering and other fields where conferences are held regularly.
            </p>
            <p className="mt-3 text-sm font-semibold leading-6 text-ink/65">
              Your name and email are used only to follow up on this request and are never shown on the site. See the{" "}
              <Link href="/terms" className="text-broadcast underline">
                terms
              </Link>
              .
            </p>
          </div>
          <RequestCoverageForm />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
