import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const WIDTH = 1280;
const HEIGHT = 720;

const COLORS = {
  ink: "#12151f",
  broadcast: "#f4483a",
  cyanline: "#15a6b8",
  mint: "#2ea77b",
  gold: "#d89a22",
  paper: "#f6f1e8"
};

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tier = params.get("tier") === "dominant" || params.get("tier") === "roundup" ? params.get("tier") : "generic";
  const journal = params.get("journal") ? truncate(params.get("journal")!, 70) : undefined;
  const specialty = params.get("specialty") ? truncate(params.get("specialty")!, 40) : undefined;
  const date = params.get("date") ?? "";

  const headline = tier === "dominant" && journal ? journal : tier === "roundup" && specialty ? `${specialty} Roundup` : "ConferenceHype";
  const subtitle = tier === "dominant" ? specialty : tier === "roundup" ? "Medical Journal Coverage" : "Medical Conference Broadcast";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: COLORS.ink,
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", width: "100%", height: 18, backgroundColor: COLORS.broadcast }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: "70px 90px",
            justifyContent: "center"
          }}
        >
          <div
            style={{
              display: "flex",
              color: COLORS.broadcast,
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 24
            }}
          >
            ConferenceHype
          </div>
          <div
            style={{
              display: "flex",
              color: COLORS.paper,
              fontSize: tier === "generic" ? 96 : 72,
              fontWeight: 800,
              lineHeight: 1.1,
              maxWidth: 1080
            }}
          >
            {headline}
          </div>
          {subtitle ? (
            <div
              style={{
                display: "flex",
                marginTop: 28,
                color: COLORS.cyanline,
                fontSize: 40,
                fontWeight: 600
              }}
            >
              {subtitle}
            </div>
          ) : null}
          {date ? (
            <div
              style={{
                display: "flex",
                marginTop: 40,
                color: COLORS.gold,
                fontSize: 30,
                fontWeight: 500
              }}
            >
              {date}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", width: "100%", height: 18, backgroundColor: COLORS.mint }} />
      </div>
    ),
    { width: WIDTH, height: HEIGHT }
  );
}
