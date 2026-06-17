import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const required = [
  "YOUTUBE_OAUTH_CLIENT_ID",
  "YOUTUBE_OAUTH_CLIENT_SECRET",
  "YOUTUBE_OAUTH_REFRESH_TOKEN"
] as const;

async function main() {
  const broadcastId = process.env.YOUTUBE_VIDEO_ID;
  if (!broadcastId) {
    throw new Error("YOUTUBE_VIDEO_ID is required.");
  }

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

  if (current.contentDetails?.enableEmbed !== true) {
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
      console.warn(
        `::warning::YouTube liveBroadcasts embed update was rejected; continuing to iframe preflight: ${updateResponse.status} ${await updateResponse.text()}`
      );
    } else {
      const updated = (await updateResponse.json()) as {
        contentDetails?: { enableEmbed?: boolean };
      };
      console.log(
        JSON.stringify({
          broadcastId,
          after: { enableEmbed: updated.contentDetails?.enableEmbed }
        })
      );
    }
  }

  const videoResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(broadcastId)}`,
    { headers: { Authorization: authorization } }
  );
  if (!videoResponse.ok) {
    throw new Error(
      `YouTube video lookup failed: ${videoResponse.status} ${await videoResponse.text()}`
    );
  }

  const videoPayload = (await videoResponse.json()) as {
    items?: Array<{
      id: string;
      status?: Record<string, unknown>;
    }>;
  };
  const video = videoPayload.items?.[0];
  if (!video) {
    throw new Error(`YouTube video ${broadcastId} was not found.`);
  }

  console.log(
    JSON.stringify({
      broadcastId,
      videoBefore: { embeddable: video.status?.embeddable }
    })
  );

  if (video.status?.embeddable !== true) {
    const videoUpdateResponse = await fetch(
      "https://www.googleapis.com/youtube/v3/videos?part=status",
      {
        method: "PUT",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: broadcastId,
          status: {
            ...video.status,
            embeddable: true
          }
        })
      }
    );
    if (!videoUpdateResponse.ok) {
      console.warn(
        `::warning::YouTube videos embed update was rejected; continuing to iframe preflight: ${videoUpdateResponse.status} ${await videoUpdateResponse.text()}`
      );
    } else {
      const videoUpdated = (await videoUpdateResponse.json()) as {
        status?: { embeddable?: boolean };
      };
      console.log(
        JSON.stringify({
          broadcastId,
          videoAfter: { embeddable: videoUpdated.status?.embeddable }
        })
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
