import { createHmac, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { monitoredSocialTags } from "@/lib/sources/registry";
import { specialtyVoiceSeeds } from "@/lib/catalog/specialtyVoiceSeeds";
import type { SpecialtyXVoice } from "@/lib/types";

const MAX_TWEET_LENGTH = 280;
const MIN_TITLE_LENGTH = 20;
// X's pay-per-use pricing bills a post $0.20 (vs $0.015) whenever its text
// contains a URL -- deliberately never put a link in this text, even the
// YouTube link, to stay on the cheap tier. Point at the channel by name
// instead; the actual link belongs in the profile bio, set once, manually.
const WATCH_CTA = "Watch now on our YouTube channel.";

type SourcedCard = { sourceUrl?: string };

// RFC 3986 percent-encoding for OAuth1 -- encodeURIComponent under-escapes
// !*'() relative to what the OAuth1 spec requires.
function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!*'()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildOAuth1Header(method: string, url: string): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: env.X_API_KEY!,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: env.X_ACCESS_TOKEN!,
    oauth_version: "1.0"
  };

  // A JSON POST body is not part of the OAuth1 signature base string -- only
  // the oauth_* params themselves are signed here.
  const paramString = Object.keys(oauthParams)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(oauthParams[key])}`)
    .join("&");
  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(env.X_API_SECRET!)}&${percentEncode(env.X_ACCESS_TOKEN_SECRET!)}`;
  const signature = createHmac("sha1", signingKey).update(baseString).digest("base64");

  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
  const headerString = Object.keys(headerParams)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(headerParams[key])}"`)
    .join(", ");
  return `OAuth ${headerString}`;
}

function hasXCredentials(): boolean {
  return Boolean(env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_TOKEN_SECRET);
}

export async function postTweet({
  text,
  quoteTweetId
}: {
  text: string;
  quoteTweetId?: string;
}): Promise<{ id: string }> {
  const url = "https://api.x.com/2/tweets";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: buildOAuth1Header("POST", url),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      ...(quoteTweetId ? { quote_tweet_id: quoteTweetId } : {})
    })
  });
  if (!response.ok) {
    throw new Error(`X post failed: ${response.status} ${await response.text()}`);
  }
  const payload = (await response.json()) as { data?: { id: string } };
  if (!payload.data?.id) {
    throw new Error("X post response missing tweet id");
  }
  return { id: payload.data.id };
}

// Every specialty's own society/journal account, never an individual
// physician -- cold-tagging individuals reads as spam/harassment at
// automated scale. Prefers the live DB-ranked list (kept fresh by X
// engagement) and falls back to the static seed list when Supabase isn't
// configured or the lookup fails, same fallback pattern as lib/jobs/ingest.ts.
export async function resolveSpecialtyHandle(specialty?: string): Promise<{ label: string; handle: string } | undefined> {
  if (!specialty) {
    return undefined;
  }
  let candidates: Pick<SpecialtyXVoice, "specialty" | "label" | "handle" | "rank">[] = specialtyVoiceSeeds;
  try {
    const { getSpecialtyXVoicesFromDb } = await import("@/lib/db");
    const dbVoices = await getSpecialtyXVoicesFromDb();
    if (dbVoices) {
      candidates = dbVoices.filter((voice) => voice.enabled);
    }
  } catch {
    // Fall back to the static seed list below.
  }
  const matches = candidates
    .filter((voice) => voice.specialty === specialty)
    .sort((a, b) => a.rank - b.rank);
  return matches[0];
}

// If this broadcast's content was itself sourced from an X post, quote-tweet
// it instead of only linking the YouTube upload -- puts the announcement in
// front of that post's own audience.
export function findQuoteTweetId(cards: SourcedCard[]): string | undefined {
  for (const card of cards) {
    const match = card.sourceUrl?.match(/(?:x\.com|twitter\.com)\/(?:[A-Za-z0-9_]+\/status|i\/web\/status)\/(\d+)/);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

export function composeBroadcastTweetText({
  title,
  orgHandle,
  hashtags
}: {
  title: string;
  orgHandle?: string;
  hashtags: string[];
}): string {
  const buildText = (includeHandle: boolean, includeHashtags: string[], titleText: string) => {
    const tail = [includeHandle ? orgHandle : undefined, ...includeHashtags].filter(Boolean).join(" ");
    return [titleText, WATCH_CTA, tail].filter((line) => line && line.length > 0).join("\n");
  };

  let includeHandle = Boolean(orgHandle);
  let includeHashtags = hashtags;

  for (;;) {
    // Measure with a 1-char placeholder, not an empty title -- an empty
    // title line gets filtered out of buildText entirely, which silently
    // drops the newline that appears once a real (non-empty) title is
    // present, undercounting the budget by exactly 1.
    const fixedLength = buildText(includeHandle, includeHashtags, "X").length - 1;
    const titleBudget = MAX_TWEET_LENGTH - fixedLength;
    if (titleBudget >= Math.min(title.length, MIN_TITLE_LENGTH) || (!includeHandle && includeHashtags.length === 0)) {
      const truncatedTitle =
        title.length > titleBudget && titleBudget >= MIN_TITLE_LENGTH
          ? `${title.slice(0, titleBudget - 1).trimEnd()}…`
          : title;
      return buildText(includeHandle, includeHashtags, truncatedTitle);
    }
    if (includeHashtags.length > 0) {
      includeHashtags = includeHashtags.slice(0, -1);
    } else {
      includeHandle = false;
    }
  }
}

export async function postBroadcastTweetForBroadcast({
  title,
  cards,
  specialty
}: {
  title: string;
  cards: SourcedCard[];
  specialty?: string;
}): Promise<{ id: string; url: string } | undefined> {
  if (!hasXCredentials()) {
    return undefined;
  }

  const orgVoice = await resolveSpecialtyHandle(specialty);
  const quoteTweetId = findQuoteTweetId(cards);
  const text = composeBroadcastTweetText({
    title,
    orgHandle: orgVoice?.handle,
    hashtags: [monitoredSocialTags.primaryHashtag, monitoredSocialTags.conferenceHashtag]
  });

  const posted = await postTweet({ text, quoteTweetId });
  return { id: posted.id, url: `https://x.com/${monitoredSocialTags.botHandle.replace(/^@/, "")}/status/${posted.id}` };
}
