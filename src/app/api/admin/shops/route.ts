import { asc, eq } from "drizzle-orm";
import { isAdminAuthenticated } from "@/lib/auth";
import { DatabaseConfigurationError, db } from "@/db";
import { shops } from "@/db/schema";
import { createShopSchema, slugify } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Staff sign-in is required." }, { status: 401 });
  }

  try {
    const allShops = await db
      .select({ id: shops.id, name: shops.name, slug: shops.slug, createdAt: shops.createdAt })
      .from(shops)
      .orderBy(asc(shops.name));
    return Response.json({ shops: allShops }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("PrintDrop shop list failed.", error);
    if (error instanceof DatabaseConfigurationError) {
      return Response.json(
        {
          shops: [
            {
              id: "00000000-0000-0000-0000-000000000000",
              name: process.env.DEFAULT_SHOP_NAME?.trim() || "Sunbeam Print Co.",
              slug: process.env.DEFAULT_SHOP_SLUG || "sunbeam-print",
              createdAt: new Date().toISOString(),
            },
          ],
        },
        { headers: { "Cache-Control": "no-store, private" } },
      );
    }
    return Response.json({ error: "Unable to load shops." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Staff sign-in is required." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { name?: unknown; slug?: unknown };
    const parsed = createShopSchema.safeParse({
      name: body.name,
      slug: typeof body.slug === "string" && body.slug.trim() ? slugify(body.slug) : undefined,
    });

    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the shop details." }, { status: 400 });
    }

    const slug = parsed.data.slug || slugify(parsed.data.name);
    if (slug.length < 2) {
      return Response.json({ error: "Shop name needs at least two letters or numbers." }, { status: 400 });
    }

    const [existing] = await db.select({ id: shops.id }).from(shops).where(eq(shops.slug, slug)).limit(1);
    if (existing) return Response.json({ error: "That shop link is already in use." }, { status: 409 });

    const [shop] = await db
      .insert(shops)
      .values({ name: parsed.data.name, slug })
      .returning({ id: shops.id, name: shops.name, slug: shops.slug, createdAt: shops.createdAt });

    return Response.json({ shop }, { status: 201 });
  } catch (error) {
    console.error("PrintDrop shop creation failed.", error);
    if (error instanceof DatabaseConfigurationError) {
      return Response.json(
        { error: "Database is not configured yet. Please configure DATABASE_URL in Vercel settings." },
        { status: 503 },
      );
    }
    return Response.json({ error: "Unable to create this shop right now." }, { status: 500 });
  }
}
