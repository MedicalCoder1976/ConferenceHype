import { loadEnvConfig } from "@next/env";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

loadEnvConfig(process.cwd());

// Must exactly match an "Authorized redirect URI" registered on the Web
// application OAuth client in Google Cloud Console — Web app clients require
// an exact host+port match for localhost callbacks (unlike Desktop app
// clients, which allow any port). Register this once and it never changes.
const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth/callback`;
const SCOPE = "https://www.googleapis.com/auth/youtube";
const REPO = "lijosimpson/ConferenceHype";

function openBrowser(url: string) {
  if (process.platform === "win32") {
    // cmd.exe treats unquoted "&" in the URL as a command separator, truncating
    // the query string. Quote the target and disable Node's own arg-escaping so
    // our quotes reach cmd.exe verbatim.
    spawn("cmd", ["/c", "start", '""', `"${url}"`], {
      stdio: "ignore",
      detached: true,
      windowsVerbatimArguments: true
    }).unref();
  } else if (process.platform === "darwin") {
    spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  } else {
    spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
  }
}

function waitForAuthorizationCode(port: number, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      if (url.pathname !== "/oauth/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        error
          ? `<h1>Authorization failed</h1><p>${error}</p><p>You can close this tab.</p>`
          : `<h1>Authorized</h1><p>You can close this tab and return to the terminal.</p>`
      );
      res.on("finish", () => server.close());
      if (error) {
        reject(new Error(`Google returned an error: ${error}`));
      } else if (code) {
        resolve(code);
      } else {
        reject(new Error("No authorization code in callback."));
      }
    });
    server.listen(port);
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for browser authorization (5 minutes)."));
    }, timeoutMs);
    server.on("close", () => clearTimeout(timeout));
  });
}

function pushSecretWithGh(name: string, value: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("gh", ["secret", "set", name, "--repo", REPO], {
      stdio: ["pipe", "ignore", "ignore"]
    });
    child.on("error", () => resolve(false));
    child.on("close", (exitCode) => resolve(exitCode === 0));
    child.stdin.write(value);
    child.stdin.end();
  });
}

async function main() {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      "Add YOUTUBE_OAUTH_CLIENT_ID and YOUTUBE_OAUTH_CLIENT_SECRET to .env.local first " +
        "(Google Cloud Console > Credentials > your Web application client), then re-run this script."
    );
    process.exit(1);
  }

  const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", SCOPE);
  authorizeUrl.searchParams.set("access_type", "offline");
  authorizeUrl.searchParams.set("prompt", "consent");

  console.log("Opening your browser to sign in and approve YouTube access...");
  console.log(`If it does not open automatically, visit:\n${authorizeUrl.toString()}\n`);
  openBrowser(authorizeUrl.toString());

  const code = await waitForAuthorizationCode(PORT, 5 * 60_000);

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code"
    })
  });
  const tokenJson = (await tokenResponse.json()) as {
    refresh_token?: string;
    refresh_token_expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !tokenJson.refresh_token) {
    console.error(
      `Token exchange failed: ${tokenJson.error ?? tokenResponse.status} ${tokenJson.error_description ?? ""}`
    );
    process.exit(1);
  }

  const expiresInDays = tokenJson.refresh_token_expires_in
    ? (tokenJson.refresh_token_expires_in / 86400).toFixed(1)
    : "unknown (no expiry returned — likely already in production publishing mode)";
  console.log(`Got a new refresh token. Google reports it is valid for about ${expiresInDays} day(s).`);

  const pushed = await pushSecretWithGh("YOUTUBE_OAUTH_REFRESH_TOKEN", tokenJson.refresh_token);
  if (pushed) {
    console.log(`Pushed YOUTUBE_OAUTH_REFRESH_TOKEN to ${REPO} secrets automatically. Done.`);
  } else {
    console.log(
      "Could not push automatically via gh CLI (is it installed and authenticated?). " +
        `Copy the value below and paste it into https://github.com/${REPO}/settings/secrets/actions yourself. ` +
        "Do not paste it into a chat with an AI assistant, an issue, or anywhere else it could be logged.\n"
    );
    console.log(`Refresh token: ${tokenJson.refresh_token}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
