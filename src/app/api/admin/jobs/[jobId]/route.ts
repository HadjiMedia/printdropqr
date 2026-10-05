import { and, eq, gt } from "drizzle-orm";
import { isAdminAuthenticated } from "@/lib/auth";
import { DatabaseConfigurationError, db } from "@/db";
import { printJobs } from "@/db/schema";

// Route imports must remain build-safe; database access happens only in PATCH.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const statuses = ["WAITING", "PRINTING", "DONE", "CANCELLED"] as const;
type JobStatus = (typeof statuses)[number];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Staff sign-in is required." }, { status: 401 });
  }

  const { jobId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return Response.json({ error: "Print request not found." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { status?: unknown };
    if (typeof body.status !== "string" || !statuses.includes(body.status as JobStatus)) {
      return Response.json({ error: "Choose a valid print status." }, { status: 400 });
    }

    const [updated] = await db
      .update(printJobs)
      .set({ status: body.status as JobStatus })
      .where(and(eq(printJobs.id, jobId), gt(printJobs.expiresAt, new Date())))
      .returning({ id: printJobs.id, status: printJobs.status });

    if (!updated) {
      return Response.json({ error: "Print request not found." }, { status: 404 });
    }

    return Response.json(updated, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("PrintDrop status update failed.", error);
    if (error instanceof DatabaseConfigurationError) {
      return Response.json(
        { error: "The print service is not configured yet. Please contact the shop administrator." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { error: "Unable to update this print request." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
