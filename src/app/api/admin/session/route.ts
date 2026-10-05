import { NextResponse } from "next/server";
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, adminAuthReady, checkAdminPassword, createAdminToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!adminAuthReady()) {
    return Response.json(
      { error: "Staff access is not configured yet. Set ADMIN_PASSWORD and a SESSION_SECRET of at least 32 characters." },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password !== "string" || !checkAdminPassword(body.password)) {
      return Response.json({ error: "That password didn't match. Please try again." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, createAdminToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_SESSION_SECONDS,
    });
    return response;
  } catch {
    return Response.json({ error: "Unable to sign in. Please try again." }, { status: 400 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
