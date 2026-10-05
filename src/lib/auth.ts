import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "printdrop_admin";
export const ADMIN_SESSION_SECONDS = 60 * 60 * 12;

type SessionPayload = { sub: "staff"; exp: number };

export function adminAuthReady(): boolean {
  const secret = process.env.SESSION_SECRET;
  return Boolean(
    process.env.ADMIN_PASSWORD &&
      secret &&
      Buffer.byteLength(secret, "utf8") >= 32,
  );
}

export function checkAdminPassword(candidate: string): boolean {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) return false;
  const expectedDigest = createHash("sha256").update(configured).digest();
  const candidateDigest = createHash("sha256").update(candidate).digest();
  return timingSafeEqual(expectedDigest, candidateDigest);
}

function sign(payload: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  }
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAdminToken(now = Date.now()): string {
  const payload: SessionPayload = {
    sub: "staff",
    exp: Math.floor(now / 1000) + ADMIN_SESSION_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyAdminToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return false;

  let expected: string;
  try {
    expected = sign(encoded);
  } catch {
    return false;
  }

  const expectedBytes = Buffer.from(expected, "base64url");
  const suppliedBytes = Buffer.from(signature, "base64url");
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<SessionPayload>;
    return payload.sub === "staff" && typeof payload.exp === "number" && payload.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminToken(cookieStore.get(ADMIN_COOKIE)?.value);
}
