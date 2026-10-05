import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { shops } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("shop");
  if (!slug) return Response.json({ error: "A shop slug is required." }, { status: 400 });

  try {
    let resolvedSlug = slug;
    try {
      const [shop] = await db.select({ slug: shops.slug }).from(shops).where(eq(shops.slug, slug)).limit(1);
      if (shop) {
        resolvedSlug = shop.slug;
      } else if (slug !== (process.env.DEFAULT_SHOP_SLUG || "sunbeam-print")) {
        return Response.json({ error: "Shop not found." }, { status: 404 });
      }
    } catch {
      if (slug !== (process.env.DEFAULT_SHOP_SLUG || "sunbeam-print")) {
        return Response.json({ error: "Shop not found." }, { status: 404 });
      }
    }

    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
    const origin = configuredOrigin || url.origin;
    const destination = new URL(`/${encodeURIComponent(resolvedSlug)}`, origin).toString();

    const svg = await QRCode.toString(destination, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
      color: { dark: "#173d2e", light: "#ffffff" },
    });

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("PrintDrop QR generation failed.", error);
    return Response.json({ error: "Unable to generate this shop QR code." }, { status: 500 });
  }
}
