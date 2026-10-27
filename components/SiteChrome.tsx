import Link from "next/link";
import { monitoredSocialTags } from "@/lib/sources/registry";

export function SiteHeader({ active }: { active?: "conferences" | "live" | "request" }) {
  const item = (key: typeof active, href: string, label: string) => (
    <Link
      href={href}
      className={`px-2 py-2 text-[11px] font-black uppercase tracking-wide sm:px-3 sm:text-xs ${
        active === key ? "bg-ink text-white" : "text-ink/70 hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <header className="border-b border-ink/10 bg-white/90 px-4 sm:px-5 md:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 py-3">
        <Link href="/" className="shrink-0 text-lg font-black text-ink sm:text-xl">
          Conference<span className="text-broadcast">Hype</span>
        </Link>
        <nav className="flex items-center gap-1">
          <span className="hidden sm:inline-flex">{item("conferences", "/", "Conferences")}</span>
          {item("live", "/live", "Live")}
          <Link
            href="/request-coverage"
            className={`px-2 py-2 text-[11px] font-black uppercase tracking-wide sm:px-3 sm:text-xs ${
              active === "request" ? "bg-ink text-white" : "bg-broadcast text-white"
            }`}
          >
            <span className="sm:hidden">Request</span>
            <span className="hidden sm:inline">Request coverage</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function RequestCoverageStrip() {
  return (
    <section className="border-y border-ink/10 bg-ink px-4 py-7 text-white sm:px-5 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-black">Running a conference?</h2>
          <p className="mt-1 text-sm font-semibold text-white/75">
            Ask ConferenceHype to cover it. Tell us the meeting, the dates, and where the program is published.
          </p>
        </div>
        <Link
          href="/request-coverage"
          className="inline-flex min-h-12 items-center justify-center bg-broadcast px-5 py-3 text-sm font-black uppercase text-white"
        >
          Request coverage
        </Link>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
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
  );
}
