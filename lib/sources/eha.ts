import type { IngestedItem, SourceConfig } from "@/lib/types";

type EhaLibraryEntry = {
  id?: number;
  href?: string;
  reference?: string;
  title?: string;
  date?: string;
  abstractnumber?: string;
  boxSpeaker?: {
    name?: string;
  };
};

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceItem(
  source: SourceConfig,
  id: string,
  title: string,
  excerpt: string
): IngestedItem {
  return {
    id,
    sourceId: source.id,
    title,
    url: source.url,
    excerpt,
    sourceName: source.name,
    sourceType: source.type,
    rank: source.rank
  };
}

export function parseEhaAbstractLibrary(
  html: string,
  source: SourceConfig
): IngestedItem[] {
  const marker = "const recommendList = ";
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("EHA abstract library did not expose its public abstract list.");
  }

  const jsonStart = html.indexOf("[", markerIndex + marker.length);
  const jsonEnd = html.indexOf(";\n", jsonStart);
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error("EHA abstract library returned an unexpected response.");
  }

  const entries = JSON.parse(html.slice(jsonStart, jsonEnd).trim()) as EhaLibraryEntry[];
  return entries
    .filter((entry) => entry.title && entry.href && entry.abstractnumber)
    .slice(0, 40)
    .map((entry, index) => {
      const presenter = entry.boxSpeaker?.name?.trim();
      const reference = entry.reference?.trim();
      const abstractNumber = entry.abstractnumber?.trim();
      return {
        id: `eha-abstract-${entry.id ?? index}`,
        sourceId: source.id,
        title: `EHA2026 abstract ${abstractNumber}: ${entry.title!.trim()}`,
        url: entry.href!,
        excerpt: [
          `Official EHA2026 abstract listing ${abstractNumber}.`,
          presenter ? `Presenter: ${presenter}.` : "",
          reference ? `EHA Library reference: ${reference}.` : "",
          "Only the public listing metadata is available here; do not infer methods, results, or clinical significance beyond the title."
        ].filter(Boolean).join(" "),
        sourceName: source.name,
        sourceType: source.type,
        rank: source.rank,
        publishedAt: entry.date
          ? new Date(`${entry.date.replace(" ", "T")}Z`).toISOString()
          : undefined
      };
    });
}

export function parseEhaSponsors(html: string, source: SourceConfig) {
  const sectionStart = html.indexOf("<strong>EHA2026 sponsors</strong>");
  if (sectionStart < 0) {
    throw new Error("EHA sponsorship page did not expose its sponsor list.");
  }
  const section = html.slice(sectionStart);
  const names = Array.from(
    section.matchAll(
      /data-aria-posinset="\d+"[\s\S]*?<span[^>]*data-contrast="none"[^>]*>([\s\S]*?)<\/span>/g
    ),
    (match) => decodeHtml(match[1])
  ).filter(Boolean);

  return Array.from(new Set(names)).slice(0, 60).map((name, index) =>
    sourceItem(
      source,
      `eha-sponsor-${index + 1}`,
      `EHA2026 officially listed sponsor: ${name}`,
      `The official EHA2026 sponsorship page lists ${name} as a Congress sponsor. The page also links to the exhibition floorplan. This record identifies the official sponsor listing only; it does not claim a specific booth number, product, presentation, or attendee reaction.`
    )
  );
}

const onsiteFacts = [
  {
    needle: "pocket program on-site",
    title: "Pocket program",
    excerpt: "EHA says essential on-site information is available in the pocket program and provides key highlights online."
  },
  {
    needle: "Opening hours for all EHA2026 areas",
    title: "Area opening hours",
    excerpt: "The official on-site essentials page links to opening hours for all EHA2026 areas."
  },
  {
    needle: "Venue Floorplan",
    title: "Congress venue floorplan",
    excerpt: "The official on-site essentials page provides a Congress venue floorplan."
  },
  {
    needle: "Exhibition Floorplan",
    title: "Exhibition floorplan",
    excerpt: "The official on-site essentials page provides an exhibition floorplan for navigating the exhibition."
  },
  {
    needle: "EHA Booth",
    title: "EHA Booth",
    excerpt: "EHA includes the EHA Booth among the Congress information resources highlighted for on-site attendees."
  },
  {
    needle: "Member Lounge",
    title: "Member Lounge",
    excerpt: "EHA includes the Member Lounge among the Congress information resources highlighted for on-site attendees."
  },
  {
    needle: "Connect Hub",
    title: "Connect Hub",
    excerpt: "EHA includes the Connect Hub among the Congress information resources highlighted for on-site attendees."
  },
  {
    needle: "WiFi",
    title: "Congress WiFi information",
    excerpt: "EHA includes WiFi information among the Congress resources highlighted for on-site attendees."
  },
  {
    needle: "Social Media contest",
    title: "Official social media contest",
    excerpt: "EHA lists a Social Media contest among its official on-site Congress information."
  },
  {
    needle: "Info Desks",
    title: "Congress information desks",
    excerpt: "EHA includes Info Desks among the Congress resources highlighted for on-site attendees."
  },
  {
    needle: "sponsors and partners",
    title: "Sponsors and partners directory",
    excerpt: "The official on-site essentials page links attendees to information about EHA2026 sponsors and partners."
  },
  {
    needle: "Congress platform onboarding",
    title: "Congress platform onboarding",
    excerpt: "EHA directs attendees to complete Congress platform onboarding through its official platform and app information."
  },
  {
    needle: "download the Congress App",
    title: "Congress App",
    excerpt: "EHA directs attendees to download the official Congress App through its platform and app information."
  },
  {
    needle: "Ask your questions in the chat",
    title: "Official support chat",
    excerpt: "EHA says questions can be submitted through the chat at the bottom right of the official Congress page."
  },
  {
    needle: "Help Desks in the registration area",
    title: "Registration-area help desks",
    excerpt: "EHA directs on-site attendees with questions to Help Desks in the registration area."
  }
] as const;

export function parseEhaOnsiteFacts(html: string, source: SourceConfig) {
  const items = onsiteFacts
    .filter((fact) => html.includes(fact.needle))
    .map((fact, index) =>
      sourceItem(
        source,
        `eha-onsite-${index + 1}`,
        `EHA2026 official community information: ${fact.title}`,
        `${fact.excerpt} This is official organizer information, not a claim about attendee sentiment or live social chatter.`
      )
    );
  if (items.length < 10) {
    throw new Error(`EHA on-site page exposed only ${items.length} expected facts.`);
  }
  return items;
}

export function parseEhaMediaFacts(html: string, source: SourceConfig) {
  const required = [
    "closed at 23:59 (CEST) on June 5, 2026",
    "Late Hybrid or Virtual requests online or onsite",
    "Registration is now closed"
  ];
  if (!required.every((fact) => html.includes(fact))) {
    throw new Error("EHA media page did not expose its current registration notice.");
  }
  return [
    sourceItem(
      source,
      "eha-media-deadline",
      "EHA2026 official press-registration deadline",
      "EHA states that EHA2026 press registration closed at 23:59 CEST on June 5, 2026."
    ),
    sourceItem(
      source,
      "eha-media-hybrid",
      "EHA2026 late hybrid press requests",
      "EHA states that late Hybrid press-registration requests after June 5 cannot be accommodated."
    ),
    sourceItem(
      source,
      "eha-media-virtual",
      "EHA2026 late virtual press requests",
      "EHA states that late Virtual press-registration requests after June 5 cannot be accommodated."
    ),
    sourceItem(
      source,
      "eha-media-online",
      "EHA2026 late online press requests",
      "EHA states that late press-registration requests submitted online after June 5 cannot be accommodated."
    ),
    sourceItem(
      source,
      "eha-media-onsite",
      "EHA2026 late on-site press requests",
      "EHA states that late press-registration requests made on-site after June 5 cannot be accommodated."
    ),
    sourceItem(
      source,
      "eha-media-closed",
      "EHA2026 official media registration status",
      "The official EHA2026 media-registration page says registration is now closed."
    )
  ];
}

export async function fetchEhaSource(source: SourceConfig): Promise<IngestedItem[]> {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "ConferenceHypeBot/0.1 source-attributed summaries"
    },
    next: { revalidate: 900 }
  });
  if (!response.ok) {
    throw new Error(`EHA source fetch failed: ${response.status}`);
  }
  const html = await response.text();
  if (source.url.includes("library.ehaweb.org/eha/")) {
    return parseEhaAbstractLibrary(html, source);
  }
  if (source.url.includes("eha2026-sponsorship-opportunities")) {
    return parseEhaSponsors(html, source);
  }
  if (source.url.includes("eha2026-on-site-essentials")) {
    return parseEhaOnsiteFacts(html, source);
  }
  if (source.url.includes("eha2026-media-registration")) {
    return parseEhaMediaFacts(html, source);
  }
  throw new Error(`No specialized EHA parser is configured for ${source.id}.`);
}
