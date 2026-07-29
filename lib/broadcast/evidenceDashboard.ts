type EvidenceDashboardInput = {
  title?: string;
  previousTitle?: string;
  text: string;
  sourceLabel?: string;
  contentType?: string;
  isMusic: boolean;
  nextTitle?: string;
  index: number;
  total: number;
  isOpening?: boolean;
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
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}â€¦`;
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

function stripSlideDescriptors(value: string) {
  return clean(value)
    .replace(/\b(?:Tumor\s*Crusher|Luna Vale)\b\s*(?:\/|:|-)?\s*/gi, "")
    .replace(/\b(?:Media Watch|Pharma Watch|Journal Coverage|Conference Coverage)\s*[:\-ï¿½ï¿½]?\s*/gi, "")
    .replace(/\bA new ASCO Educational Book review\b\s*[:\-ï¿½ï¿½]?\s*/gi, "")
    .trim();
}

export function buildEvidenceDashboardSvg(input: EvidenceDashboardInput) {
  const title = stripSlideDescriptors(input.title ?? "") || (input.isMusic ? "ConferenceHype" : "Evidence update");
  const previousTitle = stripSlideDescriptors(input.previousTitle ?? "");
  const repeatedTitle = Boolean(previousTitle) && previousTitle.toLowerCase() === title.toLowerCase();
  const source = clean(input.sourceLabel);
  const body = stripSlideDescriptors(input.text);
  const results = section(body, "Results", ["Discussion"]);
  const discussion = section(body, "Discussion", []);
  const methods = section(body, "Methods", ["Results", "Discussion"]);
  const focus = results || discussion || methods || firstSentences(body, 2) || "Continue listening for the evidence and clinical context.";
  const progress = Math.max(0, Math.min(1, input.total > 0 ? (input.index + 1) / input.total : 0));

  if (input.isMusic) {
    const comingNext = clean(input.nextTitle);
    const isClosing = !comingNext;
    const musicTitle = isClosing ? "Help shape the next evidence review" : stripSlideDescriptors(comingNext);
    const musicBody = isClosing
      ? "Like and subscribe, then recommend an article or trial you want ConferenceHype to cover next."
      : "A brief music transition. The next article section begins shortly.";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <style>
        .eyebrow{font:800 18px Arial,sans-serif;letter-spacing:2px;fill:${COLORS.cyan}}
        .title{font:900 46px Arial,sans-serif;fill:${COLORS.paper}}
        .body{font:600 26px Arial,sans-serif;fill:${COLORS.muted}}
      </style>
      <rect width="1280" height="720" fill="${COLORS.ink}"/>
      <rect x="92" y="150" width="1096" height="390" rx="26" fill="${COLORS.panel}" stroke="${COLORS.cyan}" stroke-opacity=".35" stroke-width="2"/>
      <text x="128" y="205" class="eyebrow">${isClosing ? "STAY CURIOUS" : "COMING NEXT"}</text>
      ${textBlock(wrap(musicTitle, 37, 2), 128, 286, 58, "title")}
      ${textBlock(wrap(musicBody, 66, 2), 128, 430, 38, "body")}
    </svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <style>
      .eyebrow{font:800 17px Arial,sans-serif;letter-spacing:1.8px;fill:${COLORS.gold}}
      .title{font:900 38px Arial,sans-serif;fill:${COLORS.paper}}
      .finding{font:650 28px Arial,sans-serif;fill:${COLORS.paper}}
      .source{font:600 17px Arial,sans-serif;fill:${COLORS.muted}}
    </style>
    <rect width="1280" height="720" fill="${COLORS.ink}"/>
    <rect x="74" y="130" width="1132" height="420" rx="24" fill="${COLORS.panel}" stroke="${COLORS.cyan}" stroke-opacity=".25" stroke-width="2"/>
    <rect x="74" y="130" width="9" height="420" rx="4.5" fill="${COLORS.broadcast}"/>
    <text x="118" y="184" class="eyebrow">${input.isOpening ? "ARTICLE REVIEW" : "EVIDENCE"}</text>
    ${repeatedTitle ? "" : textBlock(wrap(title, 50, 2), 118, 242, 46, "title")}
    ${textBlock(wrap(focus, 68, 4), 118, repeatedTitle ? 292 : 365, 40, "finding")}
    ${input.isOpening && source ? `<text x="118" y="518" class="source">${escapeXml(truncate(source, 112))}</text>` : ""}
    <rect x="74" y="578" width="1132" height="5" rx="2.5" fill="#313b4b"/>
    <rect x="74" y="578" width="${Math.round(1132 * progress)}" height="5" rx="2.5" fill="${COLORS.broadcast}"/>
  </svg>`;
}