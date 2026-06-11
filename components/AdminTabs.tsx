"use client";

import { BookOpen, CalendarDays, Library, Mic2, Radio, ScrollText } from "lucide-react";
import { useState, type ReactNode } from "react";

type TabId = "broadcast" | "journal-watch" | "meeting-watch" | "memory" | "voices" | "history";

const tabs: Array<{ id: TabId; label: string; icon: typeof Radio }> = [
  { id: "broadcast", label: "Broadcast", icon: Radio },
  { id: "journal-watch", label: "Journal Watch", icon: BookOpen },
  { id: "meeting-watch", label: "Meeting Watch", icon: CalendarDays },
  { id: "memory", label: "Memory", icon: Library },
  { id: "voices", label: "Specialty X Voices", icon: Mic2 },
  { id: "history", label: "Talked about", icon: ScrollText }
];

export function AdminTabs({
  broadcast,
  journalWatch,
  meetingWatch,
  memory,
  history,
  voices
}: {
  broadcast: ReactNode;
  journalWatch: ReactNode;
  meetingWatch: ReactNode;
  memory: ReactNode;
  history: ReactNode;
  voices: ReactNode;
}) {
  const [active, setActive] = useState<TabId>("broadcast");

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2 border-b border-ink/10">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`inline-flex min-h-11 items-center gap-2 border-x border-t px-4 text-sm font-black uppercase ${
                selected
                  ? "border-ink bg-ink text-white"
                  : "border-ink/10 bg-white text-ink hover:border-ink/30"
              }`}
              onClick={() => setActive(tab.id)}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>
      {active === "broadcast" ? broadcast : null}
      {active === "journal-watch" ? journalWatch : null}
      {active === "meeting-watch" ? meetingWatch : null}
      {active === "memory" ? memory : null}
      {active === "history" ? history : null}
      {active === "voices" ? voices : null}
    </div>
  );
}
