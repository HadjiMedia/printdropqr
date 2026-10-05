import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const jobStatusEnum = pgEnum("job_status", [
  "WAITING",
  "PRINTING",
  "DONE",
  "CANCELLED",
]);

export const paperSizeEnum = pgEnum("paper_size", ["A4", "LETTER", "LEGAL"]);
export const colorTypeEnum = pgEnum("color_type", ["BW", "COLOR"]);

export const shops = pgTable(
  "shops",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 140 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    nextQueueNumber: integer("next_queue_number").notNull().default(1042),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex("shops_slug_unique").on(table.slug),
  }),
);

export const printJobs = pgTable(
  "print_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    queueNumber: integer("queue_number").notNull(),
    customerName: varchar("customer_name", { length: 80 }).notNull(),
    // Private storage reference (local:... or s3:...), never a public URL.
    fileUrl: text("file_url").notNull(),
    fileName: varchar("file_name", { length: 180 }).notNull(),
    fileSize: integer("file_size").notNull(),
    paperSize: paperSizeEnum("paper_size").notNull(),
    colorType: colorTypeEnum("color_type").notNull(),
    copies: integer("copies").notNull(),
    notes: varchar("notes", { length: 500 }).notNull().default(""),
    status: jobStatusEnum("status").notNull().default("WAITING"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => ({
    shopQueueUnique: uniqueIndex("print_jobs_shop_queue_unique").on(
      table.shopId,
      table.queueNumber,
    ),
    shopCreatedIdx: index("print_jobs_shop_created_idx").on(table.shopId, table.createdAt),
    expiresIdx: index("print_jobs_expires_idx").on(table.expiresAt),
    shopStatusIdx: index("print_jobs_shop_status_idx").on(table.shopId, table.status),
  }),
);
