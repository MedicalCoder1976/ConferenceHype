// One-time seed for the first real Meeting Watch broadcasts: ASH 2025
// highlights from The ASCO Post, split into two 30-minute episodes
// (Leukemia; Lymphoma/Myelofibrosis/Myeloma). Per the approved plan, this
// bootstraps generation directly from the 23 articles two research agents
// already fetched, deduped, and verified against ascopost.com -- it skips
// re-running live discovery for this first batch (deadline risk), but does
// exercise the real generateCardsFromSource -> saveGeneratedSegmentsToDb ->
// meeting_watch_broadcasts -> render pipeline end to end.
// Static imports are hoisted above any top-level statement (including
// loadEnvConfig below) even under tsx's transform, so anything that reads
// process.env at module scope (lib/env.ts, imported transitively by all of
// these) must be dynamically imported *after* loadEnvConfig runs, not
// statically imported here.
import { loadEnvConfig } from "@next/env";
import type { IngestedItem } from "@/lib/types";

loadEnvConfig(process.cwd());

const SOURCE_URL = "https://ascopost.com/issues/february-25-2026-supplement-ash-meeting-highlights-2025/";
const MEETING_LABEL = "ASH 2025";

type ArticleSeed = {
  title: string;
  url: string;
  author: string;
  facts: string;
  cardCount: number;
};

const leukemiaArticles: ArticleSeed[] = [
  {
    title: "CLL17: Fixed-Duration vs Continuous Treatment in Previously Untreated CLL",
    url: "https://www.ascopost.com/issues/february-25-2026-supplement-ash-meeting-highlights-2025/in-head-to-head-comparison-fixed-duration-treatment-noninferior-to-continuous-for-previously-untreated-cll/",
    author: "Caroline Helwick",
    cardCount: 3,
    facts:
      "CLL17 phase III trial compared venetoclax-obinutuzumab, venetoclax-ibrutinib, and continuous ibrutinib in 909 treatment-naive CLL patients, median age 66; 7.6% had del(17p)/TP53-mutated disease, 56.5% unmutated IGHV, 19.2% complex karyotype; median observation 34.2 months. " +
      "3-year progression-free survival was 81.1% with venetoclax-obinutuzumab, 79.4% with venetoclax-ibrutinib, and 81.1% with continuous ibrutinib (hazard ratios 0.87 and 0.84); 3-year overall survival was 91.5%, 96.0%, and 95.7% respectively. " +
      "Overall response rate was 84.2%/88.5%/86.0% with complete response 51.5%/46.2%/8.3%; undetectable MRD was 73.3%/47.2%/0%. There were 22 fatal infections (12 COVID-19) with venetoclax-obinutuzumab; infections affected about 80% of patients overall."
  },
  {
    title: "BRUIN CLL-313: Pirtobrutinib vs Bendamustine/Rituximab in Front-Line CLL/SLL",
    url: "https://www.ascopost.com/issues/february-25-2026-supplement-ash-meeting-highlights-2025/pirtobrutinib-improves-progression-free-survival-vs-bendamustinerituximab-in-front-line-cllsll/",
    author: "Julia Cipriano, MS, CMPP",
    cardCount: 3,
    facts:
      "BRUIN CLL-313 is the first prospective randomized phase III trial of a noncovalent BTK inhibitor in treatment-naive CLL/SLL: 282 patients randomized 1:1 to pirtobrutinib 200 mg daily or bendamustine/rituximab (6 IV cycles). " +
      "24-month progression-free survival was 93.4% with pirtobrutinib vs 70.7% with bendamustine/rituximab (hazard ratio 0.20, P<.0001, an 80% risk reduction); 24-month overall survival was 97.8% vs 93.0% (hazard ratio 0.26, P=.0261); overall response rate was 94.3% vs 80.9-82.3%. " +
      "Grade 3+ adverse events occurred in 40.0% vs 67.4% of patients; bleeding occurred in 25.7% vs 1.5%; atrial fibrillation/flutter rates were comparable (1.4% vs 1.5%); dose reductions occurred in 3.6% vs 31.1%."
  },
  {
    title: "BRUIN CLL-314: Pirtobrutinib Matches/Beats Ibrutinib in BTK-Inhibitor-Naive CLL",
    url: "https://www.ascopost.com/news/january-2026/early-results-show-pirtobrutinib-matches-ibrutinib-in-btk-inhibitor-naive-cll/",
    author: "Caroline Helwick",
    cardCount: 3,
    facts:
      "BRUIN CLL-314 randomized 662 BTK-inhibitor-naive CLL patients (225 treatment-naive, 437 relapsed/refractory) to pirtobrutinib 200 mg or ibrutinib 420 mg. " +
      "Intent-to-treat overall response rate was 87.0% with pirtobrutinib vs 78.5% with ibrutinib (P=.0035); treatment-naive overall response rate was 92.9% vs 85.8%; 18-month progression-free survival (intent-to-treat) was 86.9% vs 82.3% (hazard ratio 0.569, P=.0034), and in the treatment-naive subgroup 95.3% vs 87.6% (hazard ratio 0.239). " +
      "Pirtobrutinib had lower rates of atrial fibrillation/flutter, especially in patients 75 and older; Richter transformation occurred in 1 patient on pirtobrutinib vs 4 on ibrutinib; pirtobrutinib also had fewer dose reductions and discontinuations."
  },
  {
    title: "PARADIGM Trial: Azacitidine Plus Venetoclax Confirmed in AML",
    url: "https://www.ascopost.com/issues/february-25-2026-supplement-ash-meeting-highlights-2025/benefit-of-azacitidine-plus-venetoclax-confirmed-in-aml/",
    author: "Caroline Helwick",
    cardCount: 3,
    facts:
      "The PARADIGM phase II trial randomized 172 previously untreated, transplant-eligible AML patients (median age 64) across 9 U.S. academic centers to azacitidine plus venetoclax vs intensive chemotherapy (7+3 or CPX-351). " +
      "Median event-free survival was 14.5 months with azacitidine-venetoclax vs 6.2 months with intensive chemotherapy (hazard ratio 0.57, P=.0021, a 43% risk reduction); overall response rate was 88% vs 62%; composite remission rate was 81% vs 55%; transplant rate was 61% vs 40%. " +
      "Grade 3+ infections occurred in 20.8% vs 15.1%; bleeding in 6.3% vs 1.3%; ICU admission in 0% vs 9.8%; the azacitidine-venetoclax arm had significantly better quality of life (P=.001)."
  },
  {
    title: "Inferior Survival Among Black Patients With AML, Independent of Cytogenetic Risk",
    url: "https://www.ascopost.com/news/march-2026/study-finds-inferior-survival-among-black-patients-with-aml-independent-of-cytogenetic-risk/",
    author: "Julia Cipriano, MS, CMPP",
    cardCount: 2,
    facts:
      "A pooled analysis of 10 ECOG-ACRIN phase II/III trials from 1984-2019 (ASH abstract 290) compared 3,469 White and 184 Black AML patients. Black patients were diagnosed younger (mean age 47.9 vs 53.5, P<.001); Black race independently predicted worse overall survival (hazard ratio 1.21, P=.0383) and disease-free survival (hazard ratio 1.31, P=.017) despite similar complete-response rates (58.2% vs 57.5%). " +
      "Among transplanted patients, allogeneic transplant rates were 37.1% for Black patients vs 48.5% for White patients (P<.001); in the NPM1-mutated subgroup, overall survival was 8.9 months for Black patients vs 19.1 months for White patients (P=.0095)."
  },
  {
    title: "GIMEMA ALL2820: Chemotherapy-Free Regimen in Front-Line Ph-Positive ALL",
    url: "https://www.ascopost.com/issues/february-25-2026-supplement-ash-meeting-highlights-2025/gimema-all2820-chemotherapy-free-regimen-studied-in-front-line-setting/",
    author: "Caroline Helwick",
    cardCount: 3,
    facts:
      "GIMEMA ALL2820 is a phase III trial that randomized 236 adults with Philadelphia chromosome-positive ALL, 2:1, to ponatinib plus blinatumomab (158 patients) vs imatinib plus chemotherapy (78 patients); median follow-up was 23.4 months. " +
      "Complete response rate was 94.3% with ponatinib-blinatumomab vs 79.4% with imatinib-chemotherapy (P=.004); MRD-negative rate was 70.9% vs 48.7% (P<.001). " +
      "Event-free survival was 90% vs 74% (P=.0015); overall survival was 94% vs 77% (P=.00071); deaths occurred in 4.7% vs 8.0% of patients."
  },
  {
    title: "MRD as a Surrogate Endpoint in AML: A Pooled Analysis",
    url: "https://www.ascopost.com/news/december-2025/new-pooled-analysis-strengthens-case-for-mrd-as-surrogate-endpoint-in-aml/",
    author: "The ASCO Post Staff",
    cardCount: 2,
    facts:
      "A pooled analysis across the AMLSG 09-09, HOVON-SAKK, SAL, and UK-NCRI AML17 trials (HARMONY Alliance), covering 1,858 patients, found MRD positivity independently predicts worse outcomes (hazard ratio 1.66, P<.001), with an overall odds ratio of 0.39 for the MRD-overall-survival association. " +
      "A flow-cytometry-based trial-level surrogacy analysis (n=1,268) found R-squared of 0.91 overall and 0.99 in nontransplanted patients specifically -- clearing the R-squared greater than 0.8 threshold generally used to validate a clinical trial surrogate endpoint."
  },
  {
    title: "EndRAD Trial: Non-Total-Body-Irradiation Conditioning for MRD-Negative B-ALL",
    url: "https://www.ascopost.com/news/december-2025/non-total-body-irradiation-conditioning-regimen-for-young-patients-with-mrd-negative-b-all/",
    author: "The ASCO Post Staff",
    cardCount: 3,
    facts:
      "The EndRAD trial (PTCTC ONC1701) enrolled 51 B-ALL patients ages 1 to 31, median transplant age 13.5; 86% received a busulfan/fludarabine/thiotepa conditioning regimen instead of total body irradiation, with diverse donor sources (41% matched sibling, 33% mismatched/haploidentical). " +
      "2-year event-free survival was 76.3%; 2-year overall survival was 82%; transplant-related mortality was 2% at day 100. " +
      "Acute graft-versus-host disease occurred in 39% of patients (25% grade 3-4); chronic graft-versus-host disease occurred in 25%; relapse occurred in 6 patients."
  },
  {
    title: "Financial Hardship in Families of Children With ALL",
    url: "https://www.ascopost.com/news/december-2025/one-in-three-families-of-children-with-all-face-financial-hardship-during-treatment/",
    author: "The ASCO Post Staff",
    cardCount: 2,
    facts:
      "A Dana-Farber study (ALL 16-001, ASH abstract 710, presenter Daniel Zheng, MD) followed 422 families of children with ALL. At 6 months, 19.3% of families reported trouble covering basic living expenses, and 20.3% had lost 25% or more of household income. " +
      "By 24 months (end of chemotherapy), 30% of families could not maintain essential living costs and 31.5% had lost 25% or more of income -- nearly a quarter of families that were initially financially fine later struggled."
  },
  {
    title: "ACCESS Study: Cyclophosphamide Strategy for Broadly Mismatched Donor Transplant",
    url: "https://www.ascopost.com/news/december-2025/cyclophosphamide-based-strategy-enables-safe-transplant-from-broadly-mismatched-donors/",
    author: "The ASCO Post Staff",
    cardCount: 2,
    facts:
      "The ACCESS study (NMDP-sponsored, ASH abstract 936) used a post-transplant cyclophosphamide-based strategy to enable transplant from broadly mismatched donors in 268 adults. 1-year overall survival was 79% for 7/8 HLA-matched donors vs 86% for 4-6/8-matched donors; relapse rates were 17% vs 23%. " +
      "Black patients have only a 29% likelihood of finding a fully matched unrelated donor, compared with 89% for non-Hispanic White patients -- this strategy is designed to widen the usable donor pool for patients who can't find a full match."
  },
  {
    title: "CD123-Targeting Antibody-Drug Conjugate Shows Activity in AML",
    url: "https://www.ascopost.com/news/december-2025/cd123-targeting-adc-shows-activity-in-aml-and-bpdcn/",
    author: "The ASCO Post Staff",
    cardCount: 1,
    facts:
      "A triplet of pivekimab sunirine (a CD123-targeting antibody-drug conjugate) plus venetoclax and azacitidine, led by Naval Daver, MD, was studied in 49 older, chemotherapy-ineligible, CD123-positive AML patients. 63.3% achieved complete response and 79.6% achieved complete response with incomplete count recovery, at a median follow-up of 10 months; 8 patients were bridged to transplant."
  },
  {
    title: "Abbreviated Azacitidine Regimen Improves Outcomes in Lower-Risk MDS",
    url: "https://www.ascopost.com/news/december-2025/abbreviated-azacitidine-regimen-improves-outcomes-in-lower-risk-mds/",
    author: "Wendy LaGrego",
    cardCount: 1,
    facts:
      "A study (ASH abstract 487, presenter Dr. Ian Bouligny of MD Anderson) of 247 lower-risk MDS patients (151 transfusion-dependent, 96 transfusion-independent, median age 70.8) found a 5-day azacitidine regimen improved event-free survival and overall survival compared with 3-day regimens, with no added toxicity. Overall response rate was 48% in transfusion-dependent patients and 70% in transfusion-independent patients."
  }
];

const lymphomaMyelomaArticles: ArticleSeed[] = [
  {
    title: "EPCORE FL-1: Epcoritamab Plus R2 in Follicular Lymphoma",
    url: "https://www.ascopost.com/issues/february-25-2026-supplement-ash-meeting-highlights-2025/epcoritamab-plus-r2-in-follicular-lymphoma-a-potential-new-treatment-standard/",
    author: "Caroline Helwick",
    cardCount: 3,
    facts:
      "EPCORE FL-1 is a phase III trial of 488 relapsed/refractory follicular lymphoma patients randomized to epcoritamab-bysp plus lenalidomide/rituximab (R2) vs R2 alone, for up to 12 cycles; about 60% had one prior line of therapy and about 20% had prior bendamustine. " +
      "16-month progression-free survival was 85.5% with epcoritamab-R2 vs 40.2% with R2 alone (hazard ratio 0.21, P<.0001); overall response rate was 95% vs 79%; complete response rate was 83% vs 50%; overall survival hazard ratio was 0.38 (P=.0039). " +
      "Cytokine release syndrome occurred in 35% of the epcoritamab arm vs under 1% of the R2-alone arm, mostly grade 1 with step-up dosing; epcoritamab is given subcutaneously and can be administered outpatient. Dr. Falchi called the data compelling enough to make epcoritamab-R2 a benchmark for standard of care; epcoritamab received FDA approval for this indication in November 2025."
  },
  {
    title: "TRANSCEND FL: Third-Line Lisocabtagene Maraleucel in Follicular Lymphoma",
    url: "https://www.ascopost.com/news/december-2025/follicular-lymphoma-durable-remissions-and-sustained-safety-with-third-line-lisocabtagene-maraleucel/",
    author: "The ASCO Post Staff",
    cardCount: 2,
    facts:
      "TRANSCEND FL treated 107 safety-evaluable and 103 efficacy-evaluable follicular lymphoma patients with third-line (or later) lisocabtagene maraleucel, after at least 2 prior lines including an anti-CD20 antibody and an alkylating agent; median follow-up was 41.5 months. " +
      "At 3 years, overall response rate was 97%, complete response rate was 94%, duration of response was 70%, progression-free survival was 68%, and overall survival was 86%. Grade 3 cytokine release syndrome occurred in 1% of patients, grade 3 neurotoxicity in 2%, grade 3+ infections in 12%, and second malignancy in 10%."
  },
  {
    title: "INCA033989: Mutant Calreticulin-Specific Monoclonal Antibody in Myelofibrosis",
    url: "https://www.ascopost.com/issues/february-25-2026-supplement-ash-meeting-highlights-2025/early-results-demonstrate-safety-and-efficacy-of-mutant-calreticulin-specific-monoclonal-antibody-in-myelofibrosis/",
    author: "Julia Cipriano, MS, CMPP",
    cardCount: 3,
    facts:
      "INCA033989-101/-102 is a phase I trial of INCA033989, a first-in-class mutant calreticulin-specific monoclonal antibody, in 52 monotherapy patients and 20 combination (plus ruxolitinib) patients with CALR exon 9-mutated myelofibrosis who were JAK-inhibitor resistant, intolerant, or ineligible. " +
      "In the monotherapy group, 41.7% achieved 25% or greater spleen volume reduction at week 24, and 33.3% achieved 35% or greater reduction; 93.3% had symptom improvement; anemia response was 56% (n=25). " +
      "In the combination group (with ruxolitinib), 50% achieved 25% or greater spleen volume reduction and 81.3% had symptom improvement; 89.4% of evaluable patients (n=47) had a reduction in mutant calreticulin variant allele frequency, suggesting disease-modifying activity."
  },
  {
    title: "ASH 2025 Myelofibrosis Roundup: Treatment Landscape Is Poised for Change",
    url: "https://www.ascopost.com/news/march-2026/myelofibrosis-treatment-landscape-is-poised-for-change/",
    author: "Caroline Helwick",
    cardCount: 4,
    facts:
      "MANIFEST-2 96-week update: pelabresib plus ruxolitinib vs ruxolitinib alone in 430 myelofibrosis patients found spleen volume reduction of 35% or more (SVR35) in 91.5% vs 57.5%; total symptom score improvement of 50% or more (TSS50) in 37% vs 28%; fibrosis improvement in 52.5% vs 27.5%; progression-free-survival-event rate 10.3% vs 15.7%. " +
      "The RESTORE trial of elritercept plus ruxolitinib in 38 myelofibrosis patients (about 60% transfusion-dependent) found transfusion independence lasting 12 weeks or more in 45%, a 50% or greater transfusion reduction in 65%, and symptom reduction in 90%. " +
      "A real-world Medicare study of 2,268 ruxolitinib-treated myelofibrosis patients found median treatment duration of 3.1 years, with 69% treatment-naive at start; transfusion rate declined from 70% to 52% between months 0-3 and months 10-12; 91% of patients had dose changes. " +
      "A study comparing stem cell transplant vs continuous ruxolitinib in 71 myelofibrosis patients found 3-year event-free survival of 75% vs 44% and relapse of 18% vs 56%; Dr. Gagelmann noted allogeneic transplantation remains the only curative treatment option for myelofibrosis."
  },
  {
    title: "First Human Study of In Vivo CAR T in Myeloma (KLN-1010)",
    url: "https://www.ascopost.com/issues/february-25-2026-supplement-ash-meeting-highlights-2025/early-findings-from-first-human-study-of-in-vivo-car-t-in-myeloma/",
    author: "Caroline Helwick",
    cardCount: 2,
    facts:
      "The inMMyCAR phase I first-in-human trial of KLN-1010, an in vivo CAR T-cell therapy, targets 20 total participants in multiple myeloma; the first 4 patients reported all had high-risk cytogenetics, at dose levels of 2x10^7 IU/kg (3 patients) and 6x10^6 IU/kg (1 patient). " +
      "All 4 patients achieved MRD-negative status within 1 month; CAR-positive T cells made up 22% to 85% of CD3-positive T cells by day 15; there were no cases of ICANS (immune effector cell-associated neurotoxicity syndrome), and 3 patients had grade 1-2 cytokine release syndrome."
  },
  {
    title: "Anitocabtagene Autoleucel (iMMagine-1) in Multiple Myeloma",
    url: "https://www.ascopost.com/news/december-2025/experimental-car-t-cell-therapy-shows-high-efficacy-and-a-favorable-safety-profile-in-multiple-myeloma/",
    author: "Wendy LaGrego",
    cardCount: 2,
    facts:
      "The iMMagine-1 trial treated 117 heavily pretreated multiple myeloma patients (median 3 prior lines of therapy) with anitocabtagene autoleucel, an experimental CAR T-cell therapy; overall response rate was 97% and complete response rate was 68%. " +
      "Progression-free survival was 79% at 12 months and 66% at 18 months; overall survival was 95% at 12 months and 90% at 18 months. Grade 3+ neutropenia occurred in 66% of patients; only 1 severe cytokine release syndrome case was reported. A phase III trial is now underway (sponsored by Arcellx)."
  },
  {
    title: "MajesTEC-3: Teclistamab Plus Daratumumab in Previously Treated Multiple Myeloma",
    url: "https://www.ascopost.com/issues/february-25-2026-supplement-ash-meeting-highlights-2025/majestec-3-unprecedented-benefit-in-previously-treated-multiple-myeloma/",
    author: "Caroline Helwick",
    cardCount: 3,
    facts:
      "MajesTEC-3 randomized 587 multiple myeloma patients with 1-3 prior lines of therapy to teclistamab-cqyv plus daratumumab and hyaluronidase-fihj vs investigator's-choice daratumumab triplet regimens; median follow-up was 34.5 months. " +
      "The teclistamab-daratumumab combination reduced the risk of progression or death by 83% and the risk of death by 54% (progression-free-survival hazard ratio 0.17, P<.0001); 36-month progression-free survival was 83.4% vs 29.7%; 36-month overall survival was 83.3% vs 65.0%. " +
      "Complete-response-or-better rate was 81.8% vs 31.1%; MRD-negativity (at the 10^-5 threshold) was 89.3% vs 63.0%; cytokine release syndrome was all grade 1-2 and resolved; treatment-related deaths were 15.9% in the teclistamab-daratumumab arm vs 33.1% in the comparator arm."
  },
  {
    title: "RedirecTT-1: Dual Antigen Targeting of Drug-Resistant Extramedullary Myeloma",
    url: "https://www.ascopost.com/news/january-2026/dual-antigen-targeting-of-drug-resistant-extramedullary-myeloma/",
    author: "Matthew Stenger",
    cardCount: 3,
    facts:
      "RedirecTT-1 treated 90 patients with drug-resistant extramedullary multiple myeloma, median 4 prior lines of therapy (range 1-10), with talquetamab 0.8 mg/kg plus teclistamab 3.0 mg/kg given biweekly. " +
      "Partial response or better occurred in 79% of patients (71 of 90), very good partial response or better in 70%, and complete response or better in 54%; median duration of response was 13.8 months (64% still ongoing at 12 months); median progression-free survival was 15.4 months; 12-month overall survival was 74%. " +
      "Grade 3/4 adverse events occurred in 76% of patients; neutropenia in 62%; grade 3/4 infections in 31% (higher than either drug given alone); cytokine release syndrome in 78% (all grade 1-2); there were 5 treatment-related deaths."
  },
  {
    title: "OLYMPIA-3: First Results of Odronextamab Plus CHOP in Untreated DLBCL",
    url: "https://www.ascopost.com/issues/february-25-2026/first-results-of-phase-iii-olympia-3-odronextamab-plus-chop-in-untreated-dlbcl/",
    author: "Caroline Helwick",
    cardCount: 2,
    facts:
      "OLYMPIA-3 Part 1A is a dose-escalation study of odronextamab plus CHOP chemotherapy in 22 treatment-naive diffuse large B-cell lymphoma patients (9 at the 80 mg dose, 13 at the 160 mg dose); median age was 66 and 95% had stage III-IV disease. " +
      "At the 160 mg dose, overall response rate was 100% and complete response rate was 100%; at the 80 mg dose, overall response rate was 78% and complete response rate was 44%. Grade 3-4 neutropenia occurred in 77.3% of patients; cytokine release syndrome in 54.5% (all grade 1-2); infections in 81.8% (31.8% grade 3, 9.1% grade 4)."
  },
  {
    title: "Lymphocyte Kinetics After CAR T-Cell Infusion Predict Survival in Non-Hodgkin Lymphoma",
    url: "https://www.ascopost.com/news/december-2025/lymphocyte-kinetics-after-car-t-infusion-predict-survival-outcomes-in-non-hodgkin-lymphoma/",
    author: "The ASCO Post Staff",
    cardCount: 1,
    facts:
      "A single-center retrospective study of 45 non-Hodgkin lymphoma patients treated with axicabtagene ciloleucel (October 2018 to November 2023) found that above-median absolute lymphocyte count (ALC) at leukapheresis predicted progression-free survival not reached vs 10.1 months (P=.0179), and above-median 10-day ALC expansion predicted an 87% complete response rate vs 59% (P=.0472). Overall cytokine release syndrome occurred in 71% of patients and ICANS in 31%."
  },
  {
    title: "CD40 Overexpression as a Potential Biomarker for Angioimmunoblastic T-Cell Lymphoma",
    url: "https://www.ascopost.com/news/december-2025/cd40-overexpression-emerges-as-a-potential-biomarker-for-angioimmunoblastic-t-cell-lymphoma/",
    author: "Wendy LaGrego",
    cardCount: 1,
    facts:
      "Single-cell RNA sequencing plus the COMET platform, applied to 14 angioimmunoblastic T-cell lymphoma (AITL) samples vs 3 reactive lymph node samples (ASH abstract 555, led by Francisco Vega, MD, PhD of MD Anderson), found CD40 elevated across two distinct microenvironmental patterns and in patient-derived xenograft models, and identified a first-reported 'T follicular-regulatory program' phenotype with FOXP3 co-expression. No prognostic biomarkers currently exist for AITL; this is translational/biomarker-discovery research, not a treatment-efficacy result."
  }
];

function toSource(article: ArticleSeed): IngestedItem {
  return {
    id: `ash2025-${article.url}`,
    title: article.title,
    url: article.url,
    excerpt: article.facts,
    sourceName: "The ASCO Post",
    author: article.author,
    sourceType: "media",
    rank: 2,
    publishedAt: new Date().toISOString()
  };
}

async function generateEpisodeSegments(articles: ArticleSeed[], episodeLabel: string) {
  const { generateCardsFromSource } = await import("@/lib/generation/llm");
  const allSegments = [];
  for (const article of articles) {
    console.log(`Generating ${article.cardCount} card(s) for: ${article.title}`);
    const source = toSource(article);
    const cards = await generateCardsFromSource({
      source,
      cardCount: article.cardCount,
      meetingLabel: MEETING_LABEL
    });
    for (const card of cards) {
      console.log(`  - ${card.title}\n    ${card.script.slice(0, 160)}...`);
    }
    allSegments.push(...cards);
  }
  console.log(`${episodeLabel}: generated ${allSegments.length} cards from ${articles.length} articles.`);
  return allSegments;
}

async function main() {
  const { saveGeneratedSegmentsToDb, updateSegmentDecisionInDb } = await import("@/lib/db");
  const { createMeetingWatchBroadcastInDb } = await import("@/lib/meetingWatch/db");

  const leukemiaSegments = await generateEpisodeSegments(leukemiaArticles, "Leukemia episode");
  const lymphomaSegments = await generateEpisodeSegments(lymphomaMyelomaArticles, "Lymphoma/Myeloma/Myelofibrosis episode");

  const savedLeukemia = await saveGeneratedSegmentsToDb(leukemiaSegments);
  const savedLymphoma = await saveGeneratedSegmentsToDb(lymphomaSegments);
  if (!savedLeukemia || !savedLymphoma) {
    throw new Error("Supabase is not configured -- cannot save generated segments.");
  }

  for (const segment of [...savedLeukemia, ...savedLymphoma]) {
    await updateSegmentDecisionInDb({ segmentId: segment.id, action: "approve", script: segment.script });
  }
  console.log(`Approved ${savedLeukemia.length + savedLymphoma.length} segments.`);

  const easternStart = process.argv[2] ?? "2026-07-27T12:00:00.000Z"; // 8:00 AM America/New_York (EDT, UTC-4)
  const episode2Start = new Date(new Date(easternStart).getTime() + 30 * 60 * 1000).toISOString();

  const broadcast1 = await createMeetingWatchBroadcastInDb({
    sourceUrl: SOURCE_URL,
    meetingLabel: MEETING_LABEL,
    specialty: "Oncology",
    episodeIndex: 0,
    episodeCount: 2,
    title: "ConferenceHype: ASH 2025 Leukemia Highlights - Pirtobrutinib, CLL17 & Venetoclax Breakthroughs",
    description: `Studies covered: BRUIN CLL-313; CLL17; GIMEMA ALL2820.

This ConferenceHype broadcast recaps leukemia highlights from the 2025 ASH Annual Meeting -- chronic lymphocytic leukemia, acute myeloid leukemia, and acute lymphoblastic leukemia data, source-attributed for physicians, NPs, and PAs following the literature.

Source: The ASCO Post, "ASH Meeting Highlights 2025" supplement (February 25, 2026).

Watch now on our YouTube channel.

#ASH2025 #Leukemia #CLL #AML #Hematology #ConferenceHype`,
    cardIds: savedLeukemia.map((segment) => segment.id),
    startsAt: easternStart
  });

  const broadcast2 = await createMeetingWatchBroadcastInDb({
    sourceUrl: SOURCE_URL,
    meetingLabel: MEETING_LABEL,
    specialty: "Hematology",
    episodeIndex: 1,
    episodeCount: 2,
    title: "ConferenceHype: ASH 2025 Highlights - Teclistamab, Epcoritamab & Myeloma Breakthroughs",
    description: `Studies covered: MajesTEC-3; INCA033989; KLN-1010.

This ConferenceHype broadcast recaps lymphoma, myelofibrosis, and multiple myeloma highlights from the 2025 ASH Annual Meeting, source-attributed for physicians, NPs, and PAs following the literature.

Source: The ASCO Post, "ASH Meeting Highlights 2025" supplement (February 25, 2026).

Watch now on our YouTube channel.

#ASH2025 #MultipleMyeloma #Lymphoma #Myelofibrosis #Hematology #ConferenceHype`,
    cardIds: savedLymphoma.map((segment) => segment.id),
    startsAt: episode2Start
  });

  console.log("Created meeting_watch_broadcasts:", broadcast1?.id, broadcast1?.startsAt);
  console.log("Created meeting_watch_broadcasts:", broadcast2?.id, broadcast2?.startsAt);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
