"use client";

import { useState, type FormEvent } from "react";

const inputClass = "min-h-11 w-full border border-ink/15 bg-white px-3 text-sm font-semibold text-ink";
const labelClass = "grid gap-1 text-xs font-black uppercase tracking-wide text-ink/70";

export function RequestCoverageForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setState("sending");
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "");
    const payload = {
      conferenceName: value("conferenceName"),
      field: value("field"),
      specialty: value("specialty"),
      startDate: value("startDate"),
      endDate: value("endDate"),
      location: value("location"),
      websiteUrl: value("websiteUrl"),
      programUrl: value("programUrl"),
      requesterName: value("requesterName"),
      requesterEmail: value("requesterEmail"),
      requesterRole: value("requesterRole") || undefined,
      note: value("note"),
      consent: form.get("consent") === "on",
      companyWebsite: value("companyWebsite")
    };
    try {
      const response = await fetch("/api/coverage-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Something went wrong. Please try again.");
      setState("sent");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div className="border border-mint bg-white p-6">
        <h2 className="text-xl font-black text-ink">Thanks, your request is in.</h2>
        <p className="mt-2 text-sm font-semibold text-ink/70">
          We review every request and will reach out by email if we can cover the meeting.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 border border-ink/10 bg-white p-5 md:p-6">
      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-2 text-sm font-black uppercase text-broadcast">The conference</legend>
        <label className={`${labelClass} md:col-span-2`}>
          Conference name *
          <input name="conferenceName" required minLength={3} maxLength={200} className={inputClass} />
        </label>
        <label className={labelClass}>
          Field *
          <select name="field" required defaultValue="medicine" className={inputClass}>
            <option value="medicine">Medicine</option>
            <option value="engineering">Engineering</option>
            <option value="law">Law</option>
            <option value="business">Business</option>
            <option value="education">Education</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className={labelClass}>
          Specialty or topic
          <input name="specialty" maxLength={120} placeholder="e.g. Oncology" className={inputClass} />
        </label>
        <label className={labelClass}>
          Start date
          <input name="startDate" type="date" className={inputClass} />
        </label>
        <label className={labelClass}>
          End date
          <input name="endDate" type="date" className={inputClass} />
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          City, or &quot;virtual&quot;
          <input name="location" maxLength={160} className={inputClass} />
        </label>
        <label className={labelClass}>
          Official website *
          <input name="websiteUrl" type="url" required placeholder="https://" className={inputClass} />
        </label>
        <label className={labelClass}>
          Program or abstracts link
          <input name="programUrl" type="url" placeholder="https://" className={inputClass} />
        </label>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-2 text-sm font-black uppercase text-broadcast">About you</legend>
        <label className={labelClass}>
          Your name *
          <input name="requesterName" required minLength={2} maxLength={120} autoComplete="name" className={inputClass} />
        </label>
        <label className={labelClass}>
          Email *
          <input name="requesterEmail" type="email" required maxLength={200} autoComplete="email" className={inputClass} />
        </label>
        <label className={labelClass}>
          Your role
          <select name="requesterRole" defaultValue="" className={inputClass}>
            <option value="">Choose one</option>
            <option value="organizer">Organizer</option>
            <option value="speaker">Speaker</option>
            <option value="sponsor">Sponsor</option>
            <option value="attendee">Attendee</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          Anything else we should know
          <textarea name="note" maxLength={2000} rows={4} className={`${inputClass} py-2`} />
        </label>
      </fieldset>

      {/* Honeypot for bots; hidden from people and screen readers. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Company website
          <input name="companyWebsite" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="flex items-start gap-2 text-sm font-semibold text-ink/80">
        <input name="consent" type="checkbox" required className="mt-1 h-4 w-4" />
        <span>
          I agree to be contacted by email about this request. We use these details only to review it.
        </span>
      </label>

      {error ? <p role="alert" className="text-sm font-bold text-broadcast">{error}</p> : null}

      <button
        type="submit"
        disabled={state === "sending"}
        className="inline-flex min-h-12 items-center justify-center bg-ink px-5 py-3 text-sm font-black uppercase text-white disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
