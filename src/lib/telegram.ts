import { eq, desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { printJobs, printFileDeliveries, type deliveryStatusEnum } from "@/db/schema";
import { getPrintFileBuffer } from "@/lib/storage";
import { parseJobAttachments, extractPageCount } from "@/lib/pricing";
import { safeFileName } from "@/lib/validation";

export type DeliveryStatus = (typeof deliveryStatusEnum.enumValues)[number];

export interface TelegramDeliveryRecord {
  id: string;
  jobId: string;
  provider: string;
  status: DeliveryStatus;
  telegramChatId: string | null;
  telegramMessageId: string | null;
  telegramFileId: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  fileSize: number | null;
  attemptCount: number;
  lastAttemptAt: Date | null;
  sentAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/**
 * Retrieve server-side Telegram credentials.
 * Secrets are never exposed to the client or logged.
 */
export function getTelegramConfig(): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = (
    process.env.TELEGRAM_USER_ID ||
    process.env.TELEGRAM_CHAT_ID
  )?.trim();

  if (!botToken || !chatId) {
    return null;
  }

  return { botToken, chatId };
}

export function isTelegramConfigured(): boolean {
  return getTelegramConfig() !== null;
}

/**
 * Strips any Telegram bot token from error messages before saving or logging.
 */
function sanitizeTelegramError(error: unknown, token?: string): string {
  let text = error instanceof Error ? error.message : String(error);
  if (token) {
    text = text.split(token).join("[REDACTED_BOT_TOKEN]");
  }
  // Generic bot token regex: \d+:[A-Za-z0-9_-]{20,}
  text = text.replace(/\b\d+:[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_BOT_TOKEN]");
  return text.slice(0, 500);
}

let tableChecked = false;

/**
 * Ensures the print_file_deliveries table exists in PostgreSQL if migrations
 * haven't been applied yet. Runs at most once per process.
 */
export async function ensureDeliveriesTable(): Promise<void> {
  if (tableChecked) return;
  try {
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status') THEN
          CREATE TYPE delivery_status AS ENUM ('PENDING', 'UPLOADING', 'SENT', 'FAILED', 'RETRYING');
        END IF;
      END$$;

      CREATE TABLE IF NOT EXISTS print_file_deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
        provider VARCHAR(32) NOT NULL DEFAULT 'TELEGRAM',
        status delivery_status NOT NULL DEFAULT 'PENDING',
        telegram_chat_id VARCHAR(64),
        telegram_message_id VARCHAR(64),
        telegram_file_id TEXT,
        original_filename VARCHAR(255),
        mime_type VARCHAR(120),
        file_size INTEGER,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS print_file_deliveries_job_id_idx ON print_file_deliveries(job_id);
      CREATE INDEX IF NOT EXISTS print_file_deliveries_status_idx ON print_file_deliveries(status);
      CREATE INDEX IF NOT EXISTS print_file_deliveries_created_at_idx ON print_file_deliveries(created_at);
    `);
    tableChecked = true;
  } catch (err) {
    console.error("PrintDrop ensureDeliveriesTable warning:", err);
    tableChecked = true;
  }
}

/**
 * Returns the latest delivery record for a print job.
 */
export async function getLatestDeliveryForJob(
  jobId: string,
): Promise<TelegramDeliveryRecord | null> {
  await ensureDeliveriesTable();
  try {
    const [record] = await db
      .select()
      .from(printFileDeliveries)
      .where(eq(printFileDeliveries.jobId, jobId))
      .orderBy(desc(printFileDeliveries.createdAt))
      .limit(1);

    return (record as TelegramDeliveryRecord) ?? null;
  } catch (err) {
    console.error("Failed to query printFileDeliveries:", err);
    return null;
  }
}

export interface SendTelegramOptions {
  forceRetry?: boolean;
}

/**
 * Sends the original uploaded print file(s) for a job to the configured Telegram recipient.
 *
 * CRITICAL ARCHITECTURAL RULE:
 * This delivery lifecycle is COMPLETELY INDEPENDENT from the print job lifecycle.
 * Neither success nor failure modifies the print job status.
 */
export async function sendJobFileToTelegram(
  jobId: string,
  options: SendTelegramOptions = {},
): Promise<{
  success: boolean;
  delivery: TelegramDeliveryRecord | null;
  error?: string;
}> {
  await ensureDeliveriesTable();

  // 1. Validate Job Exists in Database
  const [job] = await db
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
    })
    .from(printJobs)
    .where(eq(printJobs.id, jobId))
    .limit(1);

  if (!job) {
    return { success: false, delivery: null, error: "Print job not found." };
  }

  // 2. Check Telegram Environment Configuration
  const config = getTelegramConfig();
  if (!config) {
    const errMsg =
      "Telegram bot is not configured. TELEGRAM_BOT_TOKEN and TELEGRAM_USER_ID must be set in the server environment.";
    console.warn(`[TelegramDelivery] jobId=${job.queueNumber} status=FAILED error="${errMsg}"`);

    // Record failure in deliveries table
    const [failedRecord] = await db
      .insert(printFileDeliveries)
      .values({
        jobId: job.id,
        provider: "TELEGRAM",
        status: "FAILED",
        originalFilename: job.fileName,
        fileSize: job.fileSize,
        attemptCount: 1,
        lastAttemptAt: new Date(),
        errorMessage: errMsg,
      })
      .returning();

    return {
      success: false,
      delivery: failedRecord as TelegramDeliveryRecord,
      error: errMsg,
    };
  }

  // 3. Idempotency Check & Duplicate Prevention
  const existing = await getLatestDeliveryForJob(job.id);
  if (existing) {
    // If already sent and not forcing a retry, return the sent record
    if (existing.status === "SENT" && !options.forceRetry) {
      return { success: true, delivery: existing };
    }

    // If currently uploading within the last 45 seconds, prevent duplicate sends
    if (
      existing.status === "UPLOADING" &&
      existing.lastAttemptAt &&
      Date.now() - new Date(existing.lastAttemptAt).getTime() < 45_000 &&
      !options.forceRetry
    ) {
      return { success: false, delivery: existing, error: "Upload is already in progress." };
    }
  }

  // 4. Create or Update Delivery Record as UPLOADING
  const attemptNumber = (existing?.attemptCount ?? 0) + 1;
  const now = new Date();

  console.log(`[TelegramDelivery] jobId=${job.queueNumber} status=UPLOADING attempt=${attemptNumber}`);

  let currentDeliveryId = existing?.id;
  if (!currentDeliveryId || existing?.status === "SENT") {
    // New delivery attempt record
    const [inserted] = await db
      .insert(printFileDeliveries)
      .values({
        jobId: job.id,
        provider: "TELEGRAM",
        status: "UPLOADING",
        telegramChatId: config.chatId,
        originalFilename: job.fileName,
        fileSize: job.fileSize,
        attemptCount: attemptNumber,
        lastAttemptAt: now,
      })
      .returning();
    currentDeliveryId = inserted.id;
  } else {
    // Update existing record
    await db
      .update(printFileDeliveries)
      .set({
        status: "UPLOADING",
        telegramChatId: config.chatId,
        attemptCount: attemptNumber,
        lastAttemptAt: now,
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(printFileDeliveries.id, currentDeliveryId));
  }

  // 5. Retrieve Original Uncompressed Files
  try {
    const attachments = parseJobAttachments(job.fileUrl, job.fileName, job.fileSize);
    if (attachments.length === 0) {
      throw new Error("No stored file attachments found for this job.");
    }

    const pageCount = extractPageCount(job.notes);
    const colorLabel = job.colorType === "COLOR" ? "Colored" : "Black & White";
    const specsSummary = `${job.paperSize} · ${colorLabel} · ${pageCount}p × ${job.copies} ${job.copies === 1 ? "set" : "sets"}`;

    let lastSentMessageId: string | null = null;
    let lastSentFileId: string | null = null;
    let deliveredMime: string = attachments[0].mime || "application/octet-stream";
    let deliveredSize: number = attachments[0].size || job.fileSize;
    let deliveredName: string = attachments[0].name || job.fileName;

    // Send each attachment as an original, uncompressed document
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      if (!att.url) throw new Error(`Missing storage reference for attachment ${i + 1}`);

      const { buffer, contentType } = await getPrintFileBuffer(att.url);
      const cleanFileName = safeFileName(att.name || `photo_${i + 1}.${att.ext || "jpg"}`);
      deliveredMime = contentType || att.mime || "application/octet-stream";
      deliveredSize = buffer.byteLength;
      deliveredName = cleanFileName;

      // Caption for Telegram document
      let caption = `🖨️ <b>Queue #${job.queueNumber}</b> — ${job.customerName}\n`;
      if (attachments.length > 1) {
        caption += `🖼️ <b>File [${i + 1}/${attachments.length}]:</b> ${cleanFileName}\n`;
      } else {
        caption += `📄 <b>File:</b> ${cleanFileName}\n`;
      }
      caption += `📋 <b>Print Specs:</b> ${specsSummary}`;

      const formData = new FormData();
      formData.append("chat_id", config.chatId);
      formData.append("caption", caption);
      formData.append("parse_mode", "HTML");

      // Blob preserves exact byte contents, filename, and MIME type
      const fileBlob = new Blob([new Uint8Array(buffer)], { type: deliveredMime });
      formData.append("document", fileBlob, cleanFileName);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);

      const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendDocument`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const json = (await response.json()) as {
        ok: boolean;
        description?: string;
        result?: {
          message_id: number;
          document?: { file_id: string };
        };
      };

      if (!response.ok || !json.ok) {
        const errorDetail = json.description || `HTTP ${response.status} ${response.statusText}`;
        throw new Error(`Telegram API rejected upload: ${errorDetail}`);
      }

      lastSentMessageId = String(json.result?.message_id ?? "");
      lastSentFileId = json.result?.document?.file_id ?? null;
    }

    // 6. Mark Delivery as SENT
    const completedNow = new Date();
    const [sentRecord] = await db
      .update(printFileDeliveries)
      .set({
        status: "SENT",
        telegramMessageId: lastSentMessageId,
        telegramFileId: lastSentFileId,
        originalFilename: deliveredName,
        mimeType: deliveredMime,
        fileSize: deliveredSize,
        sentAt: completedNow,
        errorMessage: null,
        updatedAt: completedNow,
      })
      .where(eq(printFileDeliveries.id, currentDeliveryId))
      .returning();

    console.log(
      `[TelegramDelivery] jobId=${job.queueNumber} status=SENT messageId=${lastSentMessageId}`,
    );

    // IMPORTANT: Print job status is NOT touched!
    return {
      success: true,
      delivery: sentRecord as TelegramDeliveryRecord,
    };
  } catch (deliveryError) {
    const safeError = sanitizeTelegramError(deliveryError, config.botToken);
    console.error(`[TelegramDelivery] jobId=${job.queueNumber} status=FAILED error="${safeError}"`);

    const failedNow = new Date();
    const [failedRecord] = await db
      .update(printFileDeliveries)
      .set({
        status: "FAILED",
        errorMessage: safeError,
        updatedAt: failedNow,
      })
      .where(eq(printFileDeliveries.id, currentDeliveryId))
      .returning();

    // IMPORTANT: Print job status is NOT modified!
    return {
      success: false,
      delivery: failedRecord as TelegramDeliveryRecord,
      error: safeError,
    };
  }
}
