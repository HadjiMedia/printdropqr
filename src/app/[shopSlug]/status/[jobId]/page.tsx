import { and, eq, gt } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { printJobs, shops } from "@/db/schema";
import {
  extractCancellationReason,
  extractPageCount,
  extractUserNotes,
  parseJobAttachments,
} from "@/lib/pricing";
import OrderStatusTracker from "@/components/order-status-tracker";

export const dynamic = "force-dynamic";

export default async function JobStatusPage({
  params,
}: {
  params: Promise<{ shopSlug: string; jobId: string }>;
}) {
  const { shopSlug, jobId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) notFound();

  try {
    const [result] = await db
      .select({
        id: printJobs.id,
        shopSlug: shops.slug,
        shopName: shops.name,
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
      .innerJoin(shops, eq(printJobs.shopId, shops.id))
      .where(and(eq(printJobs.id, jobId), eq(shops.slug, shopSlug), gt(printJobs.expiresAt, new Date())))
      .limit(1);

    if (!result) notFound();

    const cancellationReason = extractCancellationReason(result.notes);
    const pageCount = extractPageCount(result.notes);
    const userNotes = extractUserNotes(result.notes);
    const attachments = parseJobAttachments(result.fileUrl, result.fileName, result.fileSize).map((item) => ({
      index: item.index,
      name: item.name,
      size: item.size,
      ext: item.ext,
      mime: item.mime,
      previewUrl: `/api/jobs/${result.id}/preview?index=${item.index}`,
    }));

    return (
      <OrderStatusTracker
        job={{
          id: result.id,
          shopSlug: result.shopSlug,
          shopName: result.shopName,
          queueNumber: result.queueNumber,
          customerName: result.customerName,
          fileName: result.fileName,
          fileSize: result.fileSize,
          paperSize: result.paperSize,
          colorType: result.colorType,
          copies: result.copies,
          status: result.status,
          notes: userNotes,
          cancellationReason,
          pageCount,
          attachments,
          createdAt: result.createdAt.toISOString(),
          expiresAt: result.expiresAt.toISOString(),
        }}
      />
    );
  } catch (error) {
    console.error("PrintDrop status lookup failed:", error);
    notFound();
  }
}
