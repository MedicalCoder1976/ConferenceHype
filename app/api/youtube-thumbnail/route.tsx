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
  const suppliedHeadline = params.get("headline");
  const headline = suppliedHeadline
    ? truncate(suppliedHeadline, 68)
    : tier === "dominant" && journal
      ? journal
      : tier === "roundup" && specialty
        ? `${specialty} Roundup`
        : "ConferenceHype";
  const context = tier === "dominant" ? journal : tier === "roundup" ? "Medical Journal Coverage" : "Medical Research Broadcast";

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
        <div style={{ display: "flex", width: "28%", backgroundColor: COLORS.panel, padding: "80px 55px 60px", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", width: 175, height: 175, borderRadius: 88, backgroundColor: COLORS.broadcast, alignItems: "center", justifyContent: "center", fontSize: 116, fontWeight: 900 }}>?</div>
          <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 55, gap: 16 }}>
            <div style={{ display: "flex", height: 18, width: "92%", borderRadius: 9, backgroundColor: COLORS.cyan }} />
            <div style={{ display: "flex", height: 18, width: "70%", borderRadius: 9, backgroundColor: COLORS.mint }} />
            <div style={{ display: "flex", height: 18, width: "82%", borderRadius: 9, backgroundColor: COLORS.gold }} />
          </div>
          <div style={{ display: "flex", marginTop: 30, color: COLORS.paper, fontSize: 21, fontWeight: 700, letterSpacing: 1.5 }}>STUDY RESULTS</div>
        </div>
        <div style={{ display: "flex", position: "absolute", bottom: 0, left: 0, width: "100%", height: 18, backgroundColor: COLORS.mint }} />
      </div>
    ),
    { width: WIDTH, height: HEIGHT }
  );
}
