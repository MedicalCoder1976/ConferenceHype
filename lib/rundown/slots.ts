import type { Segment } from "@/lib/types";

export type BroadcastSlot = {
  at: Date;
  kind: "music" | "schedule" | "social" | "statement" | "backup";
  durationMinutes: number;
  segment?: Segment;
  label: string;
};

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function firstSlotTime(segment: Segment) {
  return new Date(segment.approvedAt ?? segment.createdAt);
}

function minuteKey(date: Date) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  return rounded.getTime();
}

function balanceTimesAcrossHours(times: Date[], baseTime: Date, hours: number) {
  const hourGroups = Array.from({ length: hours }, (_, hourIndex) => {
    const start = addMinutes(baseTime, hourIndex * 60);
    const end = addMinutes(start, 60);
    return times
      .filter((time) => time >= start && time < end)
      .sort((a, b) => a.getTime() - b.getTime());
  });
  const maxSlotsInHour = Math.max(...hourGroups.map((group) => group.length), 0);
  const balanced: Date[] = [];
  for (let slotIndex = 0; slotIndex < maxSlotsInHour; slotIndex += 1) {
    for (const group of hourGroups) {
      const time = group[slotIndex];
      if (time) {
        balanced.push(time);
      }
    }
  }
  return balanced;
}

function placeStatements(
  segments: Segment[],
  baseTime: Date,
  hours: number,
  allowedTimes: Date[],
  blockedTimes = new Set<number>()
) {
  const end = addMinutes(baseTime, hours * 60);
  const sorted = [...segments].sort(
    (a, b) => firstSlotTime(a).getTime() - firstSlotTime(b).getTime()
  );
  const scheduled: BroadcastSlot[] = [];
  const floating: Segment[] = [];

  for (const segment of sorted) {
    const slotTime = firstSlotTime(segment);
    const matchingAllowedTime = allowedTimes.find(
      (allowedTime) =>
        minuteKey(allowedTime) === minuteKey(slotTime) &&
        !blockedTimes.has(minuteKey(allowedTime))
    );
    if (matchingAllowedTime && slotTime >= baseTime && slotTime < end) {
      scheduled.push({
        at: matchingAllowedTime,
        kind: "statement",
        durationMinutes: 3,
        label: segment.personaName || "Voice statement",
        segment
      });
      continue;
    }
    if (slotTime < end) {
      floating.push(segment);
    }
  }

  const usedTimes = new Set([
    ...Array.from(blockedTimes),
    ...scheduled.map((slot) => minuteKey(slot.at))
  ]);
  const placedFloating: BroadcastSlot[] = [];
  for (const segment of floating) {
    const at = allowedTimes.find((allowedTime) => !usedTimes.has(minuteKey(allowedTime)));
    if (!at || at >= end) {
      break;
    }
    usedTimes.add(minuteKey(at));
    placedFloating.push({
      at,
      kind: "statement",
      durationMinutes: 3,
      label: segment.personaName || "Voice statement",
      segment
    });
  }

  return [...scheduled, ...placedFloating];
}

export function buildBroadcastSlots({
  segments,
  reviewSegments = [],
  scheduleSegments,
  socialVoiceSegments = [],
  baseTime,
  hours = 3
}: {
  segments: Segment[];
  reviewSegments?: Segment[];
  scheduleSegments: Segment[];
  socialVoiceSegments?: Segment[];
  baseTime: Date;
  hours?: number;
}) {
  const end = addMinutes(baseTime, hours * 60);
  const slotTimes = Array.from({ length: (hours * 60) / 5 }, (_, index) =>
    addMinutes(baseTime, index * 5)
  );
  const scheduleSlots: BroadcastSlot[] = [];
  const socialSlots: BroadcastSlot[] = [];

  for (const segment of scheduleSegments) {
    const slotTime = firstSlotTime(segment);
    if (slotTime >= baseTime && slotTime < end) {
      scheduleSlots.push({
        at: slotTime,
        kind: "schedule",
        durationMinutes: 2,
        label: "2-minute schedule/location rundown",
        segment
      });
    }
  }

  for (const segment of socialVoiceSegments) {
    const slotTime = firstSlotTime(segment);
    if (slotTime >= baseTime && slotTime < end) {
      socialSlots.push({
        at: slotTime,
        kind: "social",
        durationMinutes: 2,
        label: "2-minute rising social voice rundown",
        segment
      });
    }
  }

  const blockedTimes = new Set(
    [...scheduleSlots, ...socialSlots].map((slot) => minuteKey(slot.at))
  );
  const statementSlots = placeStatements(
    [...segments, ...reviewSegments],
    baseTime,
    hours,
    balanceTimesAcrossHours(
      slotTimes.filter((slotTime) => !blockedTimes.has(minuteKey(slotTime))),
      baseTime,
      hours
    ),
    blockedTimes
  );
  const occupiedTimes = new Set([
    ...Array.from(blockedTimes),
    ...statementSlots.map((slot) => minuteKey(slot.at))
  ]);
  const musicSlots = slotTimes
    .filter((slotTime) => !occupiedTimes.has(minuteKey(slotTime)))
    .map((slotTime): BroadcastSlot => ({
      at: slotTime,
      kind: "music",
      durationMinutes: 5,
      label: "Music bed / transition space"
    }));

  return [...scheduleSlots, ...socialSlots, ...statementSlots, ...musicSlots].sort(
    (a, b) => a.at.getTime() - b.at.getTime()
  );
}

export function buildBroadcastHourBuckets(slots: BroadcastSlot[], baseTime: Date, hours = 3) {
  return Array.from({ length: hours }, (_, hourIndex) => {
    const start = addMinutes(baseTime, hourIndex * 60);
    const end = addMinutes(start, 60);
    const hourSlots = slots.filter((slot) => slot.at >= start && slot.at < end);
    const statements = hourSlots.filter((slot) => slot.kind === "statement");
    const primaryStatementIds = new Set(
      statements.length > 2
        ? statements.slice(0, statements.length - 2).map((slot) => slot.segment?.id)
        : statements.map((slot) => slot.segment?.id)
    );
    return {
      start,
      end,
      slots: hourSlots.map((slot) =>
        slot.kind === "statement" && !primaryStatementIds.has(slot.segment?.id)
          ? { ...slot, kind: "backup" as const, label: `${slot.label} backup` }
          : slot
      )
    };
  });
}
