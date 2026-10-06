import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { DatabaseConfigurationError, db } from "@/db";
import { printJobs, shops } from "@/db/schema";
import { deleteJobFiles, storePrintFile } from "@/lib/storage";
import {
  calculatePrintPrice,
  encodeNotesWithPages,
  getPricePerPage,
} from "@/lib/pricing";
import { extractPdfPageCount } from "@/lib/pdf";
import {
  createPrintJobSchema,
  fileExtension,
  hasValidFileSignature,
  MAX_FILE_SIZE,
  safeFileName,
  validateUploadMetadata,
} from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const mimeByExtension: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export async function POST(request: Request) {
  let storedReferenceOrManifest: string | undefined;
  const createdReferences: string[] = [];
  try {
    const form = await request.formData();
    const parsed = createPrintJobSchema.safeParse({
      shopSlug: form.get("shopSlug"),
      customerName: form.get("customerName"),
      pageCount: form.get("pageCount") || 1,
      copies: form.get("copies"),
      paperSize: form.get("paperSize"),
      colorType: form.get("colorType"),
      notes: form.get("notes") ?? "",
    });

    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Check the print request details." },
        { status: 400 },
      );
    }

    const rawFiles = form
      .getAll("files")
      .concat(form.getAll("file"))
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (rawFiles.length === 0) {
      return Response.json({ error: "Choose a file to print." }, { status: 400 });
    }

    const [shop] = await db.select().from(shops).where(eq(shops.slug, parsed.data.shopSlug)).limit(1);
    if (!shop) return Response.json({ error: "This print shop is not available." }, { status: 404 });

    const id = randomUUID();
    let fileName = "";
    let totalBytesLength = 0;
    let pageCount = Math.max(1, parsed.data.pageCount);

    if (rawFiles.length === 1) {
      const uploaded = rawFiles[0];
      const metadataError = validateUploadMetadata(uploaded);
      if (metadataError) return Response.json({ error: metadataError }, { status: 400 });

      const bytes = Buffer.from(await uploaded.arrayBuffer());
      if (bytes.byteLength > MAX_FILE_SIZE) {
        return Response.json({ error: "Files must be 50 MB or smaller." }, { status: 413 });
      }

      const extension = fileExtension(uploaded.name);
      if (!hasValidFileSignature(extension, bytes)) {
        return Response.json(
          { error: "This file does not appear to match its extension. Please choose a valid document or image." },
          { status: 400 },
        );
      }

      if (extension === "pdf" && (!form.get("pageCount") || parsed.data.pageCount === 1)) {
        const detectedPages = extractPdfPageCount(bytes);
        if (detectedPages > 1) {
          pageCount = detectedPages;
        }
      }

      fileName = safeFileName(uploaded.name);
      totalBytesLength = bytes.byteLength;
      const ref = await storePrintFile(
        `uploads/${shop.id}/${id}.${extension}`,
        bytes,
        mimeByExtension[extension] || "application/octet-stream",
      );
      createdReferences.push(ref);
      storedReferenceOrManifest = ref;
    } else {
      // Multiple files - must all be images
      const manifests: Array<{
        index: number;
        name: string;
        size: number;
        ext: string;
        mime: string;
        url: string;
      }> = [];

      for (let i = 0; i < rawFiles.length; i++) {
        const file = rawFiles[i];
        const ext = fileExtension(file.name);
        if (!["png", "jpg", "jpeg"].includes(ext)) {
          return Response.json(
            { error: "Multiple uploads only support images (PNG, JPG, or JPEG)." },
            { status: 400 },
          );
        }

        const metadataError = validateUploadMetadata(file);
        if (metadataError) return Response.json({ error: metadataError }, { status: 400 });

        const bytes = Buffer.from(await file.arrayBuffer());
        totalBytesLength += bytes.byteLength;
        if (totalBytesLength > MAX_FILE_SIZE) {
          return Response.json({ error: "Total combined files must be 50 MB or smaller." }, { status: 413 });
        }

        if (!hasValidFileSignature(ext, bytes)) {
          return Response.json(
            { error: `File "${file.name}" does not appear to be a valid image.` },
            { status: 400 },
          );
        }

        const cleanName = safeFileName(file.name);
        const ref = await storePrintFile(
          `uploads/${shop.id}/${id}_${i}.${ext}`,
          bytes,
          mimeByExtension[ext] || "image/jpeg",
        );
        createdReferences.push(ref);
        manifests.push({
          index: i,
          name: cleanName,
          size: bytes.byteLength,
          ext,
          mime: mimeByExtension[ext] || "image/jpeg",
          url: ref,
        });
      }

      // Default page count to number of uploaded images unless overridden
      if (!form.get("pageCount") || parsed.data.pageCount === 1) {
        pageCount = rawFiles.length;
      }

      fileName = `${rawFiles.length} Images: ${manifests.map((m) => m.name).slice(0, 3).join(", ")}${manifests.length > 3 ? "…" : ""}`.slice(0, 180);
      storedReferenceOrManifest = JSON.stringify(manifests);
    }

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    const storedNotes = encodeNotesWithPages(parsed.data.notes, pageCount);
    const totalPrice = calculatePrintPrice(pageCount, parsed.data.copies, parsed.data.colorType, parsed.data.paperSize);
    const pricePerPage = getPricePerPage(parsed.data.colorType, parsed.data.paperSize);

    try {
      const created = await db.transaction(async (tx) => {
        const [counter] = await tx
          .update(shops)
          .set({ nextQueueNumber: sql`${shops.nextQueueNumber} + 1` })
          .where(eq(shops.id, shop.id))
          .returning({ queueNumber: sql<number>`${shops.nextQueueNumber} - 1` });

        if (!counter) throw new Error("Print shop was removed while accepting the request.");

        const [job] = await tx
          .insert(printJobs)
          .values({
            id,
            shopId: shop.id,
            queueNumber: counter.queueNumber,
            customerName: parsed.data.customerName,
            fileUrl: storedReferenceOrManifest!,
            fileName,
            fileSize: totalBytesLength,
            paperSize: parsed.data.paperSize,
            colorType: parsed.data.colorType,
            copies: parsed.data.copies,
            notes: storedNotes,
            status: "WAITING",
            createdAt,
            expiresAt,
          })
          .returning({ id: printJobs.id, queueNumber: printJobs.queueNumber });

        return job;
      });

      return Response.json(
        {
          jobId: created.id,
          queueNumber: created.queueNumber,
          status: "WAITING",
          pageCount,
          copies: parsed.data.copies,
          paperSize: parsed.data.paperSize,
          colorType: parsed.data.colorType,
          pricePerPage,
          totalPrice,
          expiresAt: expiresAt.toISOString(),
        },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (storedReferenceOrManifest) {
        await deleteJobFiles(storedReferenceOrManifest).catch((cleanupError: unknown) => {
          console.error("PrintDrop upload rollback cleanup failed.", cleanupError);
        });
      }
      storedReferenceOrManifest = undefined;
      throw error;
    }
  } catch (error) {
    if (storedReferenceOrManifest) {
      await deleteJobFiles(storedReferenceOrManifest).catch(() => {});
    }
    console.error("PrintDrop could not accept a print job.", error);
    if (error instanceof DatabaseConfigurationError) {
      return Response.json(
        { error: "Database is not configured yet. Please configure DATABASE_URL in Vercel settings." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    const message = error instanceof Error ? error.message : "Unexpected request error.";
    if (message.includes("request entity too large") || message.includes("payload too large")) {
      return Response.json({ error: "Files must be 50 MB or smaller." }, { status: 413 });
    }
    return Response.json(
      { error: "We couldn't send your request right now. Please try again in a moment." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
