import { eq } from "drizzle-orm";
import { DatabaseConfigurationError, db } from "@/db";
import { shops } from "@/db/schema";
import { slugify } from "@/lib/validation";

export async function ensureStarterShop() {
  const requestedSlug = process.env.DEFAULT_SHOP_SLUG || "sunbeam-print";
  const slug = slugify(requestedSlug) || "sunbeam-print";
  const fallback = {
    id: "00000000-0000-0000-0000-000000000000",
    name: process.env.DEFAULT_SHOP_NAME?.trim() || "Sunbeam Print Co.",
    slug,
    nextQueueNumber: 1042,
    createdAt: new Date(),
  };

  try {
    const [existing] = await db.select().from(shops).where(eq(shops.slug, slug)).limit(1);
    if (existing) return existing;

    await db
      .insert(shops)
      .values({
        name: process.env.DEFAULT_SHOP_NAME?.trim() || "Sunbeam Print Co.",
        slug,
      })
      .onConflictDoNothing({ target: shops.slug });

    const [shop] = await db.select().from(shops).where(eq(shops.slug, slug)).limit(1);
    return shop ?? fallback;
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return fallback;
    }
    console.error("PrintDrop starter shop initialization deferred.", error);
    return fallback;
  }
}
