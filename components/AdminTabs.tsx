"use client";

import { BookOpen, CalendarDays, FileText, Library, Mic2, Radio, ScrollText } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

type TabId = "broadcast" | "journal-watch" | "meeting-watch" | "writeouts" | "memory" | "voices" | "history";

const tabs: Array<{ id: TabId; label: string; icon: typeof Radio }> = [
  { id: "broadcast", label: "Broadcast", icon: Radio },
  { id: "journal-watch", label: "Journal Watch", icon: BookOpen },
  { id: "meeting-watch", label: "Meeting Watch", icon: CalendarDays },
  { id: "writeouts", label: "Writeouts", icon: FileText },
  { id: "memory", label: "Memory", icon: Library },
  { id: "voices", label: "Specialty X Voices", icon: Mic2 },
  { id: "history", label: "Talked about", icon: ScrollText }
];

export function AdminTabs({
  initialActive,
  broadcast,
  journalWatch,
  meetingWatch,
  writeouts,
  memory,
  history,
  voices
}: {
  initialActive?: string;
  broadcast: ReactNode;
  journalWatch: ReactNode;
  meetingWatch: ReactNode;
  writeouts: ReactNode;
  memory: ReactNode;
  history: ReactNode;
  voices: ReactNode;
}) {
  const initialTab = tabs.some((tab) => tab.id === initialActive)
    ? (initialActive as TabId)
    : "broadcast";
  const [active, setActive] = useState<TabId>(initialTab);

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const section = params.get("section");
      setActive(tabs.some((tab) => tab.id === section) ? (section as TabId) : "broadcast");
    };
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  const selectTab = (tabId: TabId) => {
    setActive(tabId);
    const params = new URLSearchParams(window.location.search);
    if (tabId === "broadcast") {
      params.delete("section");
    } else {
      params.set("section", tabId);
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/admin?${query}` : "/admin");
  };

  const activePanel = (() => {
    switch (active) {
      case "broadcast":
        return broadcast;
      case "journal-watch":
        return journalWatch;
      case "meeting-watch":
        return meetingWatch;
      case "writeouts":
        return writeouts;
      case "memory":
        return memory;
      case "voices":
        return voices;
      case "history":
        return history;
      default:
        return broadcast;
    }
  })();

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
              onClick={() => selectTab(tab.id)}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>
      {activePanel}
    </div>
  );
}
