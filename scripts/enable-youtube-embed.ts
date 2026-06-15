import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const broadcastId = process.env.YOUTUBE_VIDEO_ID;
if (!broadcastId) {
  throw new Error("YOUTUBE_VIDEO_ID is required.");
}

const required = [
  "YOUTUBE_OAUTH_CLIENT_ID",
  "YOUTUBE_OAUTH_CLIENT_SECRET",
  "YOUTUBE_OAUTH_REFRESH_TOKEN"
] as const;

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`${name} is required.`);
  }
}

const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: process.env.YOUTUBE_OAUTH_CLIENT_ID!,
    client_secret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET!,
    refresh_token: process.env.YOUTUBE_OAUTH_REFRESH_TOKEN!,
    grant_type: "refresh_token"
  })
});

if (!tokenResponse.ok) {
  throw new Error(
    `YouTube OAuth refresh failed: ${tokenResponse.status} ${await tokenResponse.text()}`
  );
}

const { access_token: accessToken } = (await tokenResponse.json()) as {
  access_token: string;
};
const authorization = `Bearer ${accessToken}`;
const getUrl =
  `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,contentDetails,status&id=${encodeURIComponent(broadcastId)}`;
const currentResponse = await fetch(getUrl, {
  headers: { Authorization: authorization }
});

if (!currentResponse.ok) {
  throw new Error(
    `YouTube broadcast lookup failed: ${currentResponse.status} ${await currentResponse.text()}`
  );
}

const currentPayload = (await currentResponse.json()) as {
  items?: Array<{
    id: string;
    contentDetails?: Record<string, unknown>;
    status?: Record<string, unknown>;
  }>;
};
const current = currentPayload.items?.[0];
if (!current) {
  throw new Error(`YouTube broadcast ${broadcastId} was not found.`);
}

console.log(
  JSON.stringify({
    broadcastId,
    before: {
      enableEmbed: current.contentDetails?.enableEmbed,
      lifeCycleStatus: current.status?.lifeCycleStatus
    }
  })
);

const updateResponse = await fetch(
  "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=contentDetails",
  {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id: broadcastId,
      contentDetails: {
        ...current.contentDetails,
        enableEmbed: true
      }
    })
  }
);

if (!updateResponse.ok) {
  throw new Error(
    `YouTube embed update failed: ${updateResponse.status} ${await updateResponse.text()}`
  );
}

const updated = (await updateResponse.json()) as {
  contentDetails?: { enableEmbed?: boolean };
};
console.log(
  JSON.stringify({
    broadcastId,
    after: { enableEmbed: updated.contentDetails?.enableEmbed }
  })
);
