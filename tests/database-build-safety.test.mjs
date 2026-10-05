import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

function compile(relativePath) {
  return ts.transpileModule(
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
}

const databaseSource = compile("../src/db/index.ts");

// Evaluate the real client module with instrumented drivers, without opening
// sockets or changing the environment used by Next.js or the live application.
function loadDatabase(env = {}, sharedGlobal = {}) {
  const instances = { pools: [], databases: [] };
  class InstrumentedPool {
    constructor(options) {
      this.options = options;
      instances.pools.push(this);
    }
    on() {
      return this;
    }
  }

  const drivers = {
    // Next.js resolves this marker in the server graph; the isolated VM only
    // exercises lazy client creation, not Next's bundler boundary enforcement.
    "server-only": {},
    pg: { Pool: InstrumentedPool },
    "drizzle-orm/node-postgres": {
      drizzle(connectionPool) {
        const client = {
          $client: connectionPool,
          select() {
            return this;
          },
          transaction(callback) {
            return callback(this);
          },
        };
        instances.databases.push(client);
        return client;
      },
    },
  };

  const isolatedModule = { exports: {} };
  runInNewContext(databaseSource, {
    exports: isolatedModule.exports,
    module: isolatedModule,
    process: { env },
    globalThis: sharedGlobal,
    console,
    require(name) {
      if (!(name in drivers)) throw new Error(`Unexpected database import: ${name}`);
      return drivers[name];
    },
  });

  return { client: isolatedModule.exports, instances, env, sharedGlobal };
}

test("the database module can be imported without DATABASE_URL", () => {
  const { client, instances } = loadDatabase();
  assert.equal(typeof client.getDb, "function");
  assert.equal(typeof client.getPool, "function");
  assert.equal(typeof client.db, "object");
  assert.equal(typeof client.pool, "object");
  assert.equal(instances.pools.length, 0);
  assert.equal(instances.databases.length, 0);
});

test("even a configured build does not eagerly initialize database clients", () => {
  const { instances } = loadDatabase({ DATABASE_URL: "postgresql://unused.example/test" });
  assert.equal(instances.pools.length, 0);
  assert.equal(instances.databases.length, 0);
});

test("missing, empty, and whitespace credentials fail only when the database is used", () => {
  for (const value of [undefined, "", "   "]) {
    const { client, instances } = loadDatabase({ DATABASE_URL: value });
    assert.throws(() => client.getPool(), client.DatabaseConfigurationError);
    assert.throws(() => client.getDb(), client.DatabaseConfigurationError);
    assert.throws(() => client.db.select(), client.DatabaseConfigurationError);
    assert.equal(instances.pools.length, 0);
    assert.equal(instances.databases.length, 0);
  }
});

test("credentials are read at first use rather than captured at import", () => {
  const { client, instances, env } = loadDatabase();
  env.DATABASE_URL = "postgresql://runtime.example/test";
  client.db.select();
  assert.equal(instances.pools[0].options.connectionString, env.DATABASE_URL);
  assert.equal(instances.databases.length, 1);
});

test("the compatibility proxies bind methods to real singleton clients", () => {
  const { client, instances } = loadDatabase({ DATABASE_URL: "postgresql://unused.example/test" });
  assert.equal(client.db.select(), client.getDb());
  assert.equal(client.db.transaction((transaction) => transaction), client.getDb());
  assert.equal(client.db.$client, client.getPool());
  assert.equal(client.pool.on("error", () => {}), client.getPool());
  assert.equal(client.getDb(), client.getDb());
  assert.equal(client.getPool(), client.getPool());
  assert.equal(instances.pools.length, 1);
  assert.equal(instances.databases.length, 1);
});

test("module reloads and warm invocations reuse the cached pool and database", () => {
  const first = loadDatabase({ DATABASE_URL: "postgresql://unused.example/test" });
  const database = first.client.getDb();
  const reloaded = loadDatabase({}, first.sharedGlobal);
  assert.equal(reloaded.client.getDb(), database);
  assert.equal(reloaded.client.getPool(), first.client.getPool());
  assert.equal(reloaded.instances.pools.length, 0);
  assert.equal(reloaded.instances.databases.length, 0);
});

test("Drizzle Kit configuration imports safely without connecting credentials", () => {
  const isolatedModule = { exports: {} };
  runInNewContext(compile("../drizzle.config.ts"), {
    exports: isolatedModule.exports,
    module: isolatedModule,
    process: { env: {} },
    require(name) {
      if (name === "dotenv/config") return {};
      if (name === "drizzle-kit") return { defineConfig: (config) => config };
      throw new Error(`Unexpected config import: ${name}`);
    },
  });
  assert.equal(isolatedModule.exports.default.dialect, "postgresql");
  assert.equal(isolatedModule.exports.default.dbCredentials, undefined);
});

test("all pages and API routes importing the database explicitly opt out of prerendering", () => {
  function checkDirectory(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        checkDirectory(path);
      } else if (/^(page|route)\.tsx?$/.test(entry.name)) {
        const content = readFileSync(path, "utf8");
        if (/from\s+["']@\/db["']/.test(content)) {
          assert.match(content, /export const dynamic = ["']force-dynamic["']/, path);
        }
      }
    }
  }
  checkDirectory(fileURLToPath(new URL("../src/app", import.meta.url)));
});
