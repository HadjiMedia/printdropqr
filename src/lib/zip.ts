import { crc32 } from "node:zlib";

export interface ZipFileInput {
  name: string;
  data: Buffer;
}

/**
 * Creates a valid, standard ZIP archive from a list of files without external dependencies.
 * Files are stored (method 0) which is optimal and fast for already-compressed formats (PNG, JPG, etc.).
 */
export function createZipArchive(files: ZipFileInput[]): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((now.getFullYear() - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const file of files) {
    // Sanitize filename inside ZIP (extract filename without path traversal or directory components)
    const rawName = file.name.replace(/\\/g, "/");
    const sanitizedName = rawName.split("/").filter((part) => part && part !== "..").pop() || "file";
    const nameBuffer = Buffer.from(sanitizedName, "utf8");
    const dataBuffer = file.data;
    const fileCrc = crc32(dataBuffer);

    // Local file header (30 bytes + name length)
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4);         // version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6);     // general purpose bit flag: bit 11 = UTF-8 filename
    localHeader.writeUInt16LE(0, 8);          // compression method: 0 = stored
    localHeader.writeUInt16LE(dosTime, 10);   // file time
    localHeader.writeUInt16LE(dosDate, 12);   // file date
    localHeader.writeUInt32LE(fileCrc, 14);   // crc-32
    localHeader.writeUInt32LE(dataBuffer.length, 18); // compressed size
    localHeader.writeUInt32LE(dataBuffer.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26); // file name length
    localHeader.writeUInt16LE(0, 28);         // extra field length
    nameBuffer.copy(localHeader, 30);

    // Central directory header (46 bytes + name length)
    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4);          // version made by
    centralHeader.writeUInt16LE(20, 6);          // version needed
    centralHeader.writeUInt16LE(0x0800, 8);      // UTF-8 flag
    centralHeader.writeUInt16LE(0, 10);          // compression method
    centralHeader.writeUInt16LE(dosTime, 12);    // file time
    centralHeader.writeUInt16LE(dosDate, 14);    // file date
    centralHeader.writeUInt32LE(fileCrc, 16);    // crc-32
    centralHeader.writeUInt32LE(dataBuffer.length, 20); // compressed size
    centralHeader.writeUInt32LE(dataBuffer.length, 24); // uncompressed size
    centralHeader.writeUInt16LE(nameBuffer.length, 28); // file name length
    centralHeader.writeUInt16LE(0, 30);          // extra field length
    centralHeader.writeUInt16LE(0, 32);          // file comment length
    centralHeader.writeUInt16LE(0, 34);          // disk number start
    centralHeader.writeUInt16LE(0, 36);          // internal file attributes
    centralHeader.writeUInt32LE(0, 38);          // external file attributes
    centralHeader.writeUInt32LE(offset, 42);     // relative offset of local header
    nameBuffer.copy(centralHeader, 46);

    localChunks.push(localHeader, dataBuffer);
    centralChunks.push(centralHeader);
    offset += localHeader.length + dataBuffer.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralChunks) centralDirSize += ch.length;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);        // signature
  eocd.writeUInt16LE(0, 4);                 // disk number
  eocd.writeUInt16LE(0, 6);                 // disk with central dir
  eocd.writeUInt16LE(files.length, 8);      // total entries on this disk
  eocd.writeUInt16LE(files.length, 10);     // total entries in central dir
  eocd.writeUInt32LE(centralDirSize, 12);   // size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16); // offset of central directory
  eocd.writeUInt16LE(0, 20);                // comment length

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}
