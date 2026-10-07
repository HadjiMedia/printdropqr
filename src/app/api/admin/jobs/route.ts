import { and, desc, eq, gt } from "drizzle-orm";
import { isAdminAuthenticated } from "@/lib/auth";
import { DatabaseConfigurationError, db } from "@/db";
import { printJobs, shops } from "@/db/schema";
import {
  calculatePrintPrice,
  extractCancellationReason,
  extractPageCount,
  extractUserNotes,
  getPricePerPage,
  parseJobAttachments,
} from "@/lib/pricing";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Staff sign-in is required." }, { status: 401 });
  }

  const shopSlug = new URL(request.url).searchParams.get("shop");
  if (!shopSlug) return Response.json({ error: "Choose a shop." }, { status: 400 });

  try {
    const [shop] = await db.select({ id: shops.id }).from(shops).where(eq(shops.slug, shopSlug)).limit(1);
    if (!shop) return Response.json({ error: "Shop not found." }, { status: 404 });

    const rawJobs = await db
      .select({
        id: printJobs.id,
        queueNumber: printJobs.queueNumber,
        customerName: printJobs.customerName,
        fileUrl: printJobs.fileUrl,
        fileName: printJobs.fileName,
        fileSize: printJobs.fileSize,
        paperSize: printJobs.paperSize,
        colorType: printJobs.colorType,
        copies: printJobs.copies,
        notes: printJobs.notes,
        status: printJobs.status,
        createdAt: printJobs.createdAt,
        expiresAt: printJobs.expiresAt,
      })
      .from(printJobs)
      .where(and(eq(printJobs.shopId, shop.id), gt(printJobs.expiresAt, new Date())))
      .orderBy(desc(printJobs.createdAt))
      .limit(150);

    const jobs = rawJobs.map((job) => {
      const pageCount = extractPageCount(job.notes);
      const cancellationReason = extractCancellationReason(job.notes);
      const attachments = parseJobAttachments(job.fileUrl, job.fileName, job.fileSize).map((item) => ({
        index: item.index,
        name: item.name,
        size: item.size,
        ext: item.ext,
        mime: item.mime,
        previewUrl: `/api/jobs/${job.id}/preview?index=${item.index}`,
        downloadUrl: `/api/jobs/${job.id}/download?index=${item.index}`,
      }));

      return {
        id: job.id,
        queueNumber: job.queueNumber,
        customerName: job.customerName,
        fileName: job.fileName,
        fileSize: job.fileSize,
        paperSize: job.paperSize,
        colorType: job.colorType,
        copies: job.copies,
        status: job.status,
        createdAt: job.createdAt,
        expiresAt: job.expiresAt,
        shopSlug,
        pageCount,
        notes: extractUserNotes(job.notes),
        cancellationReason,
        attachments,
        pricePerPage: getPricePerPage(job.colorType, job.paperSize),
        totalPrice: calculatePrintPrice(pageCount, job.copies, job.colorType, job.paperSize),
        downloadUrl: `/api/jobs/${job.id}/download`,
        downloadAllUrl: attachments.length > 1 ? `/api/jobs/${job.id}/download?all=1` : `/api/jobs/${job.id}/download`,
      };
    });

    return Response.json({ jobs }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("PrintDrop dashboard refresh failed.", error);
    if (error instanceof DatabaseConfigurationError) {
      return Response.json(
        { error: "The database is not configured yet. Set DATABASE_URL in Vercel settings.", jobs: [] },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json({ error: "Unable to refresh the print queue." }, { status: 500 });
  }
}
