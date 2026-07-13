export const defaultDisclaimer =
  "ConferenceHype is interactive AI commentary only. It is not reporting, journalism, medical education, clinical guidance, scientific validation, legal advice, or financial advice.";

// Shared source of truth for the spoken on-air disclaimer card, used by both
// the hourly broadcast (scripts/render-hour-broadcast.ts) and the 30-minute
// single-journal show (lib/rundown/slots.ts) -- kept here, not duplicated in
// either, so the two formats can never drift to different disclaimer text.
export const broadcastDisclaimer = `${defaultDisclaimer} ConferenceHype is independent and is not affiliated with conference organizers, presenters, sponsors, or exhibitors.`;

export function withSpokenDisclaimer(script: string) {
  return script;
}
