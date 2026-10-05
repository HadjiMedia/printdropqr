import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f6f8f5] px-6 text-center text-[#1f372a]">
      <div className="grid size-14 place-items-center rounded-2xl bg-[#23664b] text-[#d8f5a7] shadow-sm">
        <Printer size={28} />
      </div>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-[#1b3225] sm:text-4xl">
        Page Not Found
      </h1>
      <p className="mt-3 max-w-[420px] text-sm leading-6 text-[#697a6f]">
        The page or print counter you are looking for doesn&apos;t exist or may have been moved.
      </p>
      <div className="mt-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-[#23664b] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1a4f3a]"
        >
          <ArrowLeft size={16} /> Return to Home
        </Link>
      </div>
    </main>
  );
}
