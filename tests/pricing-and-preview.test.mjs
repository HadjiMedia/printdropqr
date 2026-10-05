import assert from "node:assert/strict";
import test from "node:test";
import {
  BLACK_AND_WHITE,
  COLOR,
  calculatePrintPrice,
  formatPeso,
  getPricePerPage,
  extractPageCount,
  extractUserNotes,
  encodeNotesWithPages,
} from "../src/lib/pricing.ts";
import {
  fileExtension,
  hasValidFileSignature,
  safeFileName,
  MAX_FILE_SIZE,
  MAX_COPIES,
  MAX_PAGES,
} from "../src/lib/validation.ts";
import { extractPdfPageCount } from "../src/lib/pdf.ts";

test("centralized pricing configuration values match specification", () => {
  assert.equal(BLACK_AND_WHITE, 5, "Black & White rate must be 5 PHP per page");
  assert.equal(COLOR, 8, "Color rate must be 8 PHP per page");
  assert.equal(getPricePerPage("BW"), 5);
  assert.equal(getPricePerPage("COLOR"), 8);
});

test("pricing accuracy: Black & White single and multiple pages", () => {
  // 1 B&W page = ₱5
  assert.equal(calculatePrintPrice(1, 1, "BW"), 5);
  // 5 B&W pages = ₱25
  assert.equal(calculatePrintPrice(5, 1, "BW"), 25);
  // 10 B&W pages = ₱50
  assert.equal(calculatePrintPrice(10, 1, "BW"), 50);
});

test("pricing accuracy: Colored single and multiple pages", () => {
  // 1 color page = ₱8
  assert.equal(calculatePrintPrice(1, 1, "COLOR"), 8);
  // 5 color pages = ₱40
  assert.equal(calculatePrintPrice(5, 1, "COLOR"), 40);
  // 10 color pages = ₱80
  assert.equal(calculatePrintPrice(10, 1, "COLOR"), 80);
});

test("pricing accuracy: multiple copies", () => {
  // 5-page document, 2 copies, B&W: 5 × 2 × ₱5 = ₱50
  assert.equal(calculatePrintPrice(5, 2, "BW"), 50);
  // 5-page document, 2 copies, Color: 5 × 2 × ₱8 = ₱80
  assert.equal(calculatePrintPrice(5, 2, "COLOR"), 80);
  // 3-page document, 4 copies, B&W: 3 × 4 × ₱5 = ₱60
  assert.equal(calculatePrintPrice(3, 4, "BW"), 60);
  // 10-page document, 3 copies, Color: 10 × 3 × ₱8 = ₱240
  assert.equal(calculatePrintPrice(10, 3, "COLOR"), 240);
});

test("pricing handles invalid or missing inputs gracefully", () => {
  assert.equal(calculatePrintPrice(0, 1, "BW"), 5, "0 pages clamped to minimum 1");
  assert.equal(calculatePrintPrice(-5, 1, "BW"), 5, "negative pages clamped to minimum 1");
  assert.equal(calculatePrintPrice(null, null, "BW"), 5, "null pages/copies default to 1");
  assert.equal(calculatePrintPrice("5", "2", "BW"), 50, "string inputs parsed properly");
});

test("formatPeso displays Philippine Peso symbol correctly", () => {
  assert.equal(formatPeso(5), "₱5");
  assert.equal(formatPeso(25), "₱25");
  assert.equal(formatPeso(50), "₱50");
  assert.equal(formatPeso(1000), "₱1,000");
});

test("notes metadata encoding and decoding", () => {
  const encoded = encodeNotesWithPages("Please staple top-left", 7);
  assert.equal(encoded, "[Pages: 7] Please staple top-left");
  assert.equal(extractPageCount(encoded), 7);
  assert.equal(extractUserNotes(encoded), "Please staple top-left");

  // Fallback when no page metadata is present
  assert.equal(extractPageCount("Old job without prefix"), 1);
  assert.equal(extractUserNotes("Old job without prefix"), "Old job without prefix");
  assert.equal(extractPageCount(""), 1);
  assert.equal(extractUserNotes(""), "");
});

test("file validation: extensions and signatures", () => {
  assert.equal(fileExtension("document.pdf"), "pdf");
  assert.equal(fileExtension("report.final.docx"), "docx");
  assert.equal(fileExtension("photo.PNG"), "png");
  assert.equal(fileExtension("noextension"), "noextension");

  // Valid PDF signature %PDF-
  const validPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  assert.ok(hasValidFileSignature("pdf", validPdfBytes));

  // Invalid PDF signature
  const fakePdfBytes = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
  assert.equal(hasValidFileSignature("pdf", fakePdfBytes), false);

  // Valid PNG signature
  const validPngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(hasValidFileSignature("png", validPngBytes));

  // Valid JPEG signature
  const validJpgBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  assert.ok(hasValidFileSignature("jpg", validJpgBytes));
  assert.ok(hasValidFileSignature("jpeg", validJpgBytes));

  // Valid DOCX signature (PK..)
  const validDocxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  assert.ok(hasValidFileSignature("docx", validDocxBytes));
});

test("safeFileName cleans path traversals and illegal characters", () => {
  assert.equal(safeFileName("../../secret.pdf"), "secret.pdf");
  assert.equal(safeFileName("C:\\Documents\\invoice.pdf"), "invoice.pdf");
  assert.equal(safeFileName("clean-name.pdf"), "clean-name.pdf");
});

test("extractPdfPageCount returns expected page count or fallback", () => {
  // Minimal synthetic PDF structure with /Count 4
  const pdfString = "%PDF-1.4\n1 0 obj\n<< /Type /Pages /Count 4 /Kids [] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
  const encoder = new TextEncoder();
  const pdfBuffer = encoder.encode(pdfString);
  const detected = extractPdfPageCount(pdfBuffer);
  assert.equal(detected, 4);

  // Fallback for empty or corrupt buffer
  assert.equal(extractPdfPageCount(new Uint8Array([])), 1);
});
