import assert from "node:assert/strict";
import test from "node:test";
import {
  BLACK_AND_WHITE,
  COLOR,
  PAPER_PRICING,
  calculatePrintPrice,
  formatPeso,
  getPricePerPage,
  getPaperSizeLabel,
  extractPageCount,
  extractUserNotes,
  encodeNotesWithPages,
  encodeCancellationReason,
  extractCancellationReason,
  COMMON_CANCELLATION_REASONS,
  parseJobAttachments,
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
  assert.equal(BLACK_AND_WHITE, 5, "Default A4 Black & White rate must be 5 PHP per page");
  assert.equal(COLOR, 8, "Default A4 Color rate must be 8 PHP per page");
  assert.equal(PAPER_PRICING.LETTER.BW, 3);
  assert.equal(PAPER_PRICING.LETTER.COLOR, 6);
  assert.equal(PAPER_PRICING.A4.BW, 5);
  assert.equal(PAPER_PRICING.A4.COLOR, 8);
  assert.equal(PAPER_PRICING.LEGAL.BW, 7);
  assert.equal(PAPER_PRICING.LEGAL.COLOR, 10);

  assert.equal(getPricePerPage("BW", "LETTER"), 3);
  assert.equal(getPricePerPage("COLOR", "LETTER"), 6);
  assert.equal(getPricePerPage("BW", "A4"), 5);
  assert.equal(getPricePerPage("COLOR", "A4"), 8);
  assert.equal(getPricePerPage("BW", "LEGAL"), 7);
  assert.equal(getPricePerPage("COLOR", "LEGAL"), 10);
});

test("paper size labels match expected naming and dimensions", () => {
  assert.ok(getPaperSizeLabel("LETTER").includes("Letter"));
  assert.ok(getPaperSizeLabel("LETTER").includes("8.5 × 11"));
  assert.ok(getPaperSizeLabel("A4").includes("A4"));
  assert.ok(getPaperSizeLabel("A4").includes("8.27 × 11.69"));
  assert.ok(getPaperSizeLabel("LEGAL").includes("Legal"));
  assert.ok(getPaperSizeLabel("LEGAL").includes("8.5 × 13"));
});

test("pricing accuracy: Short / Letter (8.5 × 11 in)", () => {
  // B&W: ₱3/page
  assert.equal(calculatePrintPrice(1, 1, "BW", "LETTER"), 3);
  assert.equal(calculatePrintPrice(5, 1, "BW", "LETTER"), 15);
  assert.equal(calculatePrintPrice(10, 1, "BW", "LETTER"), 30);
  assert.equal(calculatePrintPrice(5, 2, "BW", "LETTER"), 30); // 5 × 2 × ₱3 = ₱30

  // Colored: ₱6/page
  assert.equal(calculatePrintPrice(1, 1, "COLOR", "LETTER"), 6);
  assert.equal(calculatePrintPrice(5, 1, "COLOR", "LETTER"), 30);
  assert.equal(calculatePrintPrice(10, 1, "COLOR", "LETTER"), 60);
  assert.equal(calculatePrintPrice(5, 2, "COLOR", "LETTER"), 60); // 5 × 2 × ₱6 = ₱60
});

test("pricing accuracy: A4 (8.27 × 11.69 in)", () => {
  // B&W: ₱5/page (default)
  assert.equal(calculatePrintPrice(1, 1, "BW", "A4"), 5);
  assert.equal(calculatePrintPrice(5, 1, "BW", "A4"), 25);
  assert.equal(calculatePrintPrice(10, 1, "BW", "A4"), 50);
  assert.equal(calculatePrintPrice(5, 2, "BW", "A4"), 50); // 5 × 2 × ₱5 = ₱50

  // Colored: ₱8/page (default)
  assert.equal(calculatePrintPrice(1, 1, "COLOR", "A4"), 8);
  assert.equal(calculatePrintPrice(5, 1, "COLOR", "A4"), 40);
  assert.equal(calculatePrintPrice(10, 1, "COLOR", "A4"), 80);
  assert.equal(calculatePrintPrice(5, 2, "COLOR", "A4"), 80); // 5 × 2 × ₱8 = ₱80
});

test("pricing accuracy: Long / Legal (8.5 × 13 in)", () => {
  // B&W: ₱7/page
  assert.equal(calculatePrintPrice(1, 1, "BW", "LEGAL"), 7);
  assert.equal(calculatePrintPrice(5, 1, "BW", "LEGAL"), 35);
  assert.equal(calculatePrintPrice(10, 1, "BW", "LEGAL"), 70);
  assert.equal(calculatePrintPrice(5, 2, "BW", "LEGAL"), 70); // 5 × 2 × ₱7 = ₱70

  // Colored: ₱10/page
  assert.equal(calculatePrintPrice(1, 1, "COLOR", "LEGAL"), 10);
  assert.equal(calculatePrintPrice(5, 1, "COLOR", "LEGAL"), 50);
  assert.equal(calculatePrintPrice(10, 1, "COLOR", "LEGAL"), 100);
  assert.equal(calculatePrintPrice(5, 2, "COLOR", "LEGAL"), 100); // 5 × 2 × ₱10 = ₱100
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

test("cancellation reason encoding, extraction, and note preservation", () => {
  assert.ok(COMMON_CANCELLATION_REASONS.length >= 4);

  // Initial job notes with page count
  const initial = encodeNotesWithPages("Customer wants it ring-bound", 5);
  assert.equal(initial, "[Pages: 5] Customer wants it ring-bound");
  assert.equal(extractCancellationReason(initial), null);
  assert.equal(extractUserNotes(initial), "Customer wants it ring-bound");

  // Admin cancels job with reason
  const cancelledNotes = encodeCancellationReason(initial, "Out of selected paper stock");
  assert.equal(extractCancellationReason(cancelledNotes), "Out of selected paper stock");
  assert.equal(extractPageCount(cancelledNotes), 5);
  assert.equal(extractUserNotes(cancelledNotes), "Customer wants it ring-bound");

  // Updating cancellation reason replaces prior reason cleanly
  const updatedReason = encodeCancellationReason(cancelledNotes, "File unreadable / corrupted format");
  assert.equal(extractCancellationReason(updatedReason), "File unreadable / corrupted format");
  assert.equal(extractPageCount(updatedReason), 5);
  assert.equal(extractUserNotes(updatedReason), "Customer wants it ring-bound");
});

test("parseJobAttachments parses single and multi-image JSON manifests", () => {
  // Single document
  const single = parseJobAttachments("local:uploads/shop/123.pdf", "invoice.pdf", 20480);
  assert.equal(single.length, 1);
  assert.equal(single[0].name, "invoice.pdf");
  assert.equal(single[0].ext, "pdf");
  assert.equal(single[0].size, 20480);

  // Multi-image JSON manifest
  const manifest = JSON.stringify([
    { name: "photo1.png", size: 12000, ext: "png", mime: "image/png", url: "local:uploads/shop/img_0.png" },
    { name: "photo2.jpg", size: 24000, ext: "jpg", mime: "image/jpeg", url: "local:uploads/shop/img_1.jpg" },
  ]);
  const parsed = parseJobAttachments(manifest, "2 Images: photo1.png, photo2.jpg", 36000);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, "photo1.png");
  assert.equal(parsed[0].ext, "png");
  assert.equal(parsed[1].name, "photo2.jpg");
  assert.equal(parsed[1].size, 24000);
});

