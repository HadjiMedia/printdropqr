import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { printJobs } from "@/db/schema";
import { getPrintFile } from "@/lib/storage";
import { parseJobAttachments } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return Response.json({ error: "Print file not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const targetIndex = Math.max(0, parseInt(url.searchParams.get("index") || "0", 10) || 0);

  try {
    const [job] = await db
      .select({
        fileUrl: printJobs.fileUrl,
        fileName: printJobs.fileName,
        fileSize: printJobs.fileSize,
      })
      .from(printJobs)
      .where(and(eq(printJobs.id, jobId), gt(printJobs.expiresAt, new Date())))
      .limit(1);

    if (!job) {
      return Response.json({ error: "Print file not found or expired." }, { status: 404 });
    }

    const attachments = parseJobAttachments(job.fileUrl, job.fileName, job.fileSize);
    const attachment = attachments[targetIndex] || attachments[0];

    if (!attachment || !attachment.url) {
      return Response.json({ error: "Attachment not available." }, { status: 404 });
    }

    const file = await getPrintFile(attachment.url);
    const dispositionName = encodeURIComponent(attachment.name).replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );

    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType || attachment.mime || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${dispositionName}`,
        "Content-Length": attachment.size ? String(attachment.size) : String(job.fileSize),
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("PrintDrop preview stream failed.", error);
    return Response.json({ error: "The preview is temporarily unavailable." }, { status: 503 });
  }
}
