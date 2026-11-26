# Trending Story checklist

For a story picked from X Trending (or any news item with no meeting). First run: Kymera KT-621 BROADEN2, 2026-11-25.

## 1. Treat the trending page as a lead
- X Trending summaries are written by Grok from posts and say they "may evolve". Every number is unconfirmed until a primary source states it.
- Primary sources, in order: the company or sponsor press release (its own site or a GlobeNewswire/Business Wire copy), the journal paper, ClinicalTrials.gov, the regulator (FDA/EMA).
- Read each post on the page for leads and caveats only (example: a post pointing out the mid dose beat the high dose). Check every lead against the primary source.

## 2. Leave out
- Stock moves, offerings, analyst or investor praise, market size. They are not clinical facts and sit close to financial advice.
- Company plans (Phase 3 timing, filings) only as an attributed sentence: "Kymera says it plans ...". Never as a prediction.
- Cross-trial claims ("matches biologics") only as the company's claim, with the "no head-to-head study" caveat.

## 3. Add
- Earlier readouts for the same drug or trial (Phase 1, topline, published), labelled as earlier.
- Design facts that set the strength: randomized or not, blinded, placebo or active comparator, size, length, peer reviewed or company-reported.
- The caveats that matter: dose response, follow-up length, subgroup or post hoc results.

## 4. Package
- Headline: `TRENDING: <Company's drug + plain-language hook with the real number>` (example: "TRENDING: Kymera's Eczema Pill KT-621 ..."). Name the company early, and in the thumbnail when it fits. Production keeps it as is, with no number. The whole title must be 100 characters or fewer.
- The video joins the "Trending in Medicine <Year>" series: earlier trending videos are linked in the description and added to the playlist.
- `topic`: the disease (for example "Atopic Dermatitis"). It drives the opening-slide label. Never use the company or drug as the topic.
- `sourceUrl`: the press release (the company's own page, or a syndicated copy you could read).
- Narrative: thesis first, the subscribe line, then the trial result, the safety, the earlier readout, the caveats and an evidence ranking. End with the AI and not-medical-advice disclaimer. Use no series callback and no "Links to every earlier update" line.
- Thumbnail: a short phrase with the key number.

## 5. Publish, same day
- `npx tsx scripts/publish-story.ts <story.json>` (dry run), then `--publish --wait`.
- Check the opening-slide label locally with buildClinicalEvidencePackaging.
- Write X posts to `docs/x-posts/`. Label: the short hook (for example "Eczema Pill KT-621:"). Tags: the company and CEO handles seen on the trending page, the lead investigator's institution, disease hashtags and the next related meeting's hashtag. Use 280 characters or fewer, and end each post with the YouTube CTA.
