import Link from "next/link";
import { monitoredSocialTags } from "@/lib/sources/registry";

export const metadata = {
  title: "Terms and Conditions | ASCO Hype",
  description: "Terms, restrictions, and disclaimers for ASCO Hype."
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-paper px-5 py-8 md:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm font-bold text-broadcast">
          Back to ASCO Hype
        </Link>
        <h1 className="mt-5 text-4xl font-black text-ink md:text-6xl">
          Terms and Conditions
        </h1>
        <p className="mt-4 text-lg leading-8 text-ink/72">
          These terms explain how ASCO Hype should and should not be used.
          Accessing the site, stream, clips, or topic-suggestion tags means you
          agree to these restrictions.
        </p>

        <section className="mt-8 grid gap-5">
          <TermBlock title="AI commentary only">
            ASCO Hype is interactive AI commentary. It is not reporting,
            journalism, medical education, clinical guidance, scientific
            validation, legal advice, or financial advice. Content may be
            generated, summarized, transformed, translated, or voiced by AI.
          </TermBlock>

          <TermBlock title="No ASCO affiliation">
            ASCO Hype is not associated with, endorsed by, sponsored by, or
            affiliated with the American Society of Clinical Oncology in any
            way. ASCO and related meeting names belong to their respective
            owners.
          </TermBlock>

          <TermBlock title="No medical or clinical reliance">
            Do not use ASCO Hype to make medical, treatment, diagnostic,
            research, patient-care, or clinical decisions. Always consult
            official conference materials, original publications, qualified
            clinicians, and other primary sources.
          </TermBlock>

          <TermBlock title="No financial reliance">
            Market-watch or company commentary is for general discussion only.
            It is not investment advice and must not be used to buy, sell, hold,
            short, or value any security, company, token, fund, or financial
            instrument.
          </TermBlock>

          <TermBlock title="Topic suggestions and social posts">
            Posts using {monitoredSocialTags.primaryHashtag},{" "}
            {monitoredSocialTags.secondaryHashtag},{" "}
            {monitoredSocialTags.conferenceHashtag}, or{" "}
            {monitoredSocialTags.botHandle}, or tagging{" "}
            {monitoredSocialTags.conferenceHypeHandle} may be considered as
            topic suggestions or end-of-day audience items. Steps, workouts,
            walks, runs, and gym-session posts may be mentioned only after
            review. Tagging ASCO Hype does not guarantee coverage, accuracy,
            approval, publication, compensation, or response.
          </TermBlock>

          <TermBlock title="User content restrictions">
            Do not submit private medical information, confidential conference
            material, copyrighted material you do not have rights to share,
            defamatory claims, harassment, spam, impersonation, unlawful content,
            or personal data about another person.
          </TermBlock>

          <TermBlock title="Source and accuracy limits">
            ASCO Hype may reference public posts, links, headlines, abstracts,
            media items, company statements, and audience suggestions. Social
            posts are treated as conversation signals, not confirmed facts.
            Content may be incomplete, delayed, mistaken, or outdated.
          </TermBlock>

          <TermBlock title="Availability">
            The stream, site, clips, and automation may pause, fail, change, or
            stop at any time. Emergency overrides and fallback loops may replace
            normal programming.
          </TermBlock>
        </section>
      </div>
    </main>
  );
}

function TermBlock({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-ink/10 bg-white p-5 shadow-panel">
      <h2 className="text-xl font-black text-ink">{title}</h2>
      <p className="mt-2 leading-7 text-ink/70">{children}</p>
    </section>
  );
}
