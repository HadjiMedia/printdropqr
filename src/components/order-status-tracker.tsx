"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Check, CheckCircle2, Clock3, FileText, LoaderCircle, Printer, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";

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
  const colorLabel = job.colorType === "BW" ? "Black & white" : "Color";

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
          <div className="relative overflow-hidden bg-[#203c2e] px-6 py-7 text-white sm:px-9 sm:py-9">
            <div className="absolute -right-10 -top-20 size-64 rounded-full border border-white/[.07]" />
            <div className="absolute -right-1 -top-11 size-44 rounded-full border border-white/[.07]" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#d3edb0]">
                  <Sparkles size={12} /> Your order is in
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-[-.06em] sm:text-[40px]">
                  You&apos;re all set, {job.customerName.split(" ")[0]}.
                </h1>
                <p className="mt-2 text-sm text-white/65">We&apos;ll keep you posted as your print job moves along.</p>
              </div>
              <div className="hidden rounded-[20px] border border-white/10 bg-white/[.08] px-4 py-3 text-right sm:block">
                <div className="text-[10px] font-bold uppercase tracking-[.13em] text-white/55">Queue number</div>
                <div className="mt-1 text-[32px] font-bold tracking-[-.05em]">#{job.queueNumber}</div>
              </div>
            </div>
            <div className="relative mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.07] px-4 py-3 sm:hidden">
              <div className="text-xs font-medium text-white/65">Your queue number</div>
              <div className="text-2xl font-bold tracking-tight">#{job.queueNumber}</div>
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
            <div className="mt-7 rounded-[20px] border border-[#e7ece6] bg-[#f8faf7] p-4 sm:p-5">
              <div className="flex items-center gap-3 border-b border-[#e7ece6] pb-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[#438263] shadow-sm">
                  <FileText size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[#35483b]">{job.fileName}</div>
                  <div className="mt-1 text-xs text-[#849087]">
                    {(job.fileSize / (1024 * 1024)).toFixed(1)} MB · {job.copies} {job.copies === 1 ? "copy" : "copies"}
                  </div>
                </div>
                <div className="hidden rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#718078] sm:block">
                  #{job.queueNumber}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9aa49d]">Paper</div>
                  <div className="mt-1 text-xs font-semibold text-[#52645a]">{displayPaper}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9aa49d]">Color</div>
                  <div className="mt-1 text-xs font-semibold text-[#52645a]">{colorLabel}</div>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9aa49d]">Sent to</div>
                  <div className="mt-1 truncate text-xs font-semibold text-[#52645a]">{job.shopName}</div>
                </div>
              </div>
              {job.notes && (
                <div className="mt-4 border-t border-[#e7ece6] pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9aa49d]">Your note</div>
                  <p className="mt-1 text-xs leading-5 text-[#52645a]">{job.notes}</p>
                </div>
              )}
            </div>
            {job.status === "DONE" && (
              <div className="mt-5 flex items-start gap-3 rounded-[17px] border border-[#cfe3ca] bg-[#f2f8ed] p-4 text-[#416d49]">
                <CheckCircle2 size={19} className="mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold">Ready for pickup</div>
                  <p className="mt-1 text-xs leading-5 text-[#6c826b]">
                    Show queue number <strong>#{job.queueNumber}</strong> to the team at {job.shopName}.
                  </p>
                </div>
              </div>
            )}
            <div className="mt-5 flex flex-col items-start justify-between gap-3 border-t border-[#edf0ec] pt-4 text-[11px] text-[#8b968e] sm:flex-row sm:items-center">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 size={13} /> Updates automatically every few seconds
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={13} /> File deleted after 24 hours
              </span>
            </div>
            <div className="mt-2 text-right text-[10px] text-[#a0aaa3]">This page checks for updates automatically.</div>
          </div>
        </motion.div>
        <p className="mt-5 text-center text-xs text-[#929d95]">Keep this page open to follow your order with {job.shopName}.</p>
      </section>
    </main>
  );
}
