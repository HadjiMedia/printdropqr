export const BLACK_AND_WHITE = 5;
export const COLOR = 8;

export const PRINT_PRICING = {
  BW: BLACK_AND_WHITE,
  COLOR: COLOR,
} as const;

export type ColorType = "BW" | "COLOR";

export function getPricePerPage(colorType: ColorType): number {
  return colorType === "COLOR" ? PRINT_PRICING.COLOR : PRINT_PRICING.BW;
}

export function calculatePrintPrice(
  pages: number | string | undefined | null,
  copies: number | string | undefined | null,
  colorType: ColorType,
): number {
  const safePages = Math.max(1, Math.floor(Number(pages) || 1));
  const safeCopies = Math.max(1, Math.floor(Number(copies) || 1));
  const rate = getPricePerPage(colorType);
  return safePages * safeCopies * rate;
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
