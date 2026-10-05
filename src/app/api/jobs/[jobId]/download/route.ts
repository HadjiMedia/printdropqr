import { and, eq, gt } from "drizzle-orm";
import { isAdminAuthenticated } from "@/lib/auth";
import { db } from "@/db";
import { printJobs } from "@/db/schema";
import { getPrintFile } from "@/lib/storage";
import { safeFileName } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypeByExtension: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Staff sign-in is required." }, { status: 401 });
  }

  const { jobId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return Response.json({ error: "Print file not found." }, { status: 404 });
  }

  try {
    const [job] = await db
      .select({ fileUrl: printJobs.fileUrl, fileName: printJobs.fileName, fileSize: printJobs.fileSize })
      .from(printJobs)
      .where(andJobExists(jobId))
      .limit(1);

    if (!job) return Response.json({ error: "Print file not found or expired." }, { status: 404 });

    const file = await getPrintFile(job.fileUrl);
    const fileName = safeFileName(job.fileName);
    const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
    const dispositionName = encodeURIComponent(fileName).replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );

    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType || contentTypeByExtension[extension] || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${dispositionName}`,
        "Content-Length": String(job.fileSize),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("PrintDrop file download failed.", error);
    return Response.json({ error: "The private print file is temporarily unavailable." }, { status: 503 });
  }
}

function andJobExists(jobId: string) {
  return and(eq(printJobs.id, jobId), gt(printJobs.expiresAt, new Date()));
}
