"use client";

import { Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type CountdownTimerProps = {
  startAt: string;
  label: string;
  paused?: boolean;
};

function getRemaining(startAt: string) {
  const target = new Date(startAt).getTime();
  const diff = Math.max(0, target - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
    isLive: diff === 0
  };
}

function formatUnit(value: number) {
  return value.toString().padStart(2, "0");
}

export function CountdownTimer({ startAt, label, paused = false }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(() => getRemaining(startAt));
  const startLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
        timeZoneName: "short"
      }).format(new Date(startAt)),
    [startAt]
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemaining(getRemaining(startAt));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [startAt]);

  const units = [
    { label: "days", value: remaining.days },
    { label: "hours", value: remaining.hours },
    { label: "mins", value: remaining.minutes },
    { label: "secs", value: remaining.seconds }
  ];

  return (
    <div className="border border-ink/15 bg-white/90 p-4 shadow-panel lg:max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-broadcast" />
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-broadcast">
              {paused
                ? "Stream paused"
                : remaining.isLive
                  ? "Live now"
                  : "Countdown to start"}
            </div>
            <div className="text-sm font-bold text-ink/70">{label}</div>
          </div>
        </div>
        <div className="text-xs font-black uppercase tracking-wide text-ink/60">
          {startLabel}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {units.map((unit) => (
          <div key={unit.label} className="bg-ink px-2 py-3 text-center text-white">
            <div className="text-2xl font-black tabular-nums md:text-3xl">
              {formatUnit(unit.value)}
            </div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-white/65">
              {unit.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
