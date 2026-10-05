"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  LoaderCircle,
  Printer,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  calculatePrintPrice,
  extractPageCount,
  extractUserNotes,
  formatPeso,
  getPricePerPage,
} from "@/lib/pricing";

type JobStatus = "WAITING" | "PRINTING" | "DONE" | "CANCELLED";

type TrackedJob = {
  id: string;
  shopSlug: string;
  shopName: string;
  queueNumber: number;
  customerName: string;
  fileName: string;
  fileSize: number;
  paperSize: "A4" | "LETTER" | "LEGAL";
  colorType: "BW" | "COLOR";
  copies: number;
  notes: string;
  status: JobStatus;
  createdAt: string;
  expiresAt: string;
  pageCount?: number;
  pricePerPage?: number;
  totalPrice?: number;
};

const steps: { status: Exclude<JobStatus, "CANCELLED">; title: string; description: string }[] = [
  { status: "WAITING", title: "Request received", description: "Your file is safely in the shop's queue." },
  { status: "PRINTING", title: "Printing your pages", description: "The print team is working on your order." },
  { status: "DONE", title: "Ready for pickup", description: "Your pages are ready at the counter." },
];

function statusIndex(status: JobStatus): number {
  if (status === "WAITING") return 0;
  if (status === "PRINTING") return 1;
  if (status === "DONE") return 2;
  return -1;
}

export default function OrderStatusTracker({ job: initialJob }: { job: TrackedJob }) {
  const [job, setJob] = useState(initialJob);
  const [connectionIssue, setConnectionIssue] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/jobs/${initialJob.id}`, { cache: "no-store" });
        if (!response.ok) {
          if (active && response.status === 404) setConnectionIssue(true);
          return;
        }
        const latest = (await response.json()) as TrackedJob;
        if (active) {
          setJob(latest);
          setConnectionIssue(false);
        }
      } catch {
        if (active) setConnectionIssue(true);
      }
    };
    const interval = window.setInterval(refresh, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [initialJob.id]);

  const currentIndex = statusIndex(job.status);
  const wasCancelled = job.status === "CANCELLED";
  const displayPaper = job.paperSize === "LETTER" ? "Letter" : job.paperSize;
  const colorLabel = job.colorType === "BW" ? "Black & White (₱5/page)" : "Colored (₱8/page)";

  const pageCount = job.pageCount ?? extractPageCount(job.notes);
  const cleanNotes = extractUserNotes(job.notes);
  const pricePerPage = job.pricePerPage ?? getPricePerPage(job.colorType);
  const totalPrice = job.totalPrice ?? calculatePrintPrice(pageCount, job.copies, job.colorType);

  return (
    <main className="min-h-screen bg-[#f7f8f5] px-4 pb-14 pt-6 sm:px-6 sm:pt-8">
      <header className="mx-auto flex max-w-[1040px] items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5" aria-label="PrintDrop home">
          <span className="grid size-9 place-items-center rounded-[13px] bg-[#23664b] text-[#d8f5a7]">
            <Printer size={17} />
          </span>
          <span className="text-[18px] font-bold tracking-[-.07em] text-[#20352a]">
            printdrop<span className="text-[#71917f]">.</span>
          </span>
        </Link>
        <div className="inline-flex items-center gap-2 text-xs font-medium text-[#829087]">
          <span className="size-1.5 animate-pulse rounded-full bg-[#72a65c]" /> Live updates
        </div>
      </header>

      <section className="mx-auto mt-8 max-w-[690px] sm:mt-12">
        <Link
          href={`/${job.shopSlug}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#78867e] transition hover:text-[#23664b]"
        >
          <ArrowLeft size={15} /> Back to {job.shopName}
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-5 overflow-hidden rounded-[28px] border border-[#e3eae2] bg-white shadow-[0_18px_60px_rgba(33,66,45,.07)] sm:rounded-[32px]"
        >
          {/* Top Hero Banner with Queue Number and Total Price */}
          <div className="relative overflow-hidden bg-[#203c2e] px-6 py-7 text-white sm:px-9 sm:py-9">
            <div className="absolute -right-10 -top-20 size-64 rounded-full border border-white/[.07]" />
            <div className="absolute -right-1 -top-11 size-44 rounded-full border border-white/[.07]" />

            <div className="relative flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#d3edb0]">
                  <Sparkles size={12} /> Print Order Confirmed
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-[-.06em] sm:text-[40px]">
                  You&apos;re all set, {job.customerName.split(" ")[0]}.
                </h1>
                <p className="mt-2 text-sm text-white/65">
                  Follow along below. Show queue #{job.queueNumber} when picking up.
                </p>
              </div>

              <div className="hidden rounded-[20px] border border-white/10 bg-white/[.08] px-5 py-3.5 text-right sm:block">
                <div className="text-[10px] font-bold uppercase tracking-[.13em] text-white/55">Queue number</div>
                <div className="mt-1 text-[36px] font-bold tracking-[-.05em] text-[#d6f5a6]">#{job.queueNumber}</div>
                <div className="mt-1 text-xs font-semibold text-white/80">Total: {formatPeso(totalPrice)}</div>
              </div>
            </div>

            {/* Mobile Queue Pill */}
            <div className="relative mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.07] px-4 py-3 sm:hidden">
              <div>
                <div className="text-xs font-medium text-white/65">Your queue number</div>
                <div className="text-2xl font-bold tracking-tight text-[#d6f5a6]">#{job.queueNumber}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-medium text-white/65">Total to pay</div>
                <div className="text-xl font-bold text-white">{formatPeso(totalPrice)}</div>
              </div>
            </div>
          </div>

          <div className="px-5 py-6 sm:px-9 sm:py-8">
            {connectionIssue && (
              <div
                role="status"
                className="mb-5 flex items-center gap-2 rounded-xl border border-[#f1d8bd] bg-[#fff9f0] px-3.5 py-3 text-xs leading-5 text-[#8b5e2f]"
              >
                <RefreshCw size={15} className="shrink-0" /> We&apos;re having trouble refreshing this order. We&apos;ll keep
                trying in the background.
              </div>
            )}

            {wasCancelled ? (
              <div className="rounded-2xl border border-[#f0d6cf] bg-[#fff7f5] p-5">
                <div className="font-semibold text-[#9c4a39]">This print request was cancelled.</div>
                <p className="mt-1 text-sm leading-5 text-[#896b65]">
                  Please contact {job.shopName} if you have questions or need to send a new request.
                </p>
              </div>
            ) : (
              <div aria-label="Print progress" className="space-y-0">
                {steps.map((step, index) => {
                  const complete = currentIndex > index;
                  const active = currentIndex === index;
                  return (
                    <div key={step.status} className="relative flex gap-4 pb-7 last:pb-0">
                      {index < steps.length - 1 && (
                        <span
                          className={`absolute left-[17px] top-[36px] h-[calc(100%-27px)] w-[2px] ${
                            complete ? "bg-[#438263]" : "bg-[#e7ece6]"
                          }`}
                          aria-hidden="true"
                        />
                      )}
                      <div
                        className={`relative z-10 grid size-9 shrink-0 place-items-center rounded-full border ${
                          complete
                            ? "border-[#438263] bg-[#438263] text-white"
                            : active
                              ? "border-[#438263] bg-[#eff6e9] text-[#438263] ring-4 ring-[#438263]/10"
                              : "border-[#e0e7e0] bg-white text-[#a5b0a7]"
                        }`}
                      >
                        {complete ? (
                          <Check size={16} strokeWidth={3} />
                        ) : active && step.status === "PRINTING" ? (
                          <Printer size={15} />
                        ) : active ? (
                          <LoaderCircle size={15} className="animate-spin" />
                        ) : (
                          <span className="text-xs font-semibold">{index + 1}</span>
                        )}
                      </div>
                      <div className="pt-0.5">
                        <div className={`text-sm font-semibold ${active || complete ? "text-[#2d4938]" : "text-[#89958d]"}`}>
                          {step.title}
                          {active && (
                            <span className="ml-2 rounded-full bg-[#edf6e7] px-2 py-1 text-[9px] font-bold uppercase tracking-[.1em] text-[#4e8057]">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[#849087]">{step.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Ready For Pickup Notification */}
            {job.status === "DONE" && (
              <div className="mt-5 flex items-start gap-3 rounded-[17px] border border-[#cfe3ca] bg-[#f2f8ed] p-4 text-[#416d49]">
                <CheckCircle2 size={19} className="mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold">Ready for pickup</div>
                  <p className="mt-1 text-xs leading-5 text-[#6c826b]">
                    Show queue number <strong>#{job.queueNumber}</strong> to the team at {job.shopName}. Amount due:{" "}
                    <strong>{formatPeso(totalPrice)}</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* ORDER & PRICING BREAKDOWN */}
            <div className="mt-7 rounded-[22px] border border-[#e5ece3] bg-[#f8faf7] p-5">
              <div className="flex items-center justify-between border-b border-[#e5ece3] pb-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[#438263] shadow-sm">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[#2a4032]">{job.fileName}</div>
                    <div className="mt-0.5 text-xs text-[#7d8e82]">
                      {(job.fileSize / (1024 * 1024)).toFixed(1)} MB · {pageCount} {pageCount === 1 ? "page" : "pages"} · {job.copies}{" "}
                      {job.copies === 1 ? "copy" : "copies"}
                    </div>
                  </div>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 font-mono text-xs font-bold text-[#355240] shadow-sm">
                  #{job.queueNumber}
                </span>
              </div>

              {/* Order Metadata Grid */}
              <div className="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#86978c]">Print Type</div>
                  <div className="mt-1 text-xs font-bold text-[#334d3c]">{colorLabel}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#86978c]">Paper Size</div>
                  <div className="mt-1 text-xs font-bold text-[#334d3c]">{displayPaper}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#86978c]">Pages &amp; Sets</div>
                  <div className="mt-1 text-xs font-bold text-[#334d3c]">
                    {pageCount}p × {job.copies} {job.copies === 1 ? "copy" : "copies"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#86978c]">Shop Counter</div>
                  <div className="mt-1 truncate text-xs font-bold text-[#334d3c]">{job.shopName}</div>
                </div>
              </div>

              {/* Price Calculation Box */}
              <div className="mt-4 flex flex-col justify-between gap-2 rounded-xl border border-[#dce6da] bg-white p-3.5 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 text-xs text-[#526a5a]">
                  <Receipt size={15} className="text-[#3a7553]" />
                  <span>
                    Formula: {pageCount} pages × {job.copies} copies × {formatPeso(pricePerPage)}/page
                  </span>
                </div>
                <div className="flex items-center justify-between sm:justify-end sm:gap-2">
                  <span className="text-xs font-semibold text-[#667a6d]">Total Price:</span>
                  <span className="text-base font-black text-[#1b4b32] sm:text-lg">{formatPeso(totalPrice)}</span>
                </div>
              </div>

              {cleanNotes && (
                <div className="mt-4 border-t border-[#e5ece3] pt-3 text-xs text-[#5e7365]">
                  <span className="font-bold text-[#334d3c]">Your note: </span>
                  {cleanNotes}
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-col items-start justify-between gap-3 border-t border-[#edf0ec] pt-4 text-[11px] text-[#8b968e] sm:flex-row sm:items-center">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 size={13} /> Updates automatically every few seconds
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={13} /> File automatically purged after 24 hours
              </span>
            </div>
          </div>
        </motion.div>

        <p className="mt-5 text-center text-xs text-[#929d95]">Keep this page open to track your pickup number with {job.shopName}.</p>
      </section>
    </main>
  );
}
