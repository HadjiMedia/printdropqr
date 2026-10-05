import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  FileText,
  Leaf,
  Printer,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { shops } from "@/db/schema";
import { ensureStarterShop } from "@/lib/shop";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string | string[] }>;
}) {
  const query = await searchParams;
  const scannedShop = Array.isArray(query.shop) ? query.shop[0] : query.shop;

  if (scannedShop) {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scannedShop);
      const [shop] = await db
        .select({ slug: shops.slug })
        .from(shops)
        .where(isUuid ? or(eq(shops.slug, scannedShop), eq(shops.id, scannedShop)) : eq(shops.slug, scannedShop))
        .limit(1);
      if (shop) redirect(`/${shop.slug}`);
    } catch {
      // If DB is unreachable, proceed to default starter page
    }
  }

  const shop = await ensureStarterShop();

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f8f5]">
      <header className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-6 sm:px-10 lg:px-12">
        <Link href="/" className="flex items-center gap-2.5" aria-label="PrintDrop home">
          <span className="grid size-10 place-items-center rounded-[14px] bg-[#23664b] text-[#d8f5a7]">
            <Printer size={19} strokeWidth={2.4} />
          </span>
          <span className="text-[19px] font-bold tracking-[-0.07em] text-[#20352a]">
            printdrop<span className="text-[#71917f]">.</span>
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm font-semibold text-[#51635a] sm:gap-8">
          <Link href="#how-it-works" className="hidden transition hover:text-[#23664b] sm:block">
            How it works
          </Link>
          <Link href="/admin/login" className="transition hover:text-[#23664b]">
            For print shops
          </Link>
          <Link
            href={`/${shop.slug}`}
            className="inline-flex items-center gap-2 rounded-full bg-[#23664b] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#194d38] sm:px-5"
          >
            Place an order <ArrowUpRight size={16} />
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-[1240px] items-center gap-12 px-6 pb-20 pt-10 sm:px-10 sm:pb-28 sm:pt-16 lg:grid-cols-[1.02fr_.98fr] lg:gap-14 lg:px-12 lg:pt-20">
        <div className="animate-enter relative z-10">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#dfe9df] bg-white px-3.5 py-2 text-xs font-bold uppercase tracking-[.12em] text-[#367455] shadow-[0_5px_18px_rgba(35,75,53,.04)]">
            <span className="size-2 rounded-full bg-[#7eb04d]" /> The neighborhood print counter, upgraded
          </div>
          <h1 className="max-w-[670px] text-[clamp(3.35rem,7.8vw,6.35rem)] font-semibold leading-[.94] tracking-[-.085em] text-[#1b3026]">
            Skip the line.<br />
            <span className="text-[#438263]">Print on</span><br />
            your time.
          </h1>
          <p className="mt-7 max-w-[490px] text-lg leading-8 text-[#66766d] sm:text-[19px]">
            Send your files to the local print shop in seconds. We&apos;ll let you know when your pages are ready to pick up.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={`/${shop.slug}`}
              className="group inline-flex items-center justify-center gap-3 rounded-full bg-[#23664b] px-7 py-4 text-base font-semibold text-white shadow-[0_12px_25px_rgba(35,102,75,.18)] transition hover:-translate-y-0.5 hover:bg-[#194d38]"
            >
              Send a print job <ArrowRight size={18} className="transition group-hover:translate-x-1" />
            </Link>
            <span className="inline-flex items-center justify-center gap-2 px-2 text-sm font-medium text-[#738178]">
              <ShieldCheck size={16} /> No account, no app, no hassle
            </span>
          </div>
          <div className="mt-12 flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-[#e4e9e4] pt-6 text-sm font-medium text-[#65736b]">
            <span className="inline-flex items-center gap-2">
              <Zap size={15} className="text-[#4e8b67]" /> Quick to send
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock3 size={15} className="text-[#4e8b67]" /> Live pickup updates
            </span>
            <span className="inline-flex items-center gap-2">
              <Leaf size={15} className="text-[#4e8b67]" /> Files auto-delete
            </span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[550px] animate-enter [animation-delay:100ms]">
          <div className="absolute -left-8 top-14 size-36 rounded-full bg-[#d8f0bc] blur-3xl" />
          <div className="absolute -right-10 bottom-0 size-44 rounded-full bg-[#f8d9c5] blur-3xl" />
          <div className="relative rounded-[30px] border border-[#e0e9e0] bg-white p-4 shadow-[0_28px_85px_rgba(39,74,53,.13)] sm:rounded-[36px] sm:p-6">
            <div className="flex items-center justify-between px-1 pb-5">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[.14em] text-[#84938a]">Your print queue</div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-[#243b2e]">A little less waiting.</div>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-[#edf7e5] px-3 py-1.5 text-xs font-semibold text-[#44764e]">
                <span className="size-1.5 animate-pulse rounded-full bg-[#65a351]" /> Live
              </div>
            </div>
            <div className="rounded-[23px] bg-[#f5f8f3] p-4 sm:p-5">
              <div className="flex items-center justify-between border-b border-[#e4eae1] pb-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-2xl bg-white text-[#35704e] shadow-sm">
                    <FileText size={20} />
                  </div>
                  <div>
                    <div className="font-semibold text-[#263c30]">Class notes.pdf</div>
                    <div className="mt-0.5 text-xs text-[#78877e]">4 copies · A4 · B&amp;W</div>
                  </div>
                </div>
                <span className="rounded-full bg-[#e8f2fd] px-2.5 py-1 text-[11px] font-bold text-[#497599]">Printing</span>
              </div>
              <div className="flex items-center gap-2 py-5">
                <div className="grid size-7 place-items-center rounded-full bg-[#438263] text-white">
                  <Check size={14} strokeWidth={3} />
                </div>
                <div className="h-[3px] flex-1 rounded-full bg-[#438263]" />
                <div className="grid size-7 place-items-center rounded-full bg-[#438263] text-white">
                  <Printer size={13} />
                </div>
                <div className="h-[3px] flex-1 rounded-full bg-[#dce6dc]" />
                <div className="grid size-7 place-items-center rounded-full border border-[#d7e1d8] bg-white text-[#9aaa9f]">
                  <Check size={14} />
                </div>
              </div>
              <div className="flex justify-between text-[11px] font-semibold text-[#718078]">
                <span>Request sent</span>
                <span className="text-[#438263]">Printing now</span>
                <span>Ready for pickup</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 rounded-[22px] bg-[#213c2e] px-4 py-4 text-white sm:px-5">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-white/10 text-[#c8ee93]">
                  <Sparkles size={19} />
                </div>
                <div>
                  <div className="text-xs text-white/65">Your pickup number</div>
                  <div className="text-[21px] font-bold tracking-tight">#1042</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-white/60">No app needed</div>
                <div className="mt-1 flex items-center justify-end gap-1 text-xs font-semibold text-[#d0efa4]">
                  We&apos;ll keep you posted <ArrowRight size={13} />
                </div>
              </div>
            </div>

            <div className="absolute -right-3 top-[43%] hidden -translate-y-1/2 rotate-3 items-center gap-3 rounded-2xl border border-[#e7eae5] bg-white px-4 py-3 shadow-lg sm:flex">
              <Image
                unoptimized
                src={`/api/qr-code?shop=${encodeURIComponent(shop.slug)}`}
                width={55}
                height={55}
                alt={`QR code for ${shop.name}`}
                className="rounded-lg"
              />
              <div>
                <div className="text-xs font-bold text-[#2b4335]">Scan &amp; send</div>
                <div className="mt-1 text-[11px] text-[#829087]">Right from your phone</div>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-4 -left-3 hidden items-center gap-2 rounded-full border border-[#e3e9e1] bg-white px-4 py-2.5 text-xs font-semibold text-[#4c6d56] shadow-md sm:flex">
            <ArrowDownRight size={15} /> Your neighborhood shop, just one scan away
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-[#e6ebe5] bg-white/70">
        <div className="mx-auto max-w-[1240px] px-6 py-16 sm:px-10 sm:py-20 lg:px-12">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <div className="text-xs font-bold uppercase tracking-[.16em] text-[#6a8d75]">A better kind of print run</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-.055em] text-[#1e3529] sm:text-[42px]">
                Three steps. Then pick it up.
              </h2>
            </div>
            <p className="max-w-[360px] text-sm leading-6 text-[#738078]">
              Built for busy print counters and the people who just need their pages.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                number: "01",
                title: "Scan the shop QR",
                text: "Open the print shop link. Nothing to download and no account to make.",
                icon: "📱",
              },
              {
                number: "02",
                title: "Send your file",
                text: "Choose your paper, color and copies, then get a live queue number.",
                icon: "📄",
              },
              {
                number: "03",
                title: "Pick up when ready",
                text: "Watch your order move through the queue and collect when it's done.",
                icon: "✅",
              },
            ].map((step) => (
              <article key={step.number} className="rounded-[22px] border border-[#e5ebe4] bg-white p-6 sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-[.13em] text-[#819086]">STEP {step.number}</span>
                  <span className="grid size-10 place-items-center rounded-xl bg-[#eff6e9] text-xl font-semibold text-[#438263]">
                    {step.icon}
                  </span>
                </div>
                <h3 className="mt-7 text-lg font-semibold tracking-tight text-[#263d30]">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#738078]">{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-3 px-6 py-7 text-xs font-medium text-[#87938b] sm:flex-row sm:items-center sm:px-10 lg:px-12">
        <span>© {new Date().getFullYear()} PrintDrop. Made for your local print shop.</span>
        <Link href="/admin/login" className="transition hover:text-[#23664b]">
          Print shop staff sign in <ArrowUpRight size={13} className="inline" />
        </Link>
      </footer>
    </main>
  );
}
