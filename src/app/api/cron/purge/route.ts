import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { printJobs } from "@/db/schema";
import { deleteJobFiles } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cronAuthorized(request: Request): boolean {
  const configured = process.env.CRON_SECRET;
  if (!configured) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expectedDigest = createHash("sha256").update(configured).digest();
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

export async function GET(request: Request) {
  return purgeExpiredJobs(request);
}

export async function POST(request: Request) {
  return purgeExpiredJobs(request);
}

async function purgeExpiredJobs(request: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const expired = await db
      .select({ id: printJobs.id, fileUrl: printJobs.fileUrl })
      .from(printJobs)
      .where(lt(printJobs.expiresAt, new Date()))
      .limit(250);

    let purged = 0;
    const failures: string[] = [];

    for (const job of expired) {
      try {
        await deleteJobFiles(job.fileUrl);
        const deleted = await db
          .delete(printJobs)
          .where(and(eq(printJobs.id, job.id), lt(printJobs.expiresAt, new Date())))
          .returning({ id: printJobs.id });
        if (deleted.length) purged += 1;
      } catch (error) {
        console.error(`PrintDrop retention cleanup failed for job ${job.id}.`, error);
        failures.push(job.id);
      }
    }

    return Response.json({
      ok: failures.length === 0,
      checked: expired.length,
      purged,
      failed: failures.length,
      failedJobIds: failures,
    });
  } catch (error) {
    console.error("PrintDrop retention sweep failed.", error);
    return Response.json({ error: "Unable to complete the retention sweep." }, { status: 500 });
  }
}
