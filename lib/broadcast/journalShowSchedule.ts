// Scheduling constants for the 30-minute single-journal show format. Kept in
// a separate module from lib/broadcast/hourSchedule.ts on purpose --
// hourSchedule.ts's own comment history explains why its constants must
// never change to accommodate a new format: scheduledContentAt(index) pins
// already-approved cards' air times for the existing 60-minute hourly
// format, and changing the per-pair duration there would shift every one of
// those pinned timestamps. This format needs its own math from scratch.
//
// Cards are narrated in groups of 4, with a 45s music break after every
// group, and a 30s disclaimer added after every 2nd group (i.e. every 8
// cards). 75s/card is a starting budget for a ~30-minute, up-to-6-group show
// grounded in two things: (1) hourSchedule.ts's own history, where real
// cards averaged far less narration than their nominal slot and the fix was
// to raise card count specifically to cut down how much of the hour is
// music -- the same goal driving this format; (2) observed real card
// durations this session (64-90s per synthesized card in production logs).
// Treat it as tunable after the first real show, not a fixed requirement.
//
// Math at 5 groups (20 cards): 5*4*75 (content) + 5*45 (music) + 2*30
// (disclaimers after groups 2 and 4) = 1500 + 225 + 60 = 1785s, 15s under
// the 1800s target -- absorbed automatically by enforceOneHourFrame's
// existing pad-the-last-music-card behavior (scripts/render-hour-broadcast.ts).
// If more approved segments exist for the journal, buildJournalShowSlots
// optimistically builds up to JOURNAL_GROUPS_PER_SHOW groups and the same
// frame-enforcement trims from the end if over -- no separate count-picking
// logic needed here.
export const JOURNAL_SHOW_SECONDS = 1800;
export const JOURNAL_CONTENT_SECONDS = 75;
export const JOURNAL_MUSIC_SECONDS = 45;
export const JOURNAL_DISCLAIMER_SECONDS = 30;
export const JOURNAL_CARDS_PER_GROUP = 4;
export const JOURNAL_GROUPS_PER_SHOW = 6;
export const JOURNAL_DISCLAIMER_EVERY_N_GROUPS = 2;
// Spoken sign-off length when the journal runs out of approved segments
// before filling all JOURNAL_GROUPS_PER_SHOW groups. Operator request
// (2026-07-17, after a real show narrated 11 cards then went silent for the
// remaining ~15 minutes of trailing pad music with no explanation): say the
// segment is ending before handing off to that trailing music, instead of
// narration just stopping with no announcement.
export const JOURNAL_OUTRO_SECONDS = 25;
