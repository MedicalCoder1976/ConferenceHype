import type { Metadata } from "next";
import Link from "next/link";
import { RequestCoverageStrip, SiteFooter, SiteHeader } from "@/components/SiteChrome";

export const metadata: Metadata = {
  title: "Meet the Team | ConferenceHype",
  description: "The people behind ConferenceHype's medical conference coverage, led by Editor in Chief Rehan Simpson.",
  alternates: { canonical: "/team" },
  openGraph: {
    title: "Meet the Team | ConferenceHype",
    description: "The people behind ConferenceHype's medical conference coverage, led by Editor in Chief Rehan Simpson.",
    type: "website"
  }
};

type TeamMember = {
  name: string;
  initials: string;
  role: string;
  affiliation: string;
  bio: string[];
};

const TEAM: TeamMember[] = [
  {
    name: "Rehan Simpson",
    initials: "RS",
    role: "Editor in Chief",
    affiliation: "Biomedical Engineering, Georgia Institute of Technology",
    bio: [
      "Rehan Simpson is the Editor in Chief of ConferenceHype and studies Biomedical Engineering at the Georgia Institute of Technology. Rehan sets the editorial standard for every video on the channel: which meetings and trials get covered, how each story is framed, and which headline goes out.",
      "Biomedical engineering sits where conference medicine happens, between the clinic, the lab and the data. That training shapes how Rehan reads a trial: what was measured, against what comparator, over how long, and what the result does and does not show. It is why ConferenceHype reports hazard ratios, follow-up times and safety findings alongside the headline number, and labels early or subgroup results as early.",
      "Rehan holds every script to one rule: each number has to trace back to a primary source, such as the abstract, the peer-reviewed paper, the trial registry or the sponsor's own release. Claims that cannot be checked are left out rather than guessed at, and every video sticks to what was actually reported instead of predicting what comes next."
    ]
  }
];

const STANDARDS = [
  {
    title: "Primary sources first",
    text: "Numbers come from abstracts, publications, registries and official releases, and the sources are linked in every video description."
  },
  {
    title: "No speculation",
    text: "Coverage reports what was presented or published. It does not forecast approvals, guideline changes or future results."
  },
  {
    title: "Dated and updatable",
    text: "Every video carries its publish date, because trial results, regulatory decisions and conference details can change at any time."
  }
];

export default function TeamPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader active="team" />
      <section className="hype-grid border-b border-ink/10 px-4 py-8 sm:px-5 md:px-8">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="text-xs font-black uppercase text-broadcast">
            All conferences
          </Link>
          <h1 className="mt-2 text-3xl font-black leading-tight text-ink md:text-5xl">Meet the team</h1>
          <p className="mt-3 max-w-2xl text-base font-semibold leading-7 text-ink/70">
            ConferenceHype turns medical meetings into short, source-linked video updates. These are the people who
            decide what gets covered and hold each update to the evidence.
          </p>

          <div className="mt-8 grid gap-6">
            {TEAM.map((member) => (
              <article key={member.name} className="grid gap-5 border border-ink/10 bg-white p-5 shadow-panel md:grid-cols-[160px_minmax(0,1fr)] md:p-7">
                <div
                  aria-hidden="true"
                  className="flex aspect-square w-28 items-center justify-center bg-ink text-3xl font-black text-white md:w-full"
                >
                  {member.initials}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-wide text-broadcast">{member.role}</p>
                  <h2 className="mt-1 text-2xl font-black text-ink md:text-3xl">{member.name}</h2>
                  <p className="mt-1 text-sm font-bold text-ink/60">{member.affiliation}</p>
                  <div className="mt-4 grid gap-3 text-sm leading-7 text-ink/80 md:text-base">
                    {member.bio.map((paragraph) => (
                      <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <h2 className="mt-10 text-xs font-black uppercase tracking-wide text-ink/55">Editorial standards</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            {STANDARDS.map((item) => (
              <div key={item.title} className="border border-ink/10 bg-white/80 p-4">
                <h3 className="text-base font-black text-ink">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-ink/70">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <RequestCoverageStrip />
      <SiteFooter />
    </main>
  );
}
