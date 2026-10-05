import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { DatabaseConfigurationError, db } from "@/db";
import { shops } from "@/db/schema";
import CustomerOrderForm from "@/components/customer-order-form";

export const dynamic = "force-dynamic";

export default async function ShopOrderPage({
  params,
}: {
  params: Promise<{ shopSlug: string }>;
}) {
  const { shopSlug } = await params;
  let shop: { id: string; name: string; slug: string } | undefined;

  try {
    const [result] = await db
      .select({ id: shops.id, name: shops.name, slug: shops.slug })
      .from(shops)
      .where(eq(shops.slug, shopSlug))
      .limit(1);
    shop = result;
  } catch (error) {
    if (
      error instanceof DatabaseConfigurationError ||
      shopSlug === (process.env.DEFAULT_SHOP_SLUG || "sunbeam-print")
    ) {
      shop = {
        id: "00000000-0000-0000-0000-000000000000",
        name: process.env.DEFAULT_SHOP_NAME?.trim() || "Sunbeam Print Co.",
        slug: shopSlug,
      };
    } else {
      console.error("PrintDrop shop lookup failed:", error);
      notFound();
    }
  }

  if (!shop) {
    if (shopSlug === (process.env.DEFAULT_SHOP_SLUG || "sunbeam-print")) {
      shop = {
        id: "00000000-0000-0000-0000-000000000000",
        name: process.env.DEFAULT_SHOP_NAME?.trim() || "Sunbeam Print Co.",
        slug: shopSlug,
      };
    } else {
      notFound();
    }
  }

  return <CustomerOrderForm shop={shop} />;
}
