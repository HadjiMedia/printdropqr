import { and, desc, eq, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { printJobs, shops } from "@/db/schema";
import { isAdminAuthenticated } from "@/lib/auth";
import { ensureStarterShop } from "@/lib/shop";
import {
  calculatePrintPrice,
  extractCancellationReason,
  extractPageCount,
  extractUserNotes,
  getPricePerPage,
  parseJobAttachments,
} from "@/lib/pricing";
import { getLatestDeliveriesForJobs } from "@/lib/telegram";
import AdminDashboard from "@/components/admin-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string | string[] }>;
}) {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");

  await ensureStarterShop();

  let allShops: { id: string; name: string; slug: string; createdAt: Date }[] = [];
  try {
    allShops = await db
      .select({ id: shops.id, name: shops.name, slug: shops.slug, createdAt: shops.createdAt })
      .from(shops)
      .orderBy(shops.name);
  } catch (err) {
    console.error("PrintDrop admin dashboard could not load shops from database:", err);
    allShops = [
      {
        id: "00000000-0000-0000-0000-000000000000",
        name: process.env.DEFAULT_SHOP_NAME?.trim() || "Sunbeam Print Co.",
        slug: process.env.DEFAULT_SHOP_SLUG || "sunbeam-print",
        createdAt: new Date(),
      },
    ];
  }

  const query = await searchParams;
  const requestedSlug = Array.isArray(query.shop) ? query.shop[0] : query.shop;
  const selectedShop = allShops.find((shop) => shop.slug === requestedSlug) ?? allShops[0];

  let initialJobs: Array<{
    id: string;
    queueNumber: number;
    customerName: string;
    fileName: string;
    fileSize: number;
    paperSize: "A4" | "LETTER" | "LEGAL";
    colorType: "BW" | "COLOR";
    copies: number;
    notes: string;
    cancellationReason: string | null;
    status: "WAITING" | "PRINTING" | "DONE" | "CANCELLED";
    pageCount: number;
    pricePerPage: number;
    totalPrice: number;
    attachments: Array<{
      index: number;
      name: string;
      size: number;
      ext: string;
      mime: string;
      previewUrl: string;
      downloadUrl: string;
    }>;
    createdAt: string;
    expiresAt: string;
  }> = [];

  if (selectedShop) {
    try {
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
        .where(and(eq(printJobs.shopId, selectedShop.id), gt(printJobs.expiresAt, new Date())))
        .orderBy(desc(printJobs.createdAt))
        .limit(150);

      const jobIds = rawJobs.map((j) => j.id);
      const deliveriesMap = await getLatestDeliveriesForJobs(jobIds);

      initialJobs = rawJobs.map((job) => {
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
          notes: extractUserNotes(job.notes),
          cancellationReason,
          status: job.status,
          pageCount,
          pricePerPage: getPricePerPage(job.colorType, job.paperSize),
          totalPrice: calculatePrintPrice(pageCount, job.copies, job.colorType, job.paperSize),
          attachments,
          downloadUrl: `/api/jobs/${job.id}/download`,
          downloadAllUrl: attachments.length > 1 ? `/api/jobs/${job.id}/download?all=1` : `/api/jobs/${job.id}/download`,
          telegramDelivery: deliveriesMap[job.id] || null,
          createdAt: job.createdAt.toISOString(),
          expiresAt: job.expiresAt.toISOString(),
        };
      });
    } catch (err) {
      console.error("PrintDrop admin dashboard could not load jobs from database:", err);
      initialJobs = [];
    }
  }

  return (
    <AdminDashboard
      shops={allShops.map((shop) => ({ ...shop, createdAt: shop.createdAt.toISOString() }))}
      selectedSlug={selectedShop?.slug ?? ""}
      initialJobs={initialJobs}
    />
  );
}
