import { eq } from "drizzle-orm";
import { isAdminAuthenticated } from "@/lib/auth";
import { DatabaseConfigurationError, db } from "@/db";
import { printJobs } from "@/db/schema";
import { encodeCancellationReason, extractCancellationReason } from "@/lib/pricing";
import { getLatestDeliveryForJob, sendJobFileToTelegram } from "@/lib/telegram";

// Route imports must remain build-safe; database access happens only in PATCH.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const validStatuses = ["WAITING", "PRINTING", "DONE", "CANCELLED"] as const;
type JobStatus = (typeof validStatuses)[number];

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
    const body = (await request.json()) as { status?: unknown; reason?: unknown };
    const rawStatus = typeof body.status === "string" ? body.status.toUpperCase().trim() : "";
    const nextStatus = (rawStatus === "COMPLETED" ? "DONE" : rawStatus) as JobStatus;

    if (!validStatuses.includes(nextStatus)) {
      return Response.json({ error: "Choose a valid print status." }, { status: 400 });
    }

    let newNotes: string | undefined;
    let cancellationReason: string | null = null;

    if (nextStatus === "CANCELLED") {
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!reason) {
        return Response.json(
          { error: "A cancellation reason is required to cancel this job." },
          { status: 400 },
        );
      }
      cancellationReason = reason;

      const [existing] = await db
        .select({ notes: printJobs.notes })
        .from(printJobs)
        .where(eq(printJobs.id, jobId))
        .limit(1);

      if (!existing) {
        return Response.json({ error: "Print request not found." }, { status: 404 });
      }

      newNotes = encodeCancellationReason(existing.notes, reason);
    }

    const updateFields: { status: JobStatus; notes?: string } = { status: nextStatus };
    if (newNotes !== undefined) {
      updateFields.notes = newNotes;
    }

    const [updated] = await db
      .update(printJobs)
      .set(updateFields)
      .where(eq(printJobs.id, jobId))
      .returning({ id: printJobs.id, status: printJobs.status, notes: printJobs.notes });

    if (!updated) {
      return Response.json({ error: "Print request not found." }, { status: 404 });
    }

    // Trigger Telegram delivery asynchronously when a job becomes completed (DONE)
    // CRITICAL: Telegram delivery runs independently and does NOT modify print job status.
    if (nextStatus === "DONE") {
      void sendJobFileToTelegram(jobId).catch((err) => {
        console.error("[TelegramDelivery] Background completion send error:", err);
      });
    }

    const delivery = await getLatestDeliveryForJob(jobId);

    return Response.json(
      {
        id: updated.id,
        status: updated.status,
        printStatus: updated.status,
        cancellationReason: cancellationReason ?? extractCancellationReason(updated.notes),
        telegramDelivery: delivery,
      },
      { headers: { "Cache-Control": "no-store, no-cache" } },
    );
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
