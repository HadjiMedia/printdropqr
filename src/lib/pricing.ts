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
  return notes.replace(/\[(?:Pages|Page):\s*\d+\]\s*/gi, "").trim();
}

export function encodeNotesWithPages(userNotes: string | undefined | null, pageCount: number): string {
  const clean = (userNotes ?? "").trim();
  const count = Math.max(1, Math.floor(Number(pageCount) || 1));
  const prefix = `[Pages: ${count}]`;
  if (!clean) return prefix;
  return `${prefix} ${clean}`.slice(0, 500);
}
