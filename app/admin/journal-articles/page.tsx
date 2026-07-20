import Link from "next/link";
import { hasSupabase } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type JournalRelation = { name?: string | null } | Array<{ name?: string | null }> | null;

type SyncStateRow = {
  journal_id: string;
  status: string;
  articles_found: number;
  cards_eligible: number;
  cards_created: number;
  awaiting_abstract: number;
  excluded: number;
  last_completed_at?: string | null;
  oncology_journals?: JournalRelation;
};

type ArticleRow = {
  id: string;
  pmid: string;
  title: string;
  publication_date?: string | null;
  eligibility_status: string;
  eligibility_reason: string;
  source_url: string;
  card_segment_id?: string | null;
  oncology_journals?: JournalRelation;
};

function journalName(relation?: JournalRelation) {
  return Array.isArray(relation) ? relation[0]?.name : relation?.name;
}
async function loadLedger() {
  if (!hasSupabase()) return { states: [], articles: [], error: "Database is not configured." };
  const supabase = createAdminClient();
  const [stateResult, articleResult] = await Promise.all([
    supabase
      .from("journal_article_sync_state")
      .select("*,oncology_journals(name,specialty)")
      .order("updated_at", { ascending: false }),
    supabase
      .from("journal_articles")
      .select("id,pmid,title,publication_date,publication_types,eligibility_status,eligibility_reason,source_url,quality_report,card_segment_id,updated_at,oncology_journals(name)")
      .order("updated_at", { ascending: false })
      .limit(250)
  ]);
  const error = stateResult.error?.message ?? articleResult.error?.message;
  return { states: stateResult.data ?? [], articles: articleResult.data ?? [], error };
}

export default async function JournalArticlesPage() {
  const { states, articles, error } = await loadLedger();
  return (
    <main className="min-h-screen bg-paper px-5 py-8 text-ink">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-broadcast">PubMed-first inventory</p>
            <h1 className="mt-1 text-4xl font-black">Journal article reconciliation</h1>
            <p className="mt-2 max-w-3xl text-sm text-ink/65">Every PubMed article must have an accountable state. This page does not approve, schedule, render, or publish cards.</p>
          </div>
          <Link href="/admin" className="border border-ink/20 bg-white px-4 py-2 text-sm font-black">Back to admin</Link>
        </div>
        {error ? <div className="mt-6 border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-800">Ledger unavailable: {error}. Apply the journal article ledger migration before running shadow inventory.</div> : null}
        <section className="mt-8 overflow-x-auto border border-ink/10 bg-white shadow-panel">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-ink text-white"><tr>{["Journal","Status","Found","Eligible","Created","Awaiting","Excluded","Last complete"].map((label) => <th key={label} className="px-3 py-3 font-black">{label}</th>)}</tr></thead>
            <tbody>{states.map((state: SyncStateRow) => <tr key={state.journal_id} className="border-t border-ink/10"><td className="px-3 py-3 font-bold">{journalName(state.oncology_journals) ?? state.journal_id}</td><td className="px-3 py-3">{state.status}</td><td className="px-3 py-3">{state.articles_found}</td><td className="px-3 py-3">{state.cards_eligible}</td><td className="px-3 py-3">{state.cards_created}</td><td className="px-3 py-3">{state.awaiting_abstract}</td><td className="px-3 py-3">{state.excluded}</td><td className="px-3 py-3">{state.last_completed_at ? new Date(state.last_completed_at).toLocaleString() : "—"}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="mt-8 space-y-3">
          <h2 className="text-2xl font-black">Recent article decisions</h2>
          {articles.map((article: ArticleRow) => <article key={article.id} className="border border-ink/10 bg-white p-4 shadow-panel"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-black uppercase text-broadcast">{journalName(article.oncology_journals)} · PMID {article.pmid}</p><h3 className="mt-1 font-black">{article.title}</h3></div><span className="h-fit border border-ink/15 px-2 py-1 text-xs font-black">{article.eligibility_status}</span></div><p className="mt-2 text-sm text-ink/65">{article.eligibility_reason}</p><div className="mt-3 flex flex-wrap gap-4 text-xs font-bold"><a className="text-broadcast underline" href={article.source_url} target="_blank" rel="noreferrer">PubMed record</a><span>{article.card_segment_id ? "Card linked" : "No card linked"}</span><span>{article.publication_date ?? "Date unavailable"}</span></div></article>)}
        </section>
      </div>
    </main>
  );
}