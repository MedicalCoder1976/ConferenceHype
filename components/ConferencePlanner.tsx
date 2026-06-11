"use client";

import { CalendarDays, Plus, Save } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { medicalSpecialties } from "@/lib/catalog/medicalSpecialties";
import type { ConferenceCoverageSlot, MedicalConference } from "@/lib/types";

const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long" });

function datesBetween(start?: string, end?: string) {
  if (!start || !end) return [];
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last && dates.length < 31) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function zonedDateTimeToIso(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(desired);
  for (let index = 0; index < 2; index += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(guess);
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const represented = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"));
    guess = new Date(guess.getTime() + desired - represented);
  }
  return guess.toISOString();
}

export function ConferencePlanner({
  initialConferences,
  initialCoverageSlots
}: {
  initialConferences: MedicalConference[];
  initialCoverageSlots: ConferenceCoverageSlot[];
}) {
  const [conferences, setConferences] = useState(initialConferences);
  const [coverageSlots, setCoverageSlots] = useState(initialCoverageSlots);
  const [selectedConferenceId, setSelectedConferenceId] = useState("");
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [slotTimes, setSlotTimes] = useState(["09:00", "15:00"]);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: "", acronym: "", specialties: ["Internal Medicine"], startDate: "", endDate: "",
    month: new Date().getMonth() + 1, year: new Date().getFullYear(), city: "", country: "",
    timezone: "America/New_York", officialUrl: ""
  });

  const grouped = useMemo(() => {
    const groups = new Map<string, MedicalConference[]>();
    for (const conference of conferences) {
      const key = `${conference.year}-${String(conference.month).padStart(2, "0")}`;
      groups.set(key, [...(groups.get(key) ?? []), conference]);
    }
    return Array.from(groups.entries());
  }, [conferences]);

  const selectedConference = conferences.find((conference) => conference.id === selectedConferenceId);
  const availableDates = datesBetween(selectedConference?.startDate, selectedConference?.endDate);

  const saveConference = () => startTransition(async () => {
    try {
      setFormError("");
      const response = await fetch("/api/admin/conferences", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form)
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not add conference.");
      setConferences((current) =>
        [...current.filter((item) => item.id !== payload.conference.id), payload.conference]
          .sort((a, b) => a.year - b.year || a.month - b.month || a.name.localeCompare(b.name))
      );
      setMessage(`${payload.conference.name} added.`);
      setForm({
        name: "", acronym: "", specialties: ["Internal Medicine"], startDate: "", endDate: "",
        month: new Date().getMonth() + 1, year: new Date().getFullYear(), city: "", country: "",
        timezone: "America/New_York", officialUrl: ""
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not add conference.");
    }
  });

  const saveCoverage = () => {
    if (!selectedConference) return;
    startTransition(async () => {
      try {
        const startsAt = selectedDates.flatMap((date) =>
          slotTimes.map((time) => zonedDateTimeToIso(date, time, selectedConference.timezone))
        );
        const response = await fetch("/api/admin/conference-coverage", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conferenceId: selectedConference.id, startsAt })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not save coverage.");
        setCoverageSlots((current) => [
          ...current.filter((slot) => slot.conferenceId !== selectedConference.id),
          ...payload.slots
        ]);
        setMessage(`${payload.slots.length} three-hour coverage blocks saved for ${selectedConference.name}.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save coverage.");
      }
    });
  };

  return (
    <section className="grid gap-5">
      <div className="border border-ink/10 bg-white p-5 shadow-panel">
        <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-broadcast" /><h2 className="text-xl font-black">Medical conference coverage</h2></div>
        <p className="mt-2 text-sm leading-6 text-ink/65">Browse major conferences by month and specialty. Selected conference days start with two three-hour blocks; add more start times to cover up to the full day. Default broadcast fills all other time.</p>
        {message ? <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold">{message}</div> : null}
      </div>

      <div className="grid gap-4">
        {grouped.map(([key, items]) => {
          const [year, month] = key.split("-").map(Number);
          return (
            <article key={key} className="border border-ink/10 bg-white p-4 shadow-panel">
              <h3 className="text-lg font-black">{monthLabel.format(new Date(Date.UTC(year, month - 1, 1)))} {year}</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {items.map((conference) => (
                  <div key={conference.id} className="border border-ink/10 p-3">
                    <div className="text-sm font-black">{conference.name} {conference.acronym ? `(${conference.acronym})` : ""}</div>
                    <div className="mt-1 text-xs font-semibold text-ink/55">{conference.specialties.join(", ")} · {conference.startDate ?? "dates needed"}{conference.endDate ? ` to ${conference.endDate}` : ""}</div>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => {
                        setSelectedConferenceId(conference.id);
                        setSelectedDates(datesBetween(conference.startDate, conference.endDate));
                        const existing = coverageSlots.filter((slot) => slot.conferenceId === conference.id);
                        if (existing.length) {
                          setSlotTimes(Array.from(new Set(existing.map((slot) => new Intl.DateTimeFormat("en-US", { timeZone: conference.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(slot.startsAt))))));
                        } else {
                          setSlotTimes(["09:00", "15:00"]);
                        }
                      }} className="bg-broadcast px-3 py-2 text-xs font-black uppercase text-white">Select coverage days</button>
                      <a href={conference.officialUrl} target="_blank" rel="noreferrer" className="border border-ink px-3 py-2 text-xs font-black uppercase">Official site</a>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      {selectedConference ? (
        <div className="border border-broadcast/30 bg-white p-5 shadow-panel">
          <h3 className="text-lg font-black">Coverage plan: {selectedConference.name}</h3>
          {availableDates.length === 0 ? (
            <p className="mt-3 text-sm font-bold text-red-700">Exact start and end dates are required before coverage days can be selected. Add an updated conference entry below.</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {availableDates.map((date) => (
                <label key={date} className="flex items-center gap-2 border border-ink/15 px-3 py-2 text-sm font-bold">
                  <input type="checkbox" checked={selectedDates.includes(date)} onChange={(event) => setSelectedDates((current) => event.target.checked ? [...current, date] : current.filter((item) => item !== date))} />
                  {date}
                </label>
              ))}
            </div>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {slotTimes.map((time, index) => (
              <input key={`${time}-${index}`} type="time" step="10800" value={time} onChange={(event) => setSlotTimes((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} className="border border-ink/20 px-3 py-2" />
            ))}
            {slotTimes.length < 8 ? <button type="button" onClick={() => setSlotTimes((current) => [...current, "21:00"])} className="inline-flex items-center justify-center gap-2 border border-ink px-3 py-2 text-xs font-black uppercase"><Plus className="h-4 w-4" /> Add 3-hour block</button> : null}
          </div>
          <button type="button" disabled={pending || availableDates.length === 0} onClick={saveCoverage} className="mt-4 inline-flex min-h-11 items-center gap-2 bg-ink px-4 text-sm font-black uppercase text-white disabled:opacity-50"><Save className="h-4 w-4" /> Save coverage plan</button>
        </div>
      ) : null}

      <div className="border border-ink/10 bg-white p-5 shadow-panel">
        <h3 className="text-lg font-black">Add or update conference</h3>
        <p className="mt-2 text-sm font-semibold text-ink/60">
          Required fields are conference name, specialty, official site, and timezone.
          URLs without `https://` are normalized automatically.
        </p>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(event) => {
          event.preventDefault();
          saveConference();
        }}>
          <label className="grid gap-1 text-xs font-black uppercase text-ink/60">
            Conference name
            <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="European Hematology Association Congress" className="border border-ink/20 px-3 py-3 text-sm font-semibold normal-case text-ink" />
          </label>
          <label className="grid gap-1 text-xs font-black uppercase text-ink/60">
            Acronym
            <input value={form.acronym} onChange={(event) => setForm({ ...form, acronym: event.target.value })} placeholder="EHA" className="border border-ink/20 px-3 py-3 text-sm font-semibold normal-case text-ink" />
          </label>
          <label className="grid gap-1 text-xs font-black uppercase text-ink/60">
            Primary specialty
          <select value={form.specialties[0]} onChange={(event) => setForm({ ...form, specialties: [event.target.value] })} className="border border-ink/20 bg-white px-3 py-3 text-sm font-semibold normal-case text-ink">
            {medicalSpecialties.map((item) => <option key={item}>{item}</option>)}
          </select>
          </label>
          <label className="grid gap-1 text-xs font-black uppercase text-ink/60">
            Official site
            <input required value={form.officialUrl} onChange={(event) => setForm({ ...form, officialUrl: event.target.value })} placeholder="ehaweb.org/connect-network/eha2026-congress" className="border border-ink/20 px-3 py-3 text-sm font-semibold normal-case text-ink" />
          </label>
          <label className="grid gap-1 text-xs font-black uppercase text-ink/60">
            Start date
            <input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value, month: Number(event.target.value.slice(5, 7)) || form.month, year: Number(event.target.value.slice(0, 4)) || form.year })} className="border border-ink/20 px-3 py-3 text-sm font-semibold normal-case text-ink" />
          </label>
          <label className="grid gap-1 text-xs font-black uppercase text-ink/60">
            End date
            <input type="date" min={form.startDate || undefined} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} className="border border-ink/20 px-3 py-3 text-sm font-semibold normal-case text-ink" />
          </label>
          <label className="grid gap-1 text-xs font-black uppercase text-ink/60">
            City
            <input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="Stockholm" className="border border-ink/20 px-3 py-3 text-sm font-semibold normal-case text-ink" />
          </label>
          <label className="grid gap-1 text-xs font-black uppercase text-ink/60">
            Country
            <input value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} placeholder="Sweden" className="border border-ink/20 px-3 py-3 text-sm font-semibold normal-case text-ink" />
          </label>
          <label className="grid gap-1 text-xs font-black uppercase text-ink/60">
            IANA timezone
            <input required value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} placeholder="Europe/Stockholm" className="border border-ink/20 px-3 py-3 text-sm font-semibold normal-case text-ink" />
          </label>
          <div className="grid gap-2">
            {formError ? (
              <div className="border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">
                {formError}
              </div>
            ) : null}
            <button type="submit" disabled={pending || !form.name.trim() || !form.officialUrl.trim()} className="inline-flex min-h-12 items-center justify-center gap-2 bg-broadcast px-4 text-sm font-black uppercase text-white disabled:opacity-50"><Plus className="h-4 w-4" /> {pending ? "Adding..." : "Add conference"}</button>
          </div>
        </form>
      </div>
    </section>
  );
}
