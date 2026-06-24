import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    console.error("Missing YOUTUBE_OAUTH_CLIENT_ID, YOUTUBE_OAUTH_CLIENT_SECRET, or YOUTUBE_OAUTH_REFRESH_TOKEN.");
    process.exit(1);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const payload = (await response.json()) as { error?: string; error_description?: string };
  if (!response.ok) {
    console.error(
      `YouTube OAuth refresh token is no longer valid: ${payload.error ?? response.status} ${payload.error_description ?? ""}`
    );
    process.exit(1);
  }
  console.log("YouTube OAuth refresh token is healthy.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
