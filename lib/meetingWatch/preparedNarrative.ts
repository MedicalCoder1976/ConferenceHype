import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Segment } from "@/lib/types";
import { assertMeetingNameAndYear, cleanMeetingWatchCopy, meetingWatchCaption, meetingWatchSpecialistAlert, PROHIBITED_MEETING_WATCH_COPY } from "@/lib/meetingWatch/packaging";

const preparedOverridesSchema = z.object({
  title: z.string().trim().min(10).max(150).optional(),
  thumbnailStatement: z.string().trim().min(8).max(120).optional()
}).optional();
export type PreparedNarrativeOverrides = z.infer<typeof preparedOverridesSchema>;

const turnSchema = z.object({ speaker: z.enum(["HOST_1", "HOST_2"]), text: z.string().trim().min(1) });
const packageSchema = z.object({
  schema_version: z.literal("conferencehype_prepared_broadcast_v1"), status: z.literal("ready"),
  content_type: z.enum(["INDIVIDUAL_RESEARCH", "REVIEW_ARTICLE", "CONFERENCE_ROUNDUP", "OPINION_COMMENTARY", "TREATMENT_ALGORITHM"]),
  source: z.object({ publication: z.string().trim().min(1), article_title: z.string().trim().min(1), url: z.string().url(), publication_date: z.string().optional().default(""), authors: z.array(z.string()).optional().default([]) }),
  program: z.object({ conference_name: z.string().optional().default(""), specialty: z.string().optional().default(""), title: z.string().trim().min(1).max(150), thumbnail_headline: z.string().trim().min(1), description_opening: z.string().trim().min(1), studies_covered: z.array(z.string()).default([]), estimated_spoken_words: z.number().optional(), estimated_duration_minutes: z.number().optional(), recommended_presenter_format: z.string().optional() }),
  opening_hook: z.object({ visible_text: z.string().trim().min(1), speaker_turns: z.array(turnSchema).min(1), source_anchor: z.string().trim().min(1) }),
  cards: z.array(z.object({ position: z.number().int().positive(), title: z.string().trim().min(1), card_type: z.string().trim().min(1), visible_text: z.string().trim().min(1), speaker_turns: z.array(turnSchema).min(1), source_anchor: z.string().trim().min(1), source_url: z.string().url().optional(), source_label: z.string().trim().optional(), pharma_companies: z.array(z.string().trim().min(1)).optional().default([]), study_name: z.string().optional().default(""), reported_numbers: z.array(z.string()).optional().default([]), limitations: z.array(z.string()).optional().default([]) })).min(5),
  transitions: z.array(z.object({ after_card_position: z.number().int().positive(), duration_seconds: z.number().int().min(10).max(60), next_topic: z.string().default("") })).default([]),
  disclaimer: z.object({ after_card_position: z.number().int().nonnegative(), text: z.string().trim().min(1) }),
  closing: z.object({ speaker_turns: z.array(turnSchema).min(1) }),
  chapters: z.array(z.object({ card_position: z.number().int().positive(), title: z.string().trim().min(1) })).default([]),
  youtube_tags: z.array(z.string()).default([]), quality_report: z.record(z.string(), z.unknown()).optional()
});
export type PreparedNarrativePackage = z.infer<typeof packageSchema>;

const fiveNewsSchema = z.object({
  schema_version: z.enum(["conferencehype_meeting_watch_five_news_v1", "conferencehype_meeting_watch_story_v2"]),
  status: z.literal("ready"),
  meeting: z.object({
    name: z.string().trim().min(2),
    year: z.number().int().min(2020).max(2100),
    dates: z.string().trim().min(1),
    specialty: z.string().trim().min(2),
    eye_catching_topic: z.string().trim().min(8),
    specialist_alert: z.string().trim().optional()
  }),
  story: z.object({
    thesis: z.string().trim().min(20),
    opening_hook: z.string().trim().min(250),
    closing_synthesis: z.string().trim().min(250)
  }).optional(),
  news_items: z.array(z.object({
    position: z.number().int().min(1).max(5),
    headline: z.string().trim().min(5),
    visible_text: z.string().trim().min(10).max(260),
    bridge_from_previous: z.string().trim().optional().default(""),
    narration: z.string().trim().min(250),
    primary_source_url: z.string().url(),
    source_label: z.string().trim().min(2),
    abstract_number: z.string().trim().optional().default(""),
    study_name: z.string().trim().optional().default(""),
    pharma_companies: z.array(z.string().trim().min(1)).default([]),
    reported_numbers: z.array(z.string()).default([]),
    limitations: z.array(z.string()).default([])
  })).length(5),
  disclaimer: z.string().trim().min(20),
  closing: z.string().trim().min(20).optional(),
  quality_report: z.record(z.string(), z.unknown()).optional()
}).superRefine((value, context) => {
  const positions = value.news_items.map((item) => item.position);
  if (positions.join(",") !== "1,2,3,4,5") context.addIssue({ code: "custom", path: ["news_items"], message: "News items must be numbered 1 through 5 in order." });
  if (new Set(value.news_items.map((item) => item.primary_source_url)).size !== 5) context.addIssue({ code: "custom", path: ["news_items"], message: "The five news items must use five distinct primary-source URLs." });
  if (!value.news_items.some((item) => item.pharma_companies.length > 0)) context.addIssue({ code: "custom", path: ["news_items"], message: "Include at least one source-supported pharma company attribution across the five news items." });
  value.news_items.forEach((item, index) => {
    const minimumWords = value.schema_version === "conferencehype_meeting_watch_story_v2" ? 90 : 55;
    if (item.narration.split(/\s+/).length < minimumWords) context.addIssue({ code: "custom", path: ["news_items", index, "narration"], message: `Each news narration needs at least ${minimumWords} words.` });
    if (value.schema_version === "conferencehype_meeting_watch_story_v2" && item.bridge_from_previous.split(/\s+/).length < 8) context.addIssue({ code: "custom", path: ["news_items", index, "bridge_from_previous"], message: "Every story item needs a narrative bridge of at least 8 words." });
  });
  if (value.schema_version === "conferencehype_meeting_watch_story_v2" && !value.story) context.addIssue({ code: "custom", path: ["story"], message: "The continuous-story package requires a story thesis, opening hook, and closing synthesis." });
  if (value.schema_version === "conferencehype_meeting_watch_five_news_v1" && !value.closing) context.addIssue({ code: "custom", path: ["closing"], message: "The legacy five-news package requires a closing." });
});

const fullNarrativeSchema = z.object({
  schema_version: z.literal("conferencehype_meeting_watch_full_narrative_v3"),
  status: z.literal("ready"),
  meeting: z.object({
    name: z.string().trim().min(2), year: z.number().int().min(2020).max(2100), dates: z.string().trim().min(1),
    specialty: z.string().trim().min(2), eye_catching_topic: z.string().trim().min(8), specialist_alert: z.string().trim().optional()
  }),
  opening_hook: z.string().trim().min(120),
  abstracts: z.array(z.object({
    position: z.number().int().min(1).max(10), headline: z.string().trim().min(5), visible_text: z.string().trim().min(10).max(260),
    narration: z.string().trim().min(100), primary_source_url: z.string().url(), source_label: z.string().trim().min(2),
    abstract_number: z.string().trim().optional().default(""), study_name: z.string().trim().optional().default(""),
    pharma_companies: z.array(z.string().trim().min(1)).default([]), reported_numbers: z.array(z.string()).default([]), limitations: z.array(z.string()).default([])
  })).min(5).max(10),
  disclaimer: z.string().trim().min(20), closing: z.string().trim().min(80), quality_report: z.record(z.string(), z.unknown()).optional()
}).superRefine((value, context) => {
  const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
  const normalizedWords = (text: string) => text.toLowerCase().replace(/['’]s\b/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const meetingWords = normalizedWords(value.meeting.name).filter((word) => word.length > 2 && !["the", "and", "for", "iaslc"].includes(word));
  const hookWordSet = new Set(normalizedWords(value.opening_hook));
  const meetingIdentityPresent = meetingWords.length > 0 && meetingWords.filter((word) => hookWordSet.has(word)).length / meetingWords.length >= 0.75;
  const dateWords = normalizedWords(value.meeting.dates);
  const dateContextPresent = dateWords.some((word) => /^(?:january|february|march|april|may|june|july|august|september|october|november|december)$/.test(word) && hookWordSet.has(word))
    && dateWords.some((word) => /^\d{1,2}$/.test(word) && hookWordSet.has(word));
  const hookWords = wordCount(value.opening_hook);
  if (hookWords < 30 || hookWords > 120) context.addIssue({ code: "custom", path: ["opening_hook"], message: "The opening hook must contain 30-120 spoken words." });
  if (!meetingIdentityPresent || (!new RegExp(`\\b${value.meeting.year}\\b`).test(value.opening_hook) && !dateContextPresent)) context.addIssue({ code: "custom", path: ["opening_hook"], message: "The opening hook must identify the meeting and either its year or meeting dates." });
  const supportedCompanies = [...new Set(value.abstracts.flatMap((item) => item.pharma_companies))];
  const namedCompanies = supportedCompanies.filter((company) => value.opening_hook.toLowerCase().includes(company.toLowerCase()));
  if (namedCompanies.length < 2) context.addIssue({ code: "custom", path: ["opening_hook"], message: "The opening hook must name at least two pharma companies that are attributed in the abstract sources." });
  if (/^(?:hook|introduction|meeting watch)\s*[:\-]/i.test(value.opening_hook)) context.addIssue({ code: "custom", path: ["opening_hook"], message: "Narration must begin with the hook itself, not a section label." });
  const positions = value.abstracts.map((item) => item.position);
  if (positions.some((position, index) => position !== index + 1)) context.addIssue({ code: "custom", path: ["abstracts"], message: "Abstracts must be numbered consecutively from 1 in their narration order." });
  const abstractIdentities = value.abstracts.map((item) => normalizedWords(item.abstract_number || item.study_name || item.headline).join(" "));
  if (abstractIdentities.some((identity, index) => !identity || abstractIdentities.indexOf(identity) !== index)) context.addIssue({ code: "custom", path: ["abstracts"], message: "Every abstract must identify a distinct abstract number, study, or source-grounded headline." });
  const abstractsByUrl = new Map<string, typeof value.abstracts>();
  value.abstracts.forEach((item) => abstractsByUrl.set(item.primary_source_url, [...(abstractsByUrl.get(item.primary_source_url) ?? []), item]));
  for (const items of abstractsByUrl.values()) {
    if (items.length > 1 && items.some((item) => !item.abstract_number.trim() && !item.study_name.trim())) context.addIssue({ code: "custom", path: ["abstracts"], message: "When one primary source supports multiple abstracts, each item must provide a distinct abstract_number or study_name." });
  }
  value.abstracts.forEach((item, index) => {
    const words = wordCount(item.narration);
    if (words < 30 || words > 65) context.addIssue({ code: "custom", path: ["abstracts", index, "narration"], message: "Each abstract narration must contain 30-65 spoken words." });
    if (/^(?:abstract|number|item|host)\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)?\s*[:.\-]/i.test(item.narration)) context.addIssue({ code: "custom", path: ["abstracts", index, "narration"], message: "Abstract narration must start naturally, without a section, number, or host label." });
  });
  const disclaimerWords = wordCount(value.disclaimer);
  if (disclaimerWords < 15 || disclaimerWords > 35) context.addIssue({ code: "custom", path: ["disclaimer"], message: "The disclaimer must contain 15-35 spoken words." });
  const closingWords = wordCount(value.closing);
  if (closingWords < 20 || closingWords > 50) context.addIssue({ code: "custom", path: ["closing"], message: "The closing must contain 20-50 spoken words." });
  const spokenWords = hookWords + value.abstracts.reduce((sum, item) => sum + wordCount(item.narration), 0) + disclaimerWords + closingWords;
  const voicedSegments = value.abstracts.length + 2;
  const transitionSeconds = (value.abstracts.length + 1) * 16;
  const estimatedSeconds = Math.ceil(spokenWords / 1.8) + voicedSegments * 5 + transitionSeconds + 30;
  if (spokenWords > 600 || estimatedSeconds > 600) context.addIssue({ code: "custom", path: ["abstracts"], message: `The complete script plus music is estimated at ${estimatedSeconds} seconds; reduce it to 600 seconds or less.` });
});

function fiveNewsToPreparedPackage(input: z.infer<typeof fiveNewsSchema>): PreparedNarrativePackage {
  const meetingLabel = assertMeetingNameAndYear(
    new RegExp(`\\b${input.meeting.year}\\b`).test(input.meeting.name)
      ? input.meeting.name
      : `${input.meeting.name} ${input.meeting.year}`
  );
  const alert = input.meeting.specialist_alert?.trim() || meetingWatchSpecialistAlert(input.meeting.specialty);
  const supportedCompanies = [...new Set(input.news_items.flatMap((item) => item.pharma_companies))];
  const title = meetingWatchCaption(meetingLabel, input.meeting.specialty, input.meeting.eye_catching_topic, supportedCompanies);
  const fallbackThumbnail = `${alert}: ${supportedCompanies.slice(0, 3).join(", ")} - Five ${input.meeting.specialty} Updates`;
  const thumbnailHeadline = input.meeting.eye_catching_topic.length <= 120
    ? input.meeting.eye_catching_topic
    : fallbackThumbnail.length <= 120
      ? fallbackThumbnail
      : `${alert}: Five ${input.meeting.specialty} Updates`;
  const first = input.news_items[0];
  const continuousStory = input.schema_version === "conferencehype_meeting_watch_story_v2";
  const storyOpening = input.story ? `${input.story.thesis} ${input.story.opening_hook}` : `${alert}. Here are five meeting news and abstract updates physicians should know.`;
  const storyClosing = input.story?.closing_synthesis ?? input.closing ?? "Comment with the abstract or company update we should cover next and subscribe.";
  return packageSchema.parse({
    schema_version: "conferencehype_prepared_broadcast_v1",
    status: "ready",
    content_type: "CONFERENCE_ROUNDUP",
    source: { publication: meetingLabel, article_title: "Five Meeting News Updates", url: first.primary_source_url, publication_date: input.meeting.dates, authors: [] },
    program: { conference_name: meetingLabel, specialty: input.meeting.specialty, title, thumbnail_headline: thumbnailHeadline, description_opening: `${title}. Conference dates: ${input.meeting.dates}. Five source-attributed news and abstract updates from ${meetingLabel}.`, studies_covered: input.news_items.map((item) => item.study_name || item.headline) },
    opening_hook: { visible_text: `${meetingLabel} — ${input.meeting.dates} — ${alert}`, speaker_turns: [{ speaker: "HOST_1", text: `${meetingLabel}, held ${input.meeting.dates}. ${storyOpening}` }], source_anchor: `${meetingLabel} official meeting coverage` },
    cards: input.news_items.map((item) => ({ position: item.position, title: item.headline, card_type: "MEETING_NEWS", visible_text: item.visible_text, speaker_turns: [{ speaker: item.position % 2 ? "HOST_1" : "HOST_2", text: continuousStory ? `${item.bridge_from_previous} ${item.narration}` : `Number ${["one", "two", "three", "four", "five"][item.position - 1]}. ${item.headline}. ${item.narration}` }], source_anchor: [item.source_label, item.abstract_number, ...item.pharma_companies].filter(Boolean).join(" | "), source_url: item.primary_source_url, source_label: item.source_label, pharma_companies: item.pharma_companies, study_name: item.study_name, reported_numbers: item.reported_numbers, limitations: item.limitations })),
    transitions: continuousStory ? [] : input.news_items.slice(0, 4).map((item) => ({ after_card_position: item.position, duration_seconds: 20, next_topic: input.news_items[item.position]?.headline ?? meetingLabel })),
    disclaimer: { after_card_position: 5, text: input.disclaimer },
    closing: { speaker_turns: [{ speaker: "HOST_2", text: `${meetingLabel}. ${storyClosing}` }] },
    chapters: input.news_items.map((item) => ({ card_position: item.position, title: item.headline })),
    youtube_tags: [meetingLabel, input.meeting.specialty, alert, ...input.news_items.flatMap((item) => item.pharma_companies)],
    quality_report: input.quality_report
  });
}

function fullNarrativeToPreparedPackage(input: z.infer<typeof fullNarrativeSchema>): PreparedNarrativePackage {
  const meetingLabel = assertMeetingNameAndYear(new RegExp(`\\b${input.meeting.year}\\b`).test(input.meeting.name) ? input.meeting.name : `${input.meeting.name} ${input.meeting.year}`);
  const alert = input.meeting.specialist_alert?.trim() || meetingWatchSpecialistAlert(input.meeting.specialty);
  const supportedCompanies = [...new Set(input.abstracts.flatMap((item) => item.pharma_companies))];
  const title = meetingWatchCaption(meetingLabel, input.meeting.specialty, input.meeting.eye_catching_topic, supportedCompanies, input.abstracts.length);
  const fallbackThumbnail = `${alert}: ${supportedCompanies.slice(0, 3).join(", ")} - ${input.abstracts.length} ${input.meeting.specialty} Abstracts`;
  const thumbnailHeadline = input.meeting.eye_catching_topic.length <= 120 ? input.meeting.eye_catching_topic : fallbackThumbnail.length <= 120 ? fallbackThumbnail : `${alert}: ${input.abstracts.length} Meeting Abstracts`;
  const first = input.abstracts[0];
  return packageSchema.parse({
    schema_version: "conferencehype_prepared_broadcast_v1", status: "ready", content_type: "CONFERENCE_ROUNDUP",
    source: { publication: meetingLabel, article_title: `${input.abstracts.length} Meeting Abstracts`, url: first.primary_source_url, publication_date: input.meeting.dates, authors: [] },
    program: { conference_name: meetingLabel, specialty: input.meeting.specialty, title, thumbnail_headline: thumbnailHeadline, description_opening: `${title}. Conference dates: ${input.meeting.dates}. ${input.abstracts.length} source-attributed abstracts from ${meetingLabel}.`, studies_covered: input.abstracts.map((item) => item.study_name || item.headline) },
    opening_hook: { visible_text: `${meetingLabel} — ${input.meeting.dates} — ${alert}`, speaker_turns: [{ speaker: "HOST_1", text: input.opening_hook }], source_anchor: `${meetingLabel} opening synthesis` },
    cards: input.abstracts.map((item) => ({ position: item.position, title: item.headline, card_type: "MEETING_ABSTRACT", visible_text: item.visible_text, speaker_turns: [{ speaker: item.position % 2 ? "HOST_2" : "HOST_1", text: item.narration }], source_anchor: [item.source_label, item.abstract_number, ...item.pharma_companies].filter(Boolean).join(" | "), source_url: item.primary_source_url, source_label: item.source_label, pharma_companies: item.pharma_companies, study_name: item.study_name, reported_numbers: item.reported_numbers, limitations: item.limitations })),
    transitions: input.abstracts.map((item) => ({ after_card_position: item.position, duration_seconds: 16, next_topic: input.abstracts[item.position]?.headline ?? "Closing synthesis" })),
    disclaimer: { after_card_position: input.abstracts.length, text: input.disclaimer },
    closing: { speaker_turns: [{ speaker: "HOST_1", text: input.closing }] },
    chapters: input.abstracts.map((item) => ({ card_position: item.position, title: item.headline })),
    youtube_tags: [meetingLabel, input.meeting.specialty, alert, ...supportedCompanies],
    quality_report: { ...input.quality_report, meeting_watch_full_narrative_v3: true }
  });
}

export function parsePreparedNarrative(raw: string, overridesInput?: PreparedNarrativeOverrides) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON broadcast package was found.");
  const candidate = JSON.parse(raw.slice(start, end + 1));
  const isFullNarrative = candidate?.schema_version === "conferencehype_meeting_watch_full_narrative_v3";
  const isFiveNews = candidate?.schema_version === "conferencehype_meeting_watch_five_news_v1" || candidate?.schema_version === "conferencehype_meeting_watch_story_v2";
  const inputResult = isFullNarrative ? fullNarrativeSchema.safeParse(candidate) : isFiveNews ? fiveNewsSchema.safeParse(candidate) : packageSchema.safeParse(candidate);
  if (!inputResult.success) {
    const detail = inputResult.error.issues.map((issue) => `${issue.path.join(".") || "package"}: ${issue.message}`).join("; ");
    throw new Error(`Prepared package validation failed: ${detail}`);
  }
  const parsed = isFullNarrative ? fullNarrativeToPreparedPackage(inputResult.data as z.infer<typeof fullNarrativeSchema>) : isFiveNews ? fiveNewsToPreparedPackage(inputResult.data as z.infer<typeof fiveNewsSchema>) : inputResult.data as PreparedNarrativePackage;
  const overrides = preparedOverridesSchema.parse(overridesInput);
  if (overrides?.title) {
    if (new RegExp(PROHIBITED_MEETING_WATCH_COPY.source, "i").test(overrides.title)) throw new Error("The title cannot use generic evidence labels.");
    const title = overrides.title.replace(/\s+/g, " ").trim();
    const meetingLabel = parsed.program.conference_name || parsed.source.publication;
    if (!isFullNarrative && !title.toLowerCase().startsWith(meetingLabel.toLowerCase())) throw new Error(`The title must start with ${meetingLabel}.`);
    if (!isFullNarrative && !title.includes(meetingWatchSpecialistAlert(parsed.program.specialty))) throw new Error(`The title must include ${meetingWatchSpecialistAlert(parsed.program.specialty)}.`);
    parsed.program.title = title;
  }
  if (overrides?.thumbnailStatement) {
    if (new RegExp(PROHIBITED_MEETING_WATCH_COPY.source, "i").test(overrides.thumbnailStatement)) throw new Error("The thumbnail statement cannot use generic evidence labels.");
    parsed.program.thumbnail_headline = cleanMeetingWatchCopy(overrides.thumbnailStatement);
  }
  const positions = parsed.cards.map((card) => card.position);
  if (new Set(positions).size !== positions.length) throw new Error("Card positions must be unique.");
  const positionOrdered = [...parsed.cards].sort((a, b) => a.position - b.position);
  const conversations = new Map<string, typeof positionOrdered>();
  const conversationKeyByOldPosition = new Map<number, string>();
  for (const card of positionOrdered) {
    const normalizedStudy = card.study_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const conversationKey = isFullNarrative ? `standalone:${card.position}` : normalizedStudy ? `study:${normalizedStudy}` : `standalone:${card.position}`;
    conversationKeyByOldPosition.set(card.position, conversationKey);
    const conversation = conversations.get(conversationKey) ?? [];
    conversation.push(card);
    conversations.set(conversationKey, conversation);
  }
  const groupedCards = [...conversations.values()].flat();
  const trialOrderNormalized = groupedCards.some((card, index) => card.position !== positionOrdered[index]?.position);
  const newPositionByOld = new Map(groupedCards.map((card, index) => [card.position, index + 1]));
  const lastPositionByConversation = new Map<string, number>();
  groupedCards.forEach((card, index) => {
    const key = conversationKeyByOldPosition.get(card.position);
    if (key) lastPositionByConversation.set(key, index + 1);
  });
  const remapConversationBoundary = (oldPosition: number) => {
    const key = conversationKeyByOldPosition.get(oldPosition);
    if (key?.startsWith("study:")) return lastPositionByConversation.get(key) ?? newPositionByOld.get(oldPosition) ?? oldPosition;
    return newPositionByOld.get(oldPosition) ?? oldPosition;
  };
  parsed.cards = groupedCards.map((card, index) => ({ ...card, position: index + 1 }));
  const transitionByBoundary = new Map<number, (typeof parsed.transitions)[number]>();
  for (const transition of parsed.transitions) {
    const boundary = remapConversationBoundary(transition.after_card_position);
    const existing = transitionByBoundary.get(boundary);
    transitionByBoundary.set(boundary, existing && existing.duration_seconds >= transition.duration_seconds ? existing : { ...transition, after_card_position: boundary });
  }
  parsed.transitions = [...transitionByBoundary.values()].sort((a, b) => a.after_card_position - b.after_card_position);
  parsed.disclaimer.after_card_position = remapConversationBoundary(parsed.disclaimer.after_card_position);
  parsed.chapters = parsed.chapters
    .map((chapter) => ({ ...chapter, card_position: newPositionByOld.get(chapter.card_position) ?? chapter.card_position }))
    .sort((a, b) => a.card_position - b.card_position);
  const spokenWords = [...parsed.opening_hook.speaker_turns, ...parsed.cards.flatMap((card) => card.speaker_turns), ...parsed.closing.speaker_turns].reduce((sum, turn) => sum + turn.text.trim().split(/\s+/).length, 0);
  const transitionSeconds = parsed.transitions.reduce((sum, item) => sum + item.duration_seconds, 0);
  const disclaimerWords = parsed.disclaimer.text.trim().split(/\s+/).length;
  // Five-news Meeting Watch uses the same measured, continuous narration pace
  // as a prepared Story. Budget every voiced segment plus a conservative lead
  // and closing allowance so the frame never drops item five or the disclaimer.
  const voicedSegmentCount = parsed.opening_hook.speaker_turns.length + parsed.cards.reduce((sum, card) => sum + card.speaker_turns.length, 0) + parsed.closing.speaker_turns.length + 1;
  const measuredStorySeconds = Math.ceil((spokenWords + disclaimerWords) / 1.8) + voicedSegmentCount * 5;
  const estimatedSeconds = isFiveNews || isFullNarrative
    ? measuredStorySeconds + transitionSeconds + (isFullNarrative ? 16 : 0) + 30
    : Math.ceil((spokenWords + disclaimerWords) / 2.1) + transitionSeconds + 15;
  const durationSeconds = Math.max(300, Math.min(7200, Math.ceil(estimatedSeconds / 15) * 15));
  if (isFullNarrative && durationSeconds > 600) throw new Error(`The complete Meeting Watch narration plus music is ${durationSeconds} seconds; the maximum is 600 seconds.`);
  const sourceHash = createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
  return { package: parsed, spokenWords, transitionSeconds, durationSeconds, sourceHash, trialOrderNormalized, preambleRemoved: raw.slice(0, start).trim().length > 0 };
}

const HOSTS = { HOST_1: { id: "echo-sage", name: "TumorCrusher" }, HOST_2: { id: "luna-vale", name: "Luna Vale" } } as const;

// Same fix as evidenceDashboard.ts's stripSlideDescriptors (2026-07-30): these
// patterns are meant to strip a leading label/host prefix only. Unanchored,
// they also deleted the same words when they legitimately occurred mid-text
// -- here that risk is worse than a slide title, since this runs on spoken
// narration (e.g. "...concludes our journal coverage for today" would have
// silently lost "journal coverage" from the audio script).
function stripPreparedDescriptors(value: string) {
  return value
    .replace(/^(?:Tumor\s*Crusher|Luna Vale)\b\s*(?:\/|:|-)?\s*/gi, "")
    .replace(/^(?:Media Watch|Pharma Watch|Journal Coverage|Conference Coverage)\s*[:\-–—]?\s*/gi, "")
    .replace(/^A new ASCO Educational Book review\b\s*[:\-–—]?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function openingAttribution(pkg: PreparedNarrativePackage) {
  const authorText = pkg.source.authors.length
    ? ` by ${pkg.source.authors.join(", ")}`
    : "";
  return `We are reviewing "${pkg.source.article_title}"${authorText}, published in ${pkg.source.publication}.`;
}
export function preparedNarrativeSegments(pkg: PreparedNarrativePackage): Segment[] {
  const now = new Date().toISOString();
  const isFullNarrative = pkg.quality_report?.meeting_watch_full_narrative_v3 === true;
  let sequence = 0;
  const result: Segment[] = [];
  const pushTurns = (turns: Array<z.infer<typeof turnSchema>>, input: { title: string; visibleText: string; sourceAnchor: string; sourceUrl?: string; sourceLabel?: string; flags: string[]; transitionSeconds?: number }) => {
    turns.forEach((turn, turnIndex) => {
      const host = HOSTS[turn.speaker];
      sequence += 1;
      result.push({
        id: `draft-${randomUUID()}`, title: stripPreparedDescriptors(input.title), summary: stripPreparedDescriptors(input.visibleText), script: input.flags.includes("prepared_disclaimer") ? stripPreparedDescriptors(turn.text) : stripPreparedDescriptors(turn.text).replaceAll(pkg.disclaimer.text, "").trim(),
        contentType: "media_roundup", personaId: host.id, personaName: host.name, hypeLevel: "restrained", language: "English", status: "approved",
        citations: [{ label: input.sourceLabel || input.sourceAnchor || `${pkg.source.publication}: ${pkg.source.article_title}${pkg.source.authors.length ? ` - ${pkg.source.authors.join(", ")}` : ""}`, url: input.sourceUrl || pkg.source.url, sourceType: "media" }], socialBuzzItems: [],
        riskFlags: ["meeting_watch", "prepared_narrative", `prepared_sequence:${String(sequence).padStart(4, "0")}`, `source_anchor:${input.sourceAnchor.slice(0, 180)}`, ...input.flags, ...(turnIndex === turns.length - 1 && input.transitionSeconds ? [`prepared_transition:${input.transitionSeconds}`] : [])],
        confidenceScore: 95, createdAt: now, approvedAt: now, updatedAt: now
      });
    });
  };
  const openingTurns = pkg.opening_hook.speaker_turns.map((turn, index) => ({
    ...turn,
    text: isFullNarrative
      ? stripPreparedDescriptors(turn.text)
      : index === 0
      ? `${openingAttribution(pkg)} ${stripPreparedDescriptors(turn.text)}`
      : stripPreparedDescriptors(turn.text)
  }));
  pushTurns(openingTurns, { title: pkg.program.thumbnail_headline, visibleText: pkg.opening_hook.visible_text, sourceAnchor: pkg.opening_hook.source_anchor, flags: ["prepared_opening", "prepared_card:0", ...(isFullNarrative ? ["meeting_watch_full_narrative"] : [])], transitionSeconds: isFullNarrative ? 16 : undefined });
  for (const [cardIndex, card] of pkg.cards.entries()) {
    const studyKey = card.study_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const nextStudyKey = pkg.cards[cardIndex + 1]?.study_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ?? "";
    const transition = studyKey && studyKey === nextStudyKey ? undefined : pkg.transitions.find((item) => item.after_card_position === card.position)?.duration_seconds;
    pushTurns(card.speaker_turns, { title: card.title, visibleText: card.visible_text, sourceAnchor: card.source_anchor, sourceUrl: card.source_url, sourceLabel: card.source_label, flags: [`prepared_card:${card.position}`, `prepared_type:${card.card_type}`, ...(card.card_type === "MEETING_NEWS" ? ["meeting_watch_five_news", `meeting_watch_companies:${card.pharma_companies.join(", ")}`] : []), ...(card.card_type === "MEETING_ABSTRACT" ? ["meeting_watch_five_news", "meeting_watch_full_narrative", "meeting_watch_narrative_abstract", `meeting_watch_companies:${card.pharma_companies.join(", ")}`] : []), ...(studyKey ? [`prepared_study:${studyKey}`] : [])], transitionSeconds: transition });
    if (!isFullNarrative && pkg.disclaimer.after_card_position === card.position) pushTurns([{ speaker: "HOST_1", text: pkg.disclaimer.text }], { title: "Important ConferenceHype notice", visibleText: pkg.disclaimer.text, sourceAnchor: "Prepared broadcast disclaimer", flags: ["prepared_disclaimer", `prepared_card:${card.position}.5`] });
  }
  const closingTurns = isFullNarrative ? pkg.closing.speaker_turns.map((turn, index) => ({ ...turn, text: `${index === 0 ? `${pkg.disclaimer.text} ` : ""}${turn.text}` })) : pkg.closing.speaker_turns;
  pushTurns(closingTurns, { title: "What the evidence leaves unanswered", visibleText: "The ConferenceHype deep dive concludes with the principal finding, limitations, and the most important unanswered question.", sourceAnchor: "Prepared narrative closing synthesis", flags: ["prepared_closing", ...(isFullNarrative ? ["prepared_disclaimer", "meeting_watch_full_narrative"] : []), `prepared_card:${pkg.cards.length + 1}`] });
  return result;
}
