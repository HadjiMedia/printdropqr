export type PaperSize = "LETTER" | "A4" | "LEGAL";
export type ColorType = "BW" | "COLOR";

export const PAPER_PRICING: Record<PaperSize, Record<ColorType, number>> = {
  LETTER: {
    BW: 3,
    COLOR: 6,
  },
  A4: {
    BW: 5,
    COLOR: 8,
  },
  LEGAL: {
    BW: 7,
    COLOR: 10,
  },
} as const;

export const BLACK_AND_WHITE = PAPER_PRICING.A4.BW;
export const COLOR = PAPER_PRICING.A4.COLOR;

export const PRINT_PRICING = PAPER_PRICING.A4;

export function getPricePerPage(colorType: ColorType, paperSize: PaperSize = "A4"): number {
  const sizeRates = PAPER_PRICING[paperSize] ?? PAPER_PRICING.A4;
  return sizeRates[colorType] ?? (colorType === "COLOR" ? 8 : 5);
}

export function calculatePrintPrice(
  pages: number | string | undefined | null,
  copies: number | string | undefined | null,
  colorType: ColorType,
  paperSize: PaperSize = "A4",
): number {
  const safePages = Math.max(1, Math.floor(Number(pages) || 1));
  const safeCopies = Math.max(1, Math.floor(Number(copies) || 1));
  const rate = getPricePerPage(colorType, paperSize);
  return safePages * safeCopies * rate;
}

export function getPaperSizeLabel(paperSize: PaperSize): string {
  switch (paperSize) {
    case "LETTER":
      return "Short / Letter (8.5 × 11 in)";
    case "A4":
      return "A4 (8.27 × 11.69 in)";
    case "LEGAL":
      return "Long / Legal (8.5 × 13 in)";
    default:
      return "A4 (8.27 × 11.69 in)";
  }
}

export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString("en-PH")}`;
}

export function extractPageCount(notes: string | undefined | null): number {
  if (!notes) return 1;
  const match = notes.match(/\[(?:Pages|Page):\s*(\d+)\]/i);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 1;
}

export function extractUserNotes(notes: string | undefined | null): string {
  if (!notes) return "";
  return notes
    .replace(/\[(?:Pages|Page):\s*\d+\]\s*/gi, "")
    .replace(/\[(?:Cancel|Cancelled|Reason):\s*[^\]]+\]\s*/gi, "")
    .trim();
}

export function encodeNotesWithPages(userNotes: string | undefined | null, pageCount: number): string {
  const clean = (userNotes ?? "").trim();
  const count = Math.max(1, Math.floor(Number(pageCount) || 1));
  const prefix = `[Pages: ${count}]`;
  if (!clean) return prefix;
  return `${prefix} ${clean}`.slice(0, 500);
}

export const COMMON_CANCELLATION_REASONS = [
  "File unreadable / corrupted format",
  "Out of selected paper stock",
  "Customer requested cancellation",
  "Page count / file content mismatch",
  "Unclear printing instructions",
  "Payment or verification required at counter",
] as const;

export function extractCancellationReason(notes: string | undefined | null): string | null {
  if (!notes) return null;
  const match = notes.match(/\[(?:Cancel|Cancelled|Reason):\s*([^\]]+)\]/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

export function encodeCancellationReason(
  existingNotes: string | undefined | null,
  reason: string,
): string {
  const cleanReason = reason.trim().replace(/[\[\]]/g, "").slice(0, 140);
  const tag = `[Cancel: ${cleanReason}]`;
  const current = existingNotes ?? "";
  if (/\[(?:Cancel|Cancelled|Reason):[^\]]+\]/i.test(current)) {
    return current.replace(/\[(?:Cancel|Cancelled|Reason):[^\]]+\]/i, tag).slice(0, 500);
  }
  return `${current} ${tag}`.trim().slice(0, 500);
}

export type JobAttachment = {
  index: number;
  name: string;
  size: number;
  ext: string;
  mime: string;
  url?: string;
};

export function parseJobAttachments(
  fileUrl: string | undefined | null,
  defaultFileName: string,
  defaultFileSize: number,
): JobAttachment[] {
  if (fileUrl && (fileUrl.startsWith("[") || fileUrl.startsWith("attachments:"))) {
    try {
      const jsonStr = fileUrl.startsWith("attachments:") ? fileUrl.slice(12) : fileUrl;
      const parsed = JSON.parse(jsonStr) as Array<{
        name?: string;
        size?: number;
        mime?: string;
        ext?: string;
        url?: string;
        storageKey?: string;
      }>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item, idx) => {
          const name = item.name || `image_${idx + 1}.jpg`;
          const ext = item.ext || name.split(".").pop()?.toLowerCase() || "jpg";
          const mime =
            item.mime || (ext === "png" ? "image/png" : "image/jpeg");
          return {
            index: idx,
            name,
            size: item.size || 0,
            ext,
            mime,
            url: item.url,
          };
        });
      }
    } catch {
      // Fall through to single attachment
    }
  }

  const cleanName = defaultFileName || "print-file";
  const ext = cleanName.split(".").pop()?.toLowerCase() || "pdf";
  const mime =
    ext === "pdf"
      ? "application/pdf"
      : ext === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : ext === "png"
          ? "image/png"
          : "image/jpeg";

  return [
    {
      index: 0,
      name: cleanName,
      size: defaultFileSize || 0,
      ext,
      mime,
      url: fileUrl ?? undefined,
    },
  ];
}

