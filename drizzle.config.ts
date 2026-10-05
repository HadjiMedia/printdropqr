import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Loading configuration (or generating schema files) must not require a live DB.
// Drizzle Kit validates credentials when a connecting command such as push runs.
const databaseUrl = process.env.DATABASE_URL?.trim();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
  strict: true,
  verbose: true,
});
