import { and, eq, gt } from "drizzle-orm";
import { DatabaseConfigurationError, db } from "@/db";
import { printJobs, shops } from "@/db/schema";
import {
  calculatePrintPrice,
  extractPageCount,
  extractUserNotes,
  getPricePerPage,
} from "@/lib/pricing";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return Response.json({ error: "Print request not found." }, { status: 404 });
  }

  try {
    const [job] = await db
      .select({
        id: printJobs.id,
        shopSlug: shops.slug,
        shopName: shops.name,
        queueNumber: printJobs.queueNumber,
        customerName: printJobs.customerName,
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
      .innerJoin(shops, eq(printJobs.shopId, shops.id))
      .where(and(eq(printJobs.id, jobId), gt(printJobs.expiresAt, new Date())))
      .limit(1);

    if (!job) return Response.json({ error: "Print request not found or expired." }, { status: 404 });

    const pageCount = extractPageCount(job.notes);
    const cleanNotes = extractUserNotes(job.notes);
    const pricePerPage = getPricePerPage(job.colorType);
    const totalPrice = calculatePrintPrice(pageCount, job.copies, job.colorType);

    return Response.json(
      {
        ...job,
        pageCount,
        notes: cleanNotes,
        pricePerPage,
        totalPrice,
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    console.error("PrintDrop status lookup failed.", error);
    if (error instanceof DatabaseConfigurationError) {
      return Response.json(
        { error: "Database is not configured yet. Please configure DATABASE_URL in Vercel settings." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json({ error: "Unable to load this print request." }, { status: 500 });
  }
}
