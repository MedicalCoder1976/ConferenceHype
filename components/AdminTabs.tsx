"use client";

import { BookOpen, BookOpenCheck, BookOpenText, CalendarDays, FileText, Library, Mic2, Radio, RadioTower, ScrollText, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

type TabId = "broadcast" | "pending-review" | "twitter-stream" | "journal-watch" | "meeting-watch" | "breaking-paper" | "create-story" | "writeouts" | "memory" | "voices" | "history";

const tabs: Array<{ id: TabId; label: string; icon: typeof Radio }> = [
  { id: "broadcast", label: "Broadcast", icon: Radio },
  { id: "pending-review", label: "Pending Review", icon: BookOpenCheck },
  { id: "twitter-stream", label: "Twitter Stream", icon: RadioTower },
  { id: "journal-watch", label: "Journal Watch", icon: BookOpen },
  { id: "meeting-watch", label: "Meeting Watch", icon: CalendarDays },
  { id: "breaking-paper", label: "Breaking Paper", icon: BookOpenText },
  { id: "create-story", label: "Create a Story", icon: Sparkles },
  { id: "writeouts", label: "Writeouts", icon: FileText },
  { id: "memory", label: "Memory", icon: Library },
  { id: "voices", label: "Specialty X Voices", icon: Mic2 },
  { id: "history", label: "Talked about", icon: ScrollText }
];

export function AdminTabs({
  initialActive,
  broadcast,
  pendingReview,
  twitterStream,
  journalWatch,
  meetingWatch,
  breakingPaper,
  createStory,
  writeouts,
  memory,
  history,
  voices
}: {
  initialActive?: string;
  broadcast: ReactNode;
  pendingReview: ReactNode;
  twitterStream: ReactNode;
  journalWatch: ReactNode;
  meetingWatch: ReactNode;
  breakingPaper: ReactNode;
  createStory: ReactNode;
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
      case "pending-review":
        return pendingReview;
      case "twitter-stream":
        return twitterStream;
      case "journal-watch":
        return journalWatch;
      case "meeting-watch":
        return meetingWatch;
      case "breaking-paper":
        return breakingPaper;
      case "create-story":
        return createStory;
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
