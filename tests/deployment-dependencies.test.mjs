import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import QRCode from "qrcode";
import { Pool } from "pg";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../package.json", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));

// These smoke tests use the actual installed packages. None connects to a live
// database, S3 bucket, or external service, and no credentials are required.
test("the npm manifest and committed lockfile describe the same direct dependencies", () => {
  assert.equal(lock.lockfileVersion, 3);
  for (const section of ["dependencies", "devDependencies"]) {
    assert.deepEqual(lock.packages[""][section], manifest[section], `${section} differ`);
  }
  for (const alternate of ["npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"]) {
    assert.equal(existsSync(join(root, alternate)), false, `Conflicting lockfile: ${alternate}`);
  }
});

test("required runtime packages are direct production dependencies and resolve", () => {
  for (const name of ["qrcode", "pg", "@aws-sdk/client-s3", "server-only"]) {
    const version = manifest.dependencies?.[name];
    assert.ok(version, `${name} must be a direct production dependency`);
    assert.equal(manifest.devDependencies?.[name], undefined, `${name} must not be dev-only`);
    const locked = lock.packages[`node_modules/${name}`];
    assert.ok(locked, `${name} is absent from the lockfile`);
    assert.notEqual(locked.dev, true, `${name} is locked as dev-only`);
    assert.equal(locked.version, version, `${name} should use the exact reviewed version`);
    assert.ok(require.resolve(name));
  }
});

test("the installed framework matches the requested Next.js 15.5.27 deployment", () => {
  assert.equal(manifest.dependencies.next, "15.5.27");
  assert.equal(require("next/package.json").version, "15.5.27");
  assert.equal(require("eslint-config-next/package.json").version, "15.5.27");
  assert.ok(Number(process.versions.node.split(".")[0]) >= 22, "Use the documented Node.js 22 runtime or newer");
});

test("the QR route's default import generates an SVG on Node.js", async () => {
  const svg = await QRCode.toString("https://printdrop.example/sunbeam-print", {
    type: "svg",
    errorCorrectionLevel: "M",
    width: 320,
  });
  assert.match(svg, /^<svg\b/);
  assert.match(svg, /<path\b/);
});

test("pg can construct an empty pool without connecting at import time", async () => {
  const connectionPool = new Pool({
    connectionString: "postgresql://unused.example/printdrop",
    connectionTimeoutMillis: 100,
  });
  assert.equal(connectionPool.totalCount, 0);
  await connectionPool.end();
});

test("S3 imports support the application's upload, download, and purge commands", () => {
  const client = new S3Client({ region: "us-east-1" });
  try {
    const location = { Bucket: "printdrop-test", Key: "uploads/test.pdf" };
    assert.equal(new PutObjectCommand({ ...location, Body: "test" }).input.Key, location.Key);
    assert.equal(new GetObjectCommand(location).input.Key, location.Key);
    assert.equal(new DeleteObjectCommand(location).input.Key, location.Key);
    assert.equal(typeof client.send, "function");
  } finally {
    client.destroy();
  }
});

test("database and storage helpers cannot be pulled into a client component", () => {
  for (const path of ["src/db/index.ts", "src/lib/storage.ts"]) {
    const source = readFileSync(join(root, path), "utf8");
    assert.match(source, /^import ["']server-only["'];/);
    assert.doesNotMatch(source, /^["']use client["'];/);
  }
  const qrRoute = readFileSync(join(root, "src/app/api/qr-code/route.ts"), "utf8");
  assert.match(qrRoute, /export const runtime = ["']nodejs["']/);
});

test("sharp's native image pipeline is usable after a clean npm install", async () => {
  const sharp = require("sharp");
  const output = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "#ffffff" },
  }).png().toBuffer();
  assert.equal(output.subarray(1, 4).toString("ascii"), "PNG");
});

for (const [packagePath, entry] of Object.entries(lock.packages)) {
  if (/(^|\/)node_modules\/esbuild$/.test(packagePath)) {
    test(`esbuild ${entry.version} at ${packagePath} has a usable platform binary`, () => {
      const esbuild = require(join(root, packagePath));
      const result = esbuild.transformSync("const answer: number = 42", { loader: "ts" });
      assert.match(result.code, /answer = 42/);
    });
  }
}
