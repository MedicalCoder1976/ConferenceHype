"use client";

import { useCallback, useEffect, useState } from "react";

type CoverageRequest = {
  id: string;
  conference_name: string;
  field: string;
  specialty: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  website_url: string;
  program_url: string | null;
  requester_name: string;
  requester_email: string;
  requester_role: string | null;
  note: string | null;
  status: Status;
  created_at: string;
};

const STATUSES = ["new", "contacted", "accepted", "declined"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_STYLE: Record<Status, string> = {
  new: "bg-broadcast text-white",
  contacted: "bg-gold text-white",
  accepted: "bg-mint text-white",
  declined: "bg-ink/15 text-ink"
};

// Requests from the public /request-coverage form. Loaded on demand so the
// rest of /admin does not wait on this table.
export function CoverageRequestsDesk() {
  const [requests, setRequests] = useState<CoverageRequest[] | null>(null);
  const [filter, setFilter] = useState<Status | "all">("new");
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/coverage-requests", { cache: "no-store" });
      const body = (await response.json()) as { ok: boolean; requests?: CoverageRequest[]; error?: string };
      if (!body.ok) throw new Error(body.error ?? `Load failed (${response.status})`);
      setRequests(body.requests ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: Status) {
    setSavingId(id);
    setError("");
    try {
      const response = await fetch("/api/admin/coverage-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status })
      });
      const body = (await response.json()) as { ok: boolean; request?: CoverageRequest; error?: string };
      if (!body.ok || !body.request) throw new Error(body.error ?? `Update failed (${response.status})`);
      setRequests((current) => (current ?? []).map((item) => (item.id === id ? body.request! : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSavingId("");
    }
  }

  const counts = Object.fromEntries(STATUSES.map((status) => [status, (requests ?? []).filter((r) => r.status === status).length]));
  const visible = (requests ?? []).filter((request) => filter === "all" || request.status === filter);

  return (
    <section className="grid gap-4 border border-ink/10 bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-ink">Coverage requests</h2>
          <p className="text-sm font-semibold text-ink/60">
            From the public Request coverage form. Requester emails are never shown on the site.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-10 border border-ink px-3 text-xs font-black uppercase text-ink"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", ...STATUSES] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`border px-3 py-1.5 text-xs font-black uppercase ${
              filter === status ? "border-ink bg-ink text-white" : "border-ink/15 bg-white text-ink/70"
            }`}
          >
            {status} {status === "all" ? (requests?.length ?? 0) : counts[status]}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm font-bold text-broadcast">{error}</p> : null}
      {requests === null && !error ? <p className="text-sm font-semibold text-ink/60">Loading…</p> : null}
      {requests !== null && visible.length === 0 ? (
        <p className="text-sm font-semibold text-ink/60">No {filter === "all" ? "" : `${filter} `}requests.</p>
      ) : null}

      <div className="grid gap-3">
        {visible.map((request) => (
          <article key={request.id} className="grid gap-2 border border-ink/10 bg-paper/50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2 py-0.5 text-[11px] font-black uppercase ${STATUS_STYLE[request.status]}`}>{request.status}</span>
              <span className="text-[11px] font-black uppercase text-ink/50">
                {request.field}
                {request.specialty ? ` · ${request.specialty}` : ""}
              </span>
              <span className="text-[11px] font-bold text-ink/45">received {new Date(request.created_at).toLocaleString()}</span>
            </div>
            <h3 className="text-lg font-black text-ink">{request.conference_name}</h3>
            <p className="text-sm font-semibold text-ink/70">
              {[
                request.start_date && request.end_date ? `${request.start_date} to ${request.end_date}` : request.start_date,
                request.location
              ]
                .filter(Boolean)
                .join(" · ") || "No dates or location given"}
            </p>
            <div className="flex flex-wrap gap-3 text-xs font-black uppercase">
              <a href={request.website_url} target="_blank" rel="noreferrer" className="text-broadcast underline">
                Website
              </a>
              {request.program_url ? (
                <a href={request.program_url} target="_blank" rel="noreferrer" className="text-broadcast underline">
                  Program
                </a>
              ) : null}
            </div>
            <p className="text-sm font-semibold text-ink">
              {request.requester_name}
              {request.requester_role ? ` (${request.requester_role})` : ""} ·{" "}
              <a href={`mailto:${request.requester_email}`} className="text-broadcast underline">
                {request.requester_email}
              </a>
            </p>
            {request.note ? <p className="whitespace-pre-wrap text-sm text-ink/75">{request.note}</p> : null}
            <div className="flex flex-wrap gap-2">
              {STATUSES.filter((status) => status !== request.status).map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={savingId === request.id}
                  onClick={() => void setStatus(request.id, status)}
                  className="min-h-9 border border-ink/20 bg-white px-3 text-xs font-black uppercase text-ink hover:border-ink disabled:opacity-50"
                >
                  Mark {status}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
