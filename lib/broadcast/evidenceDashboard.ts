type EvidenceDashboardInput = {
  title?: string;
  text: string;
  sourceLabel?: string;
  contentType?: string;
  isMusic: boolean;
  nextTitle?: string;
  index: number;
  total: number;
};

const COLORS = {
  ink: "#111722",
  panel: "#1b2434",
  panelSoft: "#222d40",
  paper: "#f8f4eb",
  muted: "#aeb8ca",
  broadcast: "#f4483a",
  cyan: "#35c5d8",
  mint: "#49d39e",
  gold: "#ffbd45"
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function clean(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

function wrap(value: string, maxCharacters: number, maxLines: number) {
  const words = clean(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  const consumed = lines.join(" ").length;
  if (consumed < clean(value).length && lines.length) {
    lines[lines.length - 1] = truncate(lines[lines.length - 1], Math.max(4, maxCharacters - 1));
  }
  return lines;
}

function section(text: string, label: string, nextLabels: string[]) {
  const escaped = nextLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const stop = escaped.length ? `(?=${escaped.join("|")}|$)` : "$";
  const match = text.match(new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)${stop}`, "i"));
  return clean(match?.[1]);
}

function firstSentences(text: string, count = 2) {
  return clean(text).split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, count).join(" ");
}

function textBlock(lines: string[], x: number, y: number, lineHeight: number, className: string) {
  return `<text x="${x}" y="${y}" class="${className}">${lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("")}</text>`;
}

function contentTypeLabel(value?: string) {
  return clean(value).replaceAll("_", " ").toUpperCase() || "EVIDENCE SUMMARY";
}

export function buildEvidenceDashboardSvg(input: EvidenceDashboardInput) {
  const title = clean(input.title) || (input.isMusic ? "ConferenceHype evidence briefing" : "Key evidence summary");
  const source = clean(input.sourceLabel) || "Source-grounded ConferenceHype coverage";
  const body = clean(input.text);
  const background = section(body, "Background", ["Methods", "Results", "Discussion"]);
  const methods = section(body, "Methods", ["Results", "Discussion"]);
  const results = section(body, "Results", ["Discussion"]);
  const discussion = section(body, "Discussion", []);
  const keyFinding = results || discussion || firstSentences(body, 3) || "The next source-grounded evidence card is being prepared.";
  const snapshot = methods || background || firstSentences(body, 1) || source;
  const whyItMatters = discussion || (results ? firstSentences(results, 1) : firstSentences(body, 1)) || "Continue listening for the clinical interpretation.";
  const progress = Math.max(0, Math.min(1, input.total > 0 ? (input.index + 1) / input.total : 0));

  if (input.isMusic) {
    const comingNext = clean(input.nextTitle) || "More source-grounded medical evidence";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <style>
        .eyebrow{font:800 20px Arial,sans-serif;letter-spacing:2px;fill:${COLORS.cyan}}
        .title{font:900 44px Arial,sans-serif;fill:${COLORS.paper}}
        .body{font:600 25px Arial,sans-serif;fill:${COLORS.muted}}
        .small{font:700 16px Arial,sans-serif;letter-spacing:1px;fill:${COLORS.muted}}
      </style>
      <rect width="1280" height="720" fill="${COLORS.ink}"/>
      <rect x="54" y="122" width="1172" height="462" rx="24" fill="${COLORS.panel}" stroke="${COLORS.cyan}" stroke-opacity=".35" stroke-width="2"/>
      <rect x="86" y="164" width="190" height="42" rx="21" fill="${COLORS.broadcast}"/>
      <text x="181" y="192" text-anchor="middle" class="small" style="fill:${COLORS.paper}">COMING NEXT</text>
      ${textBlock(wrap(comingNext, 38, 3), 88, 286, 54, "title")}
      ${textBlock(wrap("A brief music transition while the next evidence card comes into view.", 68, 2), 88, 478, 35, "body")}
      <circle cx="1124" cy="222" r="58" fill="${COLORS.panelSoft}" stroke="${COLORS.mint}" stroke-width="5"/>
      <path d="M1095 222h58M1124 193v58" stroke="${COLORS.mint}" stroke-width="8" stroke-linecap="round"/>
      <text x="88" y="548" class="small">${escapeXml(source)}</text>
    </svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <style>
      .eyebrow{font:800 17px Arial,sans-serif;letter-spacing:1.8px;fill:${COLORS.cyan}}
      .title{font:900 32px Arial,sans-serif;fill:${COLORS.paper}}
      .finding{font:750 25px Arial,sans-serif;fill:${COLORS.paper}}
      .body{font:600 18px Arial,sans-serif;fill:${COLORS.paper}}
      .muted{font:600 16px Arial,sans-serif;fill:${COLORS.muted}}
      .label{font:850 16px Arial,sans-serif;letter-spacing:1.5px;fill:${COLORS.gold}}
      .small{font:700 14px Arial,sans-serif;fill:${COLORS.muted}}
    </style>
    <rect width="1280" height="720" fill="${COLORS.ink}"/>
    <rect x="48" y="104" width="1184" height="506" rx="20" fill="${COLORS.panel}" stroke="${COLORS.cyan}" stroke-opacity=".25" stroke-width="2"/>
    <rect x="48" y="104" width="10" height="506" rx="5" fill="${COLORS.broadcast}"/>
    <text x="82" y="140" class="eyebrow">${escapeXml(contentTypeLabel(input.contentType))}</text>
    ${textBlock(wrap(title, 57, 2), 82, 184, 38, "title")}
    <rect x="82" y="255" width="724" height="208" rx="15" fill="${COLORS.panelSoft}"/>
    <text x="108" y="290" class="label">KEY FINDING</text>
    ${textBlock(wrap(keyFinding, 54, 5), 108, 332, 31, "finding")}
    <rect x="830" y="255" width="364" height="208" rx="15" fill="${COLORS.panelSoft}"/>
    <text x="856" y="290" class="label">STUDY SNAPSHOT</text>
    ${textBlock(wrap(snapshot, 35, 6), 856, 326, 25, "body")}
    <rect x="82" y="482" width="1112" height="92" rx="15" fill="#162b2b"/>
    <text x="108" y="515" class="label" style="fill:${COLORS.mint}">WHY IT MATTERS</text>
    ${textBlock(wrap(whyItMatters, 92, 2), 108, 548, 25, "body")}
    <text x="82" y="598" class="small">${escapeXml(truncate(source, 120))}</text>
    <rect x="48" y="624" width="1184" height="5" rx="2.5" fill="#313b4b"/>
    <rect x="48" y="624" width="${Math.round(1184 * progress)}" height="5" rx="2.5" fill="${COLORS.broadcast}"/>
  </svg>`;
}
