import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

function createDatabase(connectionPool: Pool) {
  return drizzle(connectionPool);
}

type Database = ReturnType<typeof createDatabase>;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __printDropDatabase?: Database;
};

export class DatabaseConfigurationError extends Error {
  constructor() {
    super(
      "DATABASE_URL is not configured. Set it in the server environment before making database requests.",
    );
    this.name = "DatabaseConfigurationError";
  }
}

/**
 * Called on first use, never at module import time. Next.js imports route modules
 * while collecting build metadata, even for routes marked force-dynamic.
 */
export function getPool(): Pool {
  if (globalForDb.__arenaNextJsPostgresqlPool) {
    return globalForDb.__arenaNextJsPostgresqlPool;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new DatabaseConfigurationError();
  }

  const connectionPool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10_000,
  });

  // An idle connection failure must not become an unhandled EventEmitter error.
  connectionPool.on("error", (error) => {
    console.error("PrintDrop PostgreSQL idle connection error.", error);
  });

  // Reuse the pool during development reloads and warm serverless invocations.
  globalForDb.__arenaNextJsPostgresqlPool = connectionPool;
  return connectionPool;
}

export function getDb(): Database {
  if (!globalForDb.__printDropDatabase) {
    globalForDb.__printDropDatabase = createDatabase(getPool());
  }
  return globalForDb.__printDropDatabase;
}

/** Preserve the existing import API without initializing either client. */
function lazyClient<T extends object>(initialize: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const client = initialize();
      const value: unknown = Reflect.get(client, property, client);
      // Drizzle and pg methods rely on the real client as their `this` value.
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
}

export const pool = lazyClient(getPool);
export const db = lazyClient(getDb);
