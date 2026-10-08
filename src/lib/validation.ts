import { z } from "zod";

export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_COPIES = 100;
export const MAX_PAGES = 1000;

export const createPrintJobSchema = z.object({
  shopSlug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  customerName: z.string().trim().min(1, "Add a name or queue identifier.").max(80),
  pageCount: z.coerce.number().int().min(1).max(MAX_PAGES).default(1),
  copies: z.coerce.number().int().min(1).max(MAX_COPIES),
  paperSize: z.enum(["A4", "LETTER", "LEGAL"]),
  colorType: z.enum(["BW", "COLOR"]),
  notes: z.string().trim().max(500).default(""),
});

export const createShopSchema = z.object({
  name: z.string().trim().min(2).max(140),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
});

const allowedExtensions = new Set(["pdf", "docx", "png", "jpg", "jpeg"]);
const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
]);

export function fileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function validateUploadMetadata(file: File): string | null {
  if (file.size <= 0) return "That file is empty. Choose a file with content.";
  if (file.size > MAX_FILE_SIZE) return "Files must be 50 MB or smaller.";
  const extension = fileExtension(file.name);
  if (!allowedExtensions.has(extension)) {
    return "Choose a PDF, DOCX, PNG, or JPG file.";
  }
  if (file.type && !allowedMimeTypes.has(file.type)) {
    return "The file content type does not match a supported print file.";
  }
  return null;
}

export function hasValidFileSignature(extension: string, bytes: Uint8Array): boolean {
  switch (extension.toLowerCase()) {
    case "pdf":
      return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
    case "png":
      return (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case "jpg":
    case "jpeg":
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "docx":
      return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    default:
      return false;
  }
}

export function safeFileName(input: string): string {
  const leaf = input.split(/[\\/]/).pop() ?? "print-file";
  const cleaned = leaf
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}._ ()-]/gu, "-")
    .trim()
    .slice(0, 180);
  return cleaned || "print-file";
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
