import { SignJWT, importPKCS8 } from "jose";
import { connect, type ClientHttp2Session } from "node:http2";

// Apple provider tokens are valid up to ~60 min; refresh well before that
// and reuse across requests instead of minting one per send.
const TOKEN_TTL_MS = 50 * 60 * 1000;

let cachedToken: { jwt: string; mintedAt: number } | null = null;
let session: ClientHttp2Session | null = null;

function apnsHost(): string {
  return process.env.APNS_ENV === "development" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
}

function apnsBundleId(): string {
  return process.env.APNS_BUNDLE_ID ?? "com.clubtermin.app";
}

function apnsPrivateKeyPem(): string {
  return (process.env.APNS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
}

export function isApnsConfigured(): boolean {
  return !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY);
}

async function getProviderToken(forceFresh = false): Promise<string> {
  if (!forceFresh && cachedToken && Date.now() - cachedToken.mintedAt < TOKEN_TTL_MS) {
    return cachedToken.jwt;
  }

  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!keyId || !teamId) {
    throw new Error("apns_not_configured");
  }

  const privateKey = await importPKCS8(apnsPrivateKeyPem(), "ES256");
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuedAt()
    .setIssuer(teamId)
    .sign(privateKey);

  cachedToken = { jwt, mintedAt: Date.now() };
  return jwt;
}

function getSession(): ClientHttp2Session {
  if (session && !session.closed && !session.destroyed) return session;
  session = connect(apnsHost());
  session.on("error", () => {
    session = null;
  });
  session.on("goaway", () => {
    session = null;
  });
  return session;
}

export interface ApnsPayload {
  title: string;
  body: string;
  url: string;
}

export type ApnsSendResult = { ok: true } | { ok: false; status: number; reason: string };

const PRUNE_REASONS = new Set(["Unregistered", "BadDeviceToken", "DeviceTokenNotForTopic"]);

export function shouldPruneApnsToken(result: ApnsSendResult): boolean {
  return !result.ok && (result.status === 410 || PRUNE_REASONS.has(result.reason));
}

function post(deviceToken: string, payload: ApnsPayload, jwt: string): Promise<ApnsSendResult> {
  const body = JSON.stringify({
    aps: { alert: { title: payload.title, body: payload.body }, sound: "default" },
    url: payload.url,
  });

  return new Promise((resolve, reject) => {
    const req = getSession().request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": apnsBundleId(),
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let status = 0;
    let raw = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (status === 200) {
        resolve({ ok: true });
        return;
      }
      let reason = "Unknown";
      try {
        reason = raw ? (JSON.parse(raw).reason ?? "Unknown") : "Unknown";
      } catch {
        // leave reason as "Unknown"
      }
      resolve({ ok: false, status, reason });
    });
    req.on("error", reject);
    req.end(body);
  });
}

export async function sendApnsNotification(deviceToken: string, payload: ApnsPayload): Promise<ApnsSendResult> {
  const jwt = await getProviderToken();
  const result = await post(deviceToken, payload, jwt);
  if (!result.ok && result.reason === "ExpiredProviderToken") {
    return post(deviceToken, payload, await getProviderToken(true));
  }
  return result;
}
