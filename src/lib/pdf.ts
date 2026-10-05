/**
 * Fast client-side / server-side PDF page count extraction from binary ArrayBuffer or Uint8Array.
 * Analyzes the root `/Type /Pages` dictionary `/Count N` or counts `/Type /Page` tokens.
 */
export function extractPdfPageCount(buffer: ArrayBuffer | Uint8Array): number {
  try {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length < 10) return 1;

    // Look inside the file for PDF structure
    const sampleSize = Math.min(bytes.length, 3 * 1024 * 1024);
    let latin1 = "";
    // Build binary string
    for (let i = 0; i < sampleSize; i += 8192) {
      const chunk = bytes.subarray(i, Math.min(i + 8192, sampleSize));
      latin1 += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }

    // Pattern 1: /Type /Pages ... /Count N
    const pagesObjMatches = [...latin1.matchAll(/\/Type\s*\/Pages\b[\s\S]{1,250}\/Count\s+(\d+)/g)];
    if (pagesObjMatches.length > 0) {
      const counts = pagesObjMatches.map((m) => parseInt(m[1], 10)).filter((n) => !isNaN(n) && n > 0);
      if (counts.length > 0) {
        return Math.max(...counts);
      }
    }

    // Pattern 2: /Count N ... /Type /Pages
    const reverseMatches = [...latin1.matchAll(/\/Count\s+(\d+)[\s\S]{1,250}\/Type\s*\/Pages\b/g)];
    if (reverseMatches.length > 0) {
      const counts = reverseMatches.map((m) => parseInt(m[1], 10)).filter((n) => !isNaN(n) && n > 0);
      if (counts.length > 0) {
        return Math.max(...counts);
      }
    }

    // Fallback: Count /Type /Page (excluding /Type /Pages)
    const pageMatches = latin1.match(/\/Type\s*\/Page\b(?!\s*s)/g);
    if (pageMatches && pageMatches.length > 0) {
      return pageMatches.length;
    }
  } catch (error) {
    console.warn("Unable to extract PDF page count:", error);
  }
  return 1;
}
