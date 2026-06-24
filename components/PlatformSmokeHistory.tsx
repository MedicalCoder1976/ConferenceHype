"use client";

import { CheckCircle2, ExternalLink, FlaskConical, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import type { PlatformSmokeRun } from "@/lib/types";

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(value));
}

function outcomeBadge(outcome: PlatformSmokeRun["outcome"]) {
  if (outcome === "passed") {
    return "bg-mint text-ink";
  }
  if (outcome === "failed") {
    return "bg-red-600 text-white";
  }
  return "bg-ink/20 text-ink";
}

function testedSummary(run: PlatformSmokeRun) {
  return [run.conferenceName, run.journalName, run.sourceName].filter(Boolean).join(" / ") || "Not yet selected";
}

function RunRow({ run }: { run: PlatformSmokeRun }) {
  const [pending, startTransition] = useTransition();
  const [fixDeployedAt, setFixDeployedAt] = useState(run.fixDeployedAt);
  const [notes, setNotes] = useState(run.fixNotes ?? "");
  const [message, setMessage] = useState("");

  const toggleFixDeployed = () => {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/platform-smoke-runs/fix-deployed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: run.id,
            deployed: !fixDeployedAt,
            notes: notes.trim() || undefined
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not update fix-deployed status.");
        }
        setFixDeployedAt(payload.run.fixDeployedAt ?? undefined);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not update fix-deployed status.");
      }
    });
  };

  return (
    <article className="border border-ink/10 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`px-2 py-1 text-xs font-black uppercase ${outcomeBadge(run.outcome)}`}>
            {run.outcome}
          </span>
          <span className="text-xs font-bold uppercase text-ink/50">
            {dateTime(run.startedAt)}
          </span>
          <span className="text-xs font-bold uppercase text-ink/40">
            attempt {run.attempt}/{run.attemptsAllowed}
          </span>
        </div>
        {run.workflowRunUrl ? (
          <a
            className="inline-flex items-center gap-1 text-xs font-black uppercase text-broadcast"
            href={run.workflowRunUrl}
            target="_blank"
            rel="noreferrer"
          >
            Workflow run <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      <h3 className="mt-2 text-sm font-black text-ink">{testedSummary(run)}</h3>
      {run.errorMessage ? (
        <p className="mt-2 border border-red-300 bg-red-50 p-3 text-xs font-semibold leading-5 text-red-800">
          {run.errorMessage}
        </p>
      ) : null}
      {run.outcome === "failed" ? (
        <div className="mt-3 border-t border-ink/10 pt-3">
          <label className="block text-[11px] font-bold uppercase text-ink/50">
            Fix notes
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="What was fixed?"
              className="mt-1 w-full border border-ink/20 px-3 py-2 text-sm font-semibold normal-case outline-none focus:border-broadcast"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={toggleFixDeployed}
            className={`mt-2 inline-flex min-h-9 items-center gap-2 px-4 text-xs font-black uppercase disabled:opacity-50 ${
              fixDeployedAt ? "border border-ink bg-white text-ink" : "bg-ink text-white"
            }`}
          >
            {fixDeployedAt ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {fixDeployedAt ? `Fix deployed ${dateTime(fixDeployedAt)}` : "Mark fix deployed"}
          </button>
          {message ? (
            <div className="mt-2 text-xs font-bold text-red-700">{message}</div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function PlatformSmokeHistory({ runs }: { runs: PlatformSmokeRun[] }) {
  return (
    <section className="border border-ink/10 bg-white shadow-panel">
      <div className="border-b border-ink/10 p-5">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-broadcast" />
          <h2 className="text-2xl font-black text-ink">Platform smoke tests</h2>
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-ink/60">
          Smoke-test cards are deleted right after each run, so they never
          show up as real broadcast content. This is the durable record of
          when a run happened, what it tested, the outcome, and whether a fix
          has been deployed for any failure.
        </p>
      </div>
      <div className="grid gap-3 p-5">
        {runs.length === 0 ? (
          <div className="border border-dashed border-ink/20 bg-paper/60 p-5">
            <h3 className="text-lg font-black text-ink">No smoke test runs recorded yet</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-ink/65">
              Run the &quot;Platform smoke loop&quot; GitHub Action to record the first one here.
            </p>
          </div>
        ) : null}
        {runs.map((run) => (
          <RunRow key={run.id} run={run} />
        ))}
      </div>
    </section>
  );
}
