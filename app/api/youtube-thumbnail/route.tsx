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

function viewerLabel(value: string | null) {
  return value?.replace(/\bsource[- ]grounded\b/gi, "").replace(/\s{2,}/g, " ").trim() || undefined;
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
  const suppliedHeadline = viewerLabel(params.get("headline"));
  const seriesLabel = params.get("seriesLabel") ? truncate(params.get("seriesLabel")!, 72) : undefined;
  const topicLabel = params.get("topicLabel") ? truncate(params.get("topicLabel")!, 48) : undefined;
  const entityLabel = params.get("entityLabel") ? truncate(params.get("entityLabel")!, 34) : undefined;
  const detailLabel = params.get("detailLabel") ? truncate(params.get("detailLabel")!, 96) : undefined;
  const promiseLabel = viewerLabel(params.get("promiseLabel")) ? truncate(viewerLabel(params.get("promiseLabel"))!, 48) : undefined;
  const isPersistentFrame = params.get("variant") === "persistent-frame";
  const isJournalClub = params.get("journalClub") === "1";
  const articleTitle = viewerLabel(params.get("articleTitle"));
  const headline = suppliedHeadline
    ? truncate(suppliedHeadline, 58)
    : tier === "dominant" && journal
      ? journal
      : tier === "roundup" && specialty
        ? `${specialty} Roundup`
        : "ConferenceHype";
  const context = tier === "dominant" ? "Peer-Reviewed Journal Coverage" : tier === "roundup" ? "Medical Journal Coverage" : "Medical Research Broadcast";

  if (isPersistentFrame) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", color: COLORS.paper, fontFamily: "sans-serif" }}>
          <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: "100%", height: 82, backgroundColor: "rgba(16,20,31,0.94)", borderTop: `9px solid ${COLORS.broadcast}`, alignItems: "center", padding: "9px 34px 0" }}>
            <div style={{ display: "flex", backgroundColor: COLORS.broadcast, borderRadius: 6, padding: "7px 12px", fontSize: 20, fontWeight: 900, letterSpacing: 1 }}>CONFERENCEHYPE</div>
            <div style={{ display: "flex", marginLeft: 20, fontSize: 23, fontWeight: 850, letterSpacing: 0.4 }}>{seriesLabel ?? panelLabel}</div>
            <div style={{ display: "flex", marginLeft: "auto", color: COLORS.gold, fontSize: 20, fontWeight: 800 }}>{date}</div>
          </div>
          <div style={{ display: "flex", position: "absolute", bottom: 0, left: 0, width: "100%", height: 72, backgroundColor: "rgba(16,20,31,0.94)", borderBottom: `9px solid ${COLORS.mint}`, alignItems: "center", padding: "0 34px 9px" }}>
            <div style={{ display: "flex", color: COLORS.mint, fontSize: 19, fontWeight: 850, letterSpacing: 0.9 }}>{promiseLabel ?? "MEDICAL EVIDENCE, CLEARLY EXPLAINED"}</div>
            <div style={{ display: "flex", marginLeft: "auto", color: "#aeb8ca", fontSize: 17, fontWeight: 700 }}>conferencehype.com</div>
          </div>
        </div>
      ),
      { width: WIDTH, height: HEIGHT }
    );
  }

  if (isJournalClub && journal && specialty && articleTitle) {
    const articleFontSize = articleTitle.length > 170 ? 37 : articleTitle.length > 120 ? 43 : articleTitle.length > 78 ? 50 : 58;
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", flexDirection: "column", backgroundColor: COLORS.ink, color: COLORS.paper, fontFamily: "sans-serif", padding: "66px 76px 58px" }}>
          <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: "100%", height: 18, backgroundColor: COLORS.broadcast }} />
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", color: COLORS.cyan, fontSize: 36, fontWeight: 950, letterSpacing: 0.8 }}>{specialty} JOURNAL CLUB</div>
          </div>
          <div style={{ display: "flex", marginTop: 58, alignItems: "baseline", width: "100%" }}>
            <div style={{ display: "flex", color: COLORS.paper, fontSize: journal.length > 48 ? 35 : 42, fontWeight: 950, lineHeight: 1.05, maxWidth: 900 }}>{journal}</div>
            <div style={{ display: "flex", marginLeft: 20, color: COLORS.gold, fontSize: 27, fontWeight: 850, whiteSpace: "nowrap" }}>{date}</div>
          </div>
          <div style={{ display: "flex", marginTop: 31, width: "100%", height: 3, backgroundColor: COLORS.broadcast }} />
          <div style={{ display: "flex", marginTop: 30, color: COLORS.gold, fontSize: articleFontSize, fontWeight: 900, lineHeight: 1.08, width: "100%", overflowWrap: "anywhere" }}>{articleTitle}</div>
          <div style={{ display: "flex", position: "absolute", bottom: 0, left: 0, width: "100%", height: 18, backgroundColor: COLORS.mint }} />
        </div>
      ),
      { width: WIDTH, height: HEIGHT }
    );
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: COLORS.ink, color: COLORS.paper, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: "100%", height: 18, backgroundColor: COLORS.broadcast }} />
        <div style={{ display: "flex", flexDirection: "column", width: "72%", padding: "64px 42px 58px 76px", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: seriesLabel ? 14 : 25 }}>
            <div style={{ display: "flex", backgroundColor: COLORS.broadcast, borderRadius: 8, padding: "9px 17px", fontSize: 25, fontWeight: 800, letterSpacing: 1.5 }}>CONFERENCEHYPE</div>
            {specialty ? <div style={{ display: "flex", marginLeft: 15, color: COLORS.cyan, fontSize: 26, fontWeight: 700 }}>{specialty}</div> : null}
          </div>
          {seriesLabel ? <div style={{ display: "flex", marginBottom: 12, color: COLORS.paper, fontSize: 27, fontWeight: 900, lineHeight: 1.05, letterSpacing: 1.1, maxWidth: 820 }}>{seriesLabel}</div> : null}
          {topicLabel ? <div style={{ display: "flex", marginBottom: 15, color: COLORS.cyan, fontSize: 44, fontWeight: 950, lineHeight: 1.02, maxWidth: 820 }}>{topicLabel.toUpperCase()}</div> : null}
          <div style={{ display: "flex", color: COLORS.gold, fontSize: headline.length > 42 ? 64 : 78, fontWeight: 950, lineHeight: 0.98, maxWidth: 840 }}>{headline}</div>
          {entityLabel ? <div style={{ display: "flex", marginTop: 20, color: COLORS.mint, fontSize: 36, fontWeight: 900, lineHeight: 1.05, maxWidth: 820 }}>{entityLabel}</div> : null}
          {!topicLabel && detailLabel ? <div style={{ display: "flex", marginTop: 22, color: COLORS.cyan, fontSize: 40, fontWeight: 900, lineHeight: 1.08, maxWidth: 820 }}>{detailLabel}</div> : !topicLabel && context ? <div style={{ display: "flex", marginTop: 18, color: COLORS.cyan, fontSize: 30, fontWeight: 750 }}>{context}</div> : null}
          {date ? <div style={{ display: "flex", marginTop: 18, color: "#aeb8ca", fontSize: 24, fontWeight: 500 }}>{date}</div> : null}
        </div>
        <div style={{ display: "flex", width: "28%", backgroundColor: COLORS.panel, padding: "52px 34px 48px", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div style={{ display: "flex", borderRadius: 8, backgroundColor: COLORS.broadcast, color: COLORS.paper, padding: "12px 18px", alignItems: "center", justifyContent: "center", fontSize: 23, fontWeight: 950, letterSpacing: 1.2 }}>NEW EVIDENCE</div>
          {promiseLabel ? <div style={{ display: "flex", marginTop: 18, color: COLORS.paper, fontSize: 22, fontWeight: 900, lineHeight: 1.08 }}>{promiseLabel}</div> : null}
          <div style={{ display: "flex", marginTop: promiseLabel ? 18 : 28, color: COLORS.gold, fontSize: 18, fontWeight: 800, letterSpacing: 1.6 }}>{panelEyebrow ?? panelLabel}</div>
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
          <div style={{ display: "flex", marginTop: 28, color: COLORS.mint, fontSize: 17, fontWeight: 750, letterSpacing: 1.3 }}>WHY THIS RESULT MATTERS</div>
        </div>
        <div style={{ display: "flex", position: "absolute", bottom: 0, left: 0, width: "100%", height: 18, backgroundColor: COLORS.mint }} />
      </div>
    ),
    { width: WIDTH, height: HEIGHT }
  );
}
