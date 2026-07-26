import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const WIDTH = 1280;
const HEIGHT = 720;
const COLORS = {
  ink: "#10141f",
  panel: "#1a2233",
  broadcast: "#f4483a",
  cyan: "#35c5d8",
  mint: "#49d39e",
  gold: "#ffbd45",
  paper: "#f8f4eb"
};

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tier = params.get("tier") === "dominant" || params.get("tier") === "roundup" ? params.get("tier") : "generic";
  const journal = params.get("journal") ? truncate(params.get("journal")!, 62) : undefined;
  const specialty = params.get("specialty") ? truncate(params.get("specialty")!, 36) : undefined;
  const date = params.get("date") ?? "";
  const suppliedJournalNames = params.getAll("journalName").map((name) => truncate(name, 58)).filter(Boolean);
  const journalNames = suppliedJournalNames.length ? suppliedJournalNames.slice(0, 2) : journal ? [journal] : [];
  const suppliedJournalCount = Number(params.get("journalCount"));
  const journalCount = Number.isFinite(suppliedJournalCount) && suppliedJournalCount > 0
    ? Math.max(journalNames.length, Math.floor(suppliedJournalCount))
    : journalNames.length;
  const remainingJournalCount = Math.max(0, journalCount - journalNames.length);
  const suppliedPanelLabel = params.get("panelLabel");
  const panelEyebrow = suppliedPanelLabel ? "CONFERENCEHYPE ALERT" : undefined;
  const panelLabel = suppliedPanelLabel
    ? truncate(suppliedPanelLabel.toUpperCase(), 42)
    : journalNames.length > 1
      ? "FEATURED JOURNALS"
      : journalNames.length === 1
        ? "FEATURED JOURNAL"
        : "MEDICAL RESEARCH";
  const suppliedHeadline = params.get("headline");
  const headline = suppliedHeadline
    ? truncate(suppliedHeadline, 68)
    : tier === "dominant" && journal
      ? journal
      : tier === "roundup" && specialty
        ? `${specialty} Roundup`
        : "ConferenceHype";
  const context = tier === "dominant" ? "Peer-Reviewed Journal Coverage" : tier === "roundup" ? "Medical Journal Coverage" : "Medical Research Broadcast";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: COLORS.ink, color: COLORS.paper, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: "100%", height: 18, backgroundColor: COLORS.broadcast }} />
        <div style={{ display: "flex", flexDirection: "column", width: "72%", padding: "64px 42px 58px 76px", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 25 }}>
            <div style={{ display: "flex", backgroundColor: COLORS.broadcast, borderRadius: 8, padding: "9px 17px", fontSize: 25, fontWeight: 800, letterSpacing: 1.5 }}>CONFERENCEHYPE</div>
            {specialty ? <div style={{ display: "flex", marginLeft: 15, color: COLORS.cyan, fontSize: 26, fontWeight: 700 }}>{specialty}</div> : null}
          </div>
          <div style={{ display: "flex", fontSize: suppliedHeadline ? 58 : 68, fontWeight: 850, lineHeight: 1.07, maxWidth: 820 }}>{headline}</div>
          {context ? <div style={{ display: "flex", marginTop: 27, color: COLORS.gold, fontSize: 28, fontWeight: 650 }}>{context}</div> : null}
          {date ? <div style={{ display: "flex", marginTop: 18, color: "#aeb8ca", fontSize: 24, fontWeight: 500 }}>{date}</div> : null}
        </div>
        <div style={{ display: "flex", width: "28%", backgroundColor: COLORS.panel, padding: "52px 34px 48px", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div style={{ display: "flex", width: 82, height: 82, borderRadius: 41, backgroundColor: COLORS.broadcast, alignItems: "center", justifyContent: "center", fontSize: 54, fontWeight: 900 }}>?</div>
          <div style={{ display: "flex", marginTop: 28, color: COLORS.gold, fontSize: 18, fontWeight: 800, letterSpacing: 1.6 }}>{panelEyebrow ?? panelLabel}</div>
          {journalNames.length ? (
            <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 20, gap: 18, alignItems: "center" }}>
              {journalNames.map((name) => (
                <div key={name} style={{ display: "flex", color: COLORS.paper, fontSize: name.length > 34 ? 25 : 29, fontWeight: 850, lineHeight: 1.08, justifyContent: "center" }}>{name}</div>
              ))}
              {remainingJournalCount > 0 ? <div style={{ display: "flex", color: COLORS.cyan, fontSize: 22, fontWeight: 800 }}>+ {remainingJournalCount} JOURNALS</div> : null}
            </div>
          ) : (
            <div style={{ display: "flex", marginTop: 24, color: COLORS.paper, fontSize: suppliedPanelLabel ? 30 : 25, fontWeight: 850, lineHeight: 1.1 }}>{panelLabel}</div>
          )}
          <div style={{ display: "flex", marginTop: 28, color: COLORS.mint, fontSize: 17, fontWeight: 750, letterSpacing: 1.3 }}>SOURCE-GROUNDED</div>
        </div>
        <div style={{ display: "flex", position: "absolute", bottom: 0, left: 0, width: "100%", height: 18, backgroundColor: COLORS.mint }} />
      </div>
    ),
    { width: WIDTH, height: HEIGHT }
  );
}
