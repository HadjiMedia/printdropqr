import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { Readable } from "node:stream";

let cachedS3Client: S3Client | null = null;

function s3Config() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error("Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or use the runtime IAM role.");
  }
  return {
    bucket,
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  };
}

function getS3Client(config: NonNullable<ReturnType<typeof s3Config>>): S3Client {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: Boolean(config.endpoint),
      credentials: config.credentials,
    });
  }
  return cachedS3Client;
}

function safeKey(key: string): string {
  const normalized = key.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").some((segment) => !segment || segment === "." || segment === "..") ||
    normalized.includes("\0")
  ) {
    throw new Error("Invalid private storage key.");
  }
  return normalized;
}

function localPath(key: string): string {
  const root = resolve(process.env.PRINTDROP_STORAGE_DIR || resolve(tmpdir(), "printdrop-uploads"));
  const target = resolve(root, safeKey(key));
  if (!target.startsWith(`${root}${sep}`)) throw new Error("Storage path is outside the private upload directory.");
  return target;
}

export async function storePrintFile(
  key: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const objectKey = safeKey(key);
  const config = s3Config();
  if (config) {
    await getS3Client(config).send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        Body: bytes,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
      }),
    );
    return `s3:${objectKey}`;
  }

  const target = localPath(objectKey);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
  return `local:${objectKey}`;
}

export async function getPrintFile(reference: string): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType?: string;
}> {
  const separator = reference.indexOf(":");
  const driver = reference.slice(0, separator);
  const key = safeKey(reference.slice(separator + 1));
  if (separator < 1) throw new Error("Invalid storage reference.");

  if (driver === "s3") {
    const config = s3Config();
    if (!config) throw new Error("S3 storage is not configured.");
    const result = await getS3Client(config).send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    if (!result.Body) throw new Error("Stored file has no readable body.");
    return { body: result.Body.transformToWebStream() as ReadableStream<Uint8Array>, contentType: result.ContentType };
  }

  if (driver !== "local") throw new Error("Unknown storage driver.");
  const path = localPath(key);
  await stat(path);
  const stream = createReadStream(path);
  return { body: Readable.toWeb(stream) as ReadableStream<Uint8Array> };
}

export async function deletePrintFile(reference: string): Promise<void> {
  const separator = reference.indexOf(":");
  if (separator < 1) throw new Error("Invalid storage reference.");
  const driver = reference.slice(0, separator);
  const key = safeKey(reference.slice(separator + 1));

  if (driver === "s3") {
    const config = s3Config();
    if (!config) throw new Error("S3 storage is not configured.");
    await getS3Client(config).send(
      new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    return;
  }

  if (driver !== "local") throw new Error("Unknown storage driver.");
  const { unlink } = await import("node:fs/promises");
  try {
    await unlink(localPath(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
