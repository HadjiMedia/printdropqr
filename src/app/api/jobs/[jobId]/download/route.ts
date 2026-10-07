import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { printJobs } from "@/db/schema";
import { getPrintFile, getPrintFileBuffer } from "@/lib/storage";
import { safeFileName } from "@/lib/validation";
import { parseJobAttachments } from "@/lib/pricing";
import { createZipArchive, type ZipFileInput } from "@/lib/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypeByExtension: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  zip: "application/zip",
};

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return new Response("Print file not found.", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const url = new URL(request.url);
  const isInline = url.searchParams.get("inline") === "1";
  const downloadAll = url.searchParams.get("all") === "1";
  const hasIndexParam = url.searchParams.has("index");
  const targetIndex = Math.max(0, parseInt(url.searchParams.get("index") || "0", 10) || 0);

  try {
    const [job] = await db
      .select({
        queueNumber: printJobs.queueNumber,
        fileUrl: printJobs.fileUrl,
        fileName: printJobs.fileName,
        fileSize: printJobs.fileSize,
      })
      .from(printJobs)
      .where(and(eq(printJobs.id, jobId), gt(printJobs.expiresAt, new Date())))
      .limit(1);

    if (!job) {
      return new Response("Print file not found or expired.", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const attachments = parseJobAttachments(job.fileUrl, job.fileName, job.fileSize);
    if (attachments.length === 0) {
      return new Response("No downloadable attachments found.", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // MULTIPLE FILES ZIP DOWNLOAD:
    // If user explicitly asks for ?all=1 OR if there are multiple attachments and no specific index was requested
    if (attachments.length > 1 && (downloadAll || !hasIndexParam)) {
      const zipEntries: ZipFileInput[] = [];

      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        if (!att.url) continue;
        try {
          const { buffer } = await getPrintFileBuffer(att.url);
          const sanitized = safeFileName(att.name || `image_${i + 1}.${att.ext || "jpg"}`);
          zipEntries.push({
            name: sanitized,
            data: buffer,
          });
        } catch (readErr) {
          console.error(`Failed to read attachment ${i} for job ${jobId}:`, readErr);
        }
      }

      if (zipEntries.length === 0) {
        return new Response("Unable to bundle files for download.", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        });
      }

      const zipBuffer = createZipArchive(zipEntries);
      const zipName = `PrintDrop_Queue_${job.queueNumber}_Photos.zip`;
      const dispositionName = encodeURIComponent(zipName).replace(/[!'()*]/g, (c) =>
        `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      );

      return new Response(new Uint8Array(zipBuffer), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${zipName}"; filename*=UTF-8''${dispositionName}`,
          "Content-Length": String(zipBuffer.byteLength),
          "Cache-Control": "private, no-cache, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // SINGLE FILE / SPECIFIC ATTACHMENT DOWNLOAD:
    const attachment = attachments[targetIndex] || attachments[0];
    if (!attachment || !attachment.url) {
      return new Response("Requested attachment not found.", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const file = await getPrintFile(attachment.url);
    const fileName = safeFileName(attachment.name || job.fileName || "print-file");
    const extension = attachment.ext || fileName.split(".").pop()?.toLowerCase() || "";
    const contentType =
      file.contentType ||
      attachment.mime ||
      contentTypeByExtension[extension] ||
      "application/octet-stream";

    const dispositionType = isInline ? "inline" : "attachment";
    const dispositionName = encodeURIComponent(fileName).replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );

    return new Response(file.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${dispositionType}; filename="${fileName}"; filename*=UTF-8''${dispositionName}`,
        ...(attachment.size ? { "Content-Length": String(attachment.size) } : {}),
        "Cache-Control": "private, no-cache, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("PrintDrop file download failed.", error);
    return new Response("The requested print file is temporarily unavailable.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
