"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CONFERENCE_FIELDS, type ConferenceField } from "@/lib/conferences/catalog";
import { formatConferenceDates, youtubeThumbnail, type ConferenceStatus, type ConferenceSummary } from "@/lib/conferences/types";

const STATUS_LABEL: Record<ConferenceStatus, string> = {
  upcoming: "Upcoming",
  in_progress: "In progress",
  concluded: "Concluded",
  unknown: ""
};

type Filters = { field: ConferenceField; specialty: string; year: string; status: string; q: string };

function readFilters(): Partial<Filters> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const field = params.get("field");
  return {
    field: CONFERENCE_FIELDS.some((f) => f.key === field) ? (field as ConferenceField) : undefined,
    specialty: params.get("specialty") ?? undefined,
    year: params.get("year") ?? undefined,
    status: params.get("status") ?? undefined,
    q: params.get("q") ?? undefined
  };
}

export function ConferenceBrowser({
  conferences,
  heading = "Conferences we covered",
  currentSlug,
  intro
}: {
  conferences: ConferenceSummary[];
  heading?: string;
  currentSlug?: string;
  // Shown between the field tabs and the grid, so the tabs stay at the top.
  intro?: ReactNode;
}) {
  const [filters, setFilters] = useState<Filters>({ field: "medicine", specialty: "", year: "", status: "", q: "" });

  // Filters live in the address bar so a filtered view can be shared.
  useEffect(() => {
    setFilters((current) => ({ ...current, ...Object.fromEntries(Object.entries(readFilters()).filter(([, v]) => v !== undefined)) }));
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(filters)) {
      if (value && !(key === "field" && value === "medicine")) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [filters]);

  const update = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));

  const fieldCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const conference of conferences) counts.set(conference.field, (counts.get(conference.field) ?? 0) + 1);
    return counts;
  }, [conferences]);

  const inField = conferences.filter((conference) => conference.field === filters.field);
  const specialties = [...new Set(inField.map((conference) => conference.specialty))].sort();
  const years = [...new Set(inField.map((conference) => conference.year))].sort().reverse();
  const query = filters.q.trim().toLowerCase();
  const visible = inField.filter(
    (conference) =>
      (!filters.specialty || conference.specialty === filters.specialty) &&
      (!filters.year || conference.year === filters.year) &&
      (!filters.status || conference.status === filters.status) &&
      (!query ||
        `${conference.displayName} ${conference.fullName} ${conference.specialty} ${conference.city ?? ""}`.toLowerCase().includes(query))
  );
  const fieldLabel = CONFERENCE_FIELDS.find((f) => f.key === filters.field)?.label ?? "";

  return (
    <section className="px-4 py-6 sm:px-5 md:px-8">
      <div className="mx-auto max-w-7xl">
        <div role="tablist" aria-label="Field" className="flex gap-1 overflow-x-auto border-b border-ink/15">
          {CONFERENCE_FIELDS.map((field) => {
            const count = fieldCounts.get(field.key) ?? 0;
            const active = filters.field === field.key;
            return (
              <button
                key={field.key}
                role="tab"
                aria-selected={active}
                onClick={() => update({ field: field.key, specialty: "", year: "", status: "" })}
                className={`shrink-0 px-4 py-3 text-sm font-black uppercase tracking-wide ${
                  active ? "border-b-4 border-broadcast text-ink" : "text-ink/45 hover:text-ink"
                }`}
              >
                {field.label}
                <span className="ml-2 text-[11px] font-bold text-ink/45">{count > 0 ? count : "soon"}</span>
              </button>
            );
          })}
        </div>

        {intro}

        <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-black text-ink md:text-3xl">{heading}</h2>
          {inField.length > 0 ? (
            <span className="text-xs font-black uppercase text-ink/50">
              {visible.length} of {inField.length} conferences
            </span>
          ) : null}
        </div>

        {inField.length === 0 ? (
          <div className="mt-5 border border-dashed border-ink/20 bg-white/60 p-6">
            <p className="font-black text-ink">{fieldLabel} conferences are coming soon.</p>
            <p className="mt-1 text-sm font-semibold text-ink/65">
              Want a conference in this field covered?{" "}
              <Link href="/request-coverage" className="text-broadcast underline">
                Request coverage
              </Link>
              .
            </p>
          </div>
        ) : (
          <>
            {specialties.length > 1 ? (
              <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
                {["", ...specialties].map((specialty) => (
                  <button
                    key={specialty || "all"}
                    onClick={() => update({ specialty })}
                    className={`shrink-0 border px-3 py-1.5 text-xs font-black uppercase ${
                      filters.specialty === specialty
                        ? "border-ink bg-ink text-white"
                        : "border-ink/15 bg-white text-ink/70 hover:border-ink/40"
                    }`}
                  >
                    {specialty || "All specialties"}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <input
                type="search"
                value={filters.q}
                onChange={(event) => update({ q: event.target.value })}
                placeholder="Search conferences"
                aria-label="Search conferences"
                className="min-h-11 border border-ink/15 bg-white px-3 text-sm font-semibold text-ink"
              />
              <select
                value={filters.year}
                onChange={(event) => update({ year: event.target.value })}
                aria-label="Year"
                className="min-h-11 border border-ink/15 bg-white px-3 text-sm font-semibold text-ink"
              >
                <option value="">All years</option>
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <select
                value={filters.status}
                onChange={(event) => update({ status: event.target.value })}
                aria-label="Status"
                className="min-h-11 border border-ink/15 bg-white px-3 text-sm font-semibold text-ink"
              >
                <option value="">Any status</option>
                <option value="concluded">Concluded</option>
                <option value="in_progress">In progress</option>
                <option value="upcoming">Upcoming</option>
              </select>
            </div>

            {visible.length === 0 ? (
              <p className="mt-6 text-sm font-semibold text-ink/65">No conferences match these filters.</p>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visible.map((conference) => (
                  <ConferenceCard key={conference.slug} conference={conference} current={conference.slug === currentSlug} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function ConferenceCard({ conference, current }: { conference: ConferenceSummary; current: boolean }) {
  const dates = formatConferenceDates(conference.startDate, conference.endDate);
  const status = STATUS_LABEL[conference.status];
  return (
    <Link
      href={`/conferences/${conference.slug}`}
      aria-current={current ? "page" : undefined}
      className={`group grid content-start border bg-white transition hover:-translate-y-0.5 hover:shadow-panel ${
        current ? "border-broadcast" : "border-ink/10"
      }`}
    >
      <div className="relative aspect-video overflow-hidden bg-ink">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={youtubeThumbnail(conference.latestVideoId)}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover opacity-90 group-hover:opacity-100"
        />
        <span className="absolute bottom-2 right-2 bg-ink/85 px-2 py-1 text-[11px] font-black uppercase text-white">
          {conference.videoCount} {conference.videoCount === 1 ? "video" : "videos"}
        </span>
      </div>
      <div className="grid gap-1 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-black uppercase text-broadcast">{conference.specialty}</span>
          {status ? (
            <span className="border border-ink/15 px-1.5 py-0.5 text-[10px] font-black uppercase text-ink/60">{status}</span>
          ) : null}
        </div>
        <h3 className="text-lg font-black leading-6 text-ink">{conference.displayName}</h3>
        <p className="text-xs font-semibold text-ink/60">{conference.fullName}</p>
        {dates || conference.city ? (
          <p className="text-xs font-bold text-ink/70">{[dates, conference.city].filter(Boolean).join(" · ")}</p>
        ) : null}
      </div>
    </Link>
  );
}
