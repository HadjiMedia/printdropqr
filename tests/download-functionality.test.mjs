import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createZipArchive } from "../src/lib/zip.ts";
import { parseJobAttachments } from "../src/lib/pricing.ts";

test("ZIP archive generator creates standard readable zip with real images", () => {
  // Test PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const mockPngData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);
  // Test JPEG signature: FF D8 FF E0
  const mockJpgData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

  const files = [
    { name: "flyer_front.png", data: mockPngData },
    { name: "flyer_back.jpg", data: mockJpgData },
  ];

  const zipBuffer = createZipArchive(files);

  // Check valid ZIP header signature (PK\x03\x04)
  assert.ok(zipBuffer.length > 50);
  assert.equal(zipBuffer.readUInt32LE(0), 0x04034b50, "Valid ZIP local header signature");

  // Verify extraction with system unzip tool
  const tempZipPath = join(tmpdir(), `test_download_${Date.now()}.zip`);
  writeFileSync(tempZipPath, zipBuffer);

  try {
    const listOutput = execSync(`unzip -l "${tempZipPath}"`, { encoding: "utf8" });
    assert.match(listOutput, /flyer_front\.png/);
    assert.match(listOutput, /flyer_back\.jpg/);
    assert.match(listOutput, /2 files/);
  } finally {
    if (existsSync(tempZipPath)) unlinkSync(tempZipPath);
  }
});

test("Single image job download headers and format preservation", () => {
  // PNG file
  const pngAttachments = parseJobAttachments(
    "local:uploads/shop1/job123.png",
    "poster_design.png",
    1048576,
  );
  assert.equal(pngAttachments.length, 1);
  assert.equal(pngAttachments[0].name, "poster_design.png");
  assert.equal(pngAttachments[0].ext, "png");
  assert.equal(pngAttachments[0].mime, "image/png");

  // JPG/JPEG file
  const jpgAttachments = parseJobAttachments(
    "local:uploads/shop1/job124.jpg",
    "photo_id.jpg",
    524288,
  );
  assert.equal(jpgAttachments.length, 1);
  assert.equal(jpgAttachments[0].name, "photo_id.jpg");
  assert.equal(jpgAttachments[0].ext, "jpg");
  assert.equal(jpgAttachments[0].mime, "image/jpeg");
});

test("Multiple images job attachment parsing preserves individual image files", () => {
  const manifest = JSON.stringify([
    { index: 0, name: "page1.png", size: 1000, ext: "png", mime: "image/png", url: "local:uploads/shop1/job1_0.png" },
    { index: 1, name: "page2.jpg", size: 2000, ext: "jpg", mime: "image/jpeg", url: "local:uploads/shop1/job1_1.jpg" },
    { index: 2, name: "page3.jpeg", size: 3000, ext: "jpeg", mime: "image/jpeg", url: "local:uploads/shop1/job1_2.jpeg" },
  ]);

  const attachments = parseJobAttachments(manifest, "3 Images", 6000);
  assert.equal(attachments.length, 3);

  // Each image has individual details
  assert.equal(attachments[0].name, "page1.png");
  assert.equal(attachments[0].mime, "image/png");
  assert.equal(attachments[1].name, "page2.jpg");
  assert.equal(attachments[1].mime, "image/jpeg");
  assert.equal(attachments[2].name, "page3.jpeg");
  assert.equal(attachments[2].mime, "image/jpeg");
});

test("Zip archive generator sanitizes filenames to prevent directory traversal", () => {
  const files = [
    { name: "../../malicious.png", data: Buffer.from([1, 2, 3]) },
    { name: "C:\\Windows\\system32\\calc.jpg", data: Buffer.from([4, 5, 6]) },
  ];

  const zipBuffer = createZipArchive(files);
  const tempZipPath = join(tmpdir(), `test_sanitize_${Date.now()}.zip`);
  writeFileSync(tempZipPath, zipBuffer);

  try {
    const listOutput = execSync(`unzip -l "${tempZipPath}"`, { encoding: "utf8" });
    assert.doesNotMatch(listOutput, /\.\.\//);
    assert.doesNotMatch(listOutput, /C:\\/);
  } finally {
    if (existsSync(tempZipPath)) unlinkSync(tempZipPath);
  }
});
