"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Eye,
  FileText,
  ImageIcon,
  LoaderCircle,
  Printer,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  X,
  XCircle,
} from "lucide-react";
import {
  calculatePrintPrice,
  extractCancellationReason,
  extractPageCount,
  extractUserNotes,
  formatPeso,
  getPaperSizeLabel,
  getPricePerPage,
} from "@/lib/pricing";

type JobStatus = "WAITING" | "PRINTING" | "DONE" | "CANCELLED";

type JobAttachment = {
  index: number;
  name: string;
  size: number;
  ext: string;
  mime: string;
  previewUrl: string;
  downloadUrl?: string;
};

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
  cancellationReason?: string | null;
  attachments?: JobAttachment[];
  downloadUrl?: string;
  downloadAllUrl?: string;
  createdAt: string;
  expiresAt: string;
  pageCount?: number;
  pricePerPage?: number;
  totalPrice?: number;
};

const steps: { status: Exclude<JobStatus, "CANCELLED">; title: string; description: string }[] = [
  { status: "WAITING", title: "Request received", description: "Your file is safely in the shop's queue." },
  { status: "PRINTING", title: "Printing your pages", description: "The print team is currently printing your order." },
  { status: "DONE", title: "Ready for pickup", description: "Your pages are ready at the counter." },
];

function statusIndex(status: JobStatus): number {
  if (status === "WAITING") return 0;
  if (status === "PRINTING") return 1;
  if (status === "DONE") return 2;
  return -1;
}

function playAudioChime(type: "printing" | "done" | "cancelled") {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "done") {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } else if (type === "printing") {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(554.37, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } else {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(349.23, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    }
  } catch {
    // Ignore audio permission/context errors
  }
}

export default function OrderStatusTracker({ job: initialJob }: { job: TrackedJob }) {
  const [job, setJob] = useState(initialJob);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationsAllowed, setNotificationsAllowed] = useState(false);
  const [activeAlert, setActiveAlert] = useState<{
    type: "printing" | "done" | "cancelled";
    title: string;
    message: string;
  } | null>(null);
  const [previewModalAttachment, setPreviewModalAttachment] = useState<JobAttachment | null>(null);

  const prevStatusRef = useRef<JobStatus>(initialJob.status);

  // Check browser notification permission
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        setNotificationsAllowed(true);
      }
    }
  }, []);

  async function requestBrowserNotifications() {
    if (typeof window !== "undefined" && "Notification" in window) {
      const permission = await Notification.requestPermission();
      setNotificationsAllowed(permission === "granted");
    }
  }

  // Real-time synchronization polling every 3 seconds
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
        if (!active) return;

        // Check for real-time status transitions
        if (latest.status !== prevStatusRef.current) {
          const oldStatus = prevStatusRef.current;
          prevStatusRef.current = latest.status;

          if (latest.status === "PRINTING") {
            if (soundEnabled) playAudioChime("printing");
            setActiveAlert({
              type: "printing",
              title: "Printing Started!",
              message: `Your print job is now actively being printed by the ${latest.shopName} staff.`,
            });
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(`🖨️ Printing Started - Queue #${latest.queueNumber}`, {
                body: `Your document is now printing at ${latest.shopName}.`,
              });
            }
          } else if (latest.status === "DONE") {
            if (soundEnabled) playAudioChime("done");
            setActiveAlert({
              type: "done",
              title: "Order Ready for Pickup!",
              message: `Your print job is complete! Please proceed to the counter and show Queue #${latest.queueNumber}.`,
            });
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(`🎉 Order Ready - Queue #${latest.queueNumber}`, {
                body: `Your print job is ready for pickup at ${latest.shopName}!`,
              });
            }
          } else if (latest.status === "CANCELLED") {
            if (soundEnabled) playAudioChime("cancelled");
            setActiveAlert({
              type: "cancelled",
              title: "Print Job Cancelled",
              message: latest.cancellationReason
                ? `Reason: ${latest.cancellationReason}`
                : "Your print job was cancelled by the staff. Please see the counter for help.",
            });
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(`⚠️ Order Cancelled - Queue #${latest.queueNumber}`, {
                body: latest.cancellationReason || "Your print job was cancelled.",
              });
            }
          }
        }

        setJob(latest);
        setConnectionIssue(false);
      } catch {
        if (active) setConnectionIssue(true);
      }
    };

    const interval = window.setInterval(refresh, 3000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [initialJob.id, soundEnabled]);

  const currentIndex = statusIndex(job.status);
  const wasCancelled = job.status === "CANCELLED";
  const displayPaper = getPaperSizeLabel(job.paperSize);

  const pageCount = job.pageCount ?? extractPageCount(job.notes);
  const cleanNotes = extractUserNotes(job.notes);
  const cancellationReason = job.cancellationReason ?? extractCancellationReason(job.notes);
  const pricePerPage = job.pricePerPage ?? getPricePerPage(job.colorType, job.paperSize);
  const totalPrice = job.totalPrice ?? calculatePrintPrice(pageCount, job.copies, job.colorType, job.paperSize);
  const colorLabel =
    job.colorType === "BW"
      ? `Black & White (${formatPeso(pricePerPage)}/page)`
      : `Colored (${formatPeso(pricePerPage)}/page)`;

  return (
    <main className="min-h-screen bg-[#f7f8f5] px-4 pb-14 pt-6 sm:px-6 sm:pt-8">
      {/* Top Header */}
      <header className="mx-auto flex max-w-[1040px] items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5" aria-label="PrintDrop home">
          <span className="grid size-9 place-items-center rounded-[13px] bg-[#23664b] text-[#d8f5a7]">
            <Printer size={17} />
          </span>
          <span className="text-[18px] font-bold tracking-[-.07em] text-[#20352a]">
            printdrop<span className="text-[#71917f]">.</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-full border border-[#dfe7de] bg-white px-2.5 py-1 text-xs font-semibold text-[#5a7061] shadow-xs transition hover:bg-[#f4f8f3]"
            title={soundEnabled ? "Sound alerts enabled" : "Sound alerts muted"}
          >
            {soundEnabled ? <Volume2 size={13} className="text-[#23664b]" /> : <VolumeX size={13} />}
            <span className="hidden sm:inline">{soundEnabled ? "Sound on" : "Muted"}</span>
          </button>
          {!notificationsAllowed && typeof window !== "undefined" && "Notification" in window && (
            <button
              type="button"
              onClick={requestBrowserNotifications}
              className="hidden items-center gap-1.5 rounded-full border border-[#dfe7de] bg-white px-2.5 py-1 text-xs font-semibold text-[#23664b] shadow-xs transition hover:bg-[#edf5e8] sm:flex"
            >
              <Bell size={13} /> Enable push alerts
            </button>
          )}
          <div className="inline-flex items-center gap-2 text-xs font-medium text-[#829087]">
            <span className="size-1.5 animate-pulse rounded-full bg-[#72a65c]" /> Live sync
          </div>
        </div>
      </header>

      {/* Main Content Card */}
      <section className="mx-auto mt-6 max-w-[690px] sm:mt-10">
        <div className="flex items-center justify-between">
          <Link
            href={`/${job.shopSlug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#78867e] transition hover:text-[#23664b]"
          >
            <ArrowLeft size={15} /> Back to {job.shopName}
          </Link>

          {/* PAGE ACTION / NAVIGATION: Open Print Job Page Details */}
          <a
            href={`/${job.shopSlug}/status/${job.id}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#dfe7de] bg-white px-3 py-1.5 text-xs font-bold text-[#23664b] shadow-xs transition hover:bg-[#edf5e8]"
            title="Open print job page details"
          >
            <ExternalLink size={13} /> Page
          </a>
        </div>

        {/* REAL-TIME NOTIFICATION POPUP BANNER */}
        <AnimatePresence>
          {activeAlert && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              className={`mt-4 flex items-start justify-between gap-3 rounded-2xl border p-4 shadow-md ${
                activeAlert.type === "done"
                  ? "border-[#a5d89f] bg-[#eef8eb] text-[#25572b]"
                  : activeAlert.type === "printing"
                    ? "border-[#b5d5f5] bg-[#edf5fc] text-[#1f4a73]"
                    : "border-[#f7c2b5] bg-[#fff3ef] text-[#912d1b]"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5">
                  {activeAlert.type === "done" ? (
                    <CheckCircle2 size={20} className="text-[#2e7436]" />
                  ) : activeAlert.type === "printing" ? (
                    <Printer size={20} className="text-[#2b6496]" />
                  ) : (
                    <XCircle size={20} className="text-[#b53721]" />
                  )}
                </span>
                <div>
                  <h4 className="text-sm font-bold">{activeAlert.title}</h4>
                  <p className="mt-0.5 text-xs opacity-90">{activeAlert.message}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveAlert(null)}
                className="rounded-lg p-1 opacity-70 hover:opacity-100"
                aria-label="Dismiss alert"
              >
                <X size={15} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-4 overflow-hidden rounded-[28px] border border-[#e3eae2] bg-white shadow-[0_18px_60px_rgba(33,66,45,.07)] sm:rounded-[32px]"
        >
          {/* Top Hero Banner with Queue Number and Total Price */}
          <div
            className={`relative overflow-hidden px-6 py-7 text-white sm:px-9 sm:py-9 transition-colors ${
              wasCancelled
                ? "bg-[#45221d]"
                : job.status === "DONE"
                  ? "bg-[#18442a]"
                  : job.status === "PRINTING"
                    ? "bg-[#19394d]"
                    : "bg-[#203c2e]"
            }`}
          >
            <div className="absolute -right-10 -top-20 size-64 rounded-full border border-white/[.07]" />
            <div className="absolute -right-1 -top-11 size-44 rounded-full border border-white/[.07]" />

            <div className="relative flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#d3edb0]">
                  {wasCancelled ? (
                    <span className="text-[#f7b3a6]">Job Cancelled</span>
                  ) : job.status === "DONE" ? (
                    <span className="text-[#c1f298]">Order Completed</span>
                  ) : job.status === "PRINTING" ? (
                    <span className="text-[#a5d8f7]">Printing in Progress</span>
                  ) : (
                    <><Sparkles size={12} /> Print Order Confirmed</>
                  )}
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-[-.06em] sm:text-[40px]">
                  {wasCancelled
                    ? "Order Cancelled"
                    : job.status === "DONE"
                      ? "Ready for Pickup!"
                      : job.status === "PRINTING"
                        ? "Currently Printing"
                        : `You're all set, ${job.customerName.split(" ")[0]}.`}
                </h1>
                <p className="mt-2 text-sm text-white/75">
                  {wasCancelled
                    ? `Order #${job.queueNumber} was cancelled by the shop team.`
                    : job.status === "DONE"
                      ? `Your order is finished. Show queue #${job.queueNumber} at the counter.`
                      : job.status === "PRINTING"
                        ? `The print shop is currently printing your documents.`
                        : `Follow along below. Show queue #${job.queueNumber} when picking up.`}
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
                <RefreshCw size={15} className="shrink-0 animate-spin" /> Reconnecting to live queue…
              </div>
            )}

            {/* CANCELLED STATE WITH REQUIRED REASON DISPLAY */}
            {wasCancelled ? (
              <div className="rounded-2xl border border-[#f0d4cb] bg-[#fff5f2] p-5 text-left">
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#c23f2b] text-white shadow-sm">
                    <XCircle size={22} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-[#912d1b]">This print request was cancelled</h3>
                    <div className="mt-3 rounded-xl border border-[#f5cfc5] bg-white p-3.5 shadow-xs">
                      <span className="block text-[11px] font-bold uppercase tracking-[.1em] text-[#a1402e]">
                        Reason for Cancellation:
                      </span>
                      <p className="mt-1 text-sm font-semibold text-[#6e2213]">
                        {cancellationReason || "No specific reason provided by staff."}
                      </p>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-[#7a483e]">
                      If you need assistance, please speak with the staff at {job.shopName} or submit a revised file.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* PROGRESS STEPPER */
              <div aria-label="Print progress" className="space-y-0">
                {steps.map((step, index) => {
                  const complete = currentIndex > index;
                  const active = currentIndex === index;
                  return (
                    <div key={step.status} className="relative flex gap-4 pb-7 last:pb-0">
                      {index < steps.length - 1 && (
                        <span
                          className={`absolute left-[17px] top-[36px] h-[calc(100%-27px)] w-[2px] transition-colors ${
                            complete ? "bg-[#23664b]" : "bg-[#e5ece2]"
                          }`}
                        />
                      )}
                      <div
                        className={`relative z-10 grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold transition-all ${
                          complete
                            ? "bg-[#23664b] text-white"
                            : active
                              ? "bg-[#23664b] text-white ring-4 ring-[#23664b]/20"
                              : "border border-[#dbe4d9] bg-white text-[#94a397]"
                        }`}
                      >
                        {complete ? (
                          <Check size={16} />
                        ) : active ? (
                          <LoaderCircle size={16} className="animate-spin text-[#d8f5a7]" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <div className="min-w-0 pt-0.5">
                        <div className="flex items-center gap-2">
                          <div className={`text-sm font-bold ${active ? "text-[#1f372a]" : "text-[#4d6354]"}`}>
                            {step.title}
                          </div>
                          {active && (
                            <span className="rounded-full bg-[#edf6eb] px-2 py-0.5 text-[10px] font-bold uppercase text-[#23664b]">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-[#718276]">{step.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* READY FOR PICKUP BANNER */}
            {job.status === "DONE" && (
              <div className="mt-6 flex items-start gap-3 rounded-[20px] border border-[#b7dfaf] bg-[#edf8e9] p-4.5 text-[#27592e] shadow-sm">
                <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-[#2f7537]" />
                <div>
                  <div className="text-base font-bold text-[#1f4a25]">Your prints are ready for pickup!</div>
                  <p className="mt-1 text-xs leading-5 text-[#456d49]">
                    Show queue number <strong>#{job.queueNumber}</strong> to the staff at <strong>{job.shopName}</strong>.
                    Amount due: <strong>{formatPeso(totalPrice)}</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* PRINTING BANNER */}
            {job.status === "PRINTING" && (
              <div className="mt-6 flex items-start gap-3 rounded-[20px] border border-[#bcd7f5] bg-[#edf5fc] p-4.5 text-[#224f78] shadow-sm">
                <Printer size={22} className="mt-0.5 shrink-0 text-[#245b8a]" />
                <div>
                  <div className="text-base font-bold text-[#1a4166]">Printing in progress</div>
                  <p className="mt-1 text-xs leading-5 text-[#3b6082]">
                    The shop team has started printing your {pageCount} pages ({job.copies} {job.copies === 1 ? "copy" : "copies"}). Please stand by.
                  </p>
                </div>
              </div>
            )}

            {/* ORDER & PRICING BREAKDOWN */}
            <div className="mt-7 rounded-[22px] border border-[#e5ece3] bg-[#f8faf7] p-5">
              <div className="flex flex-col gap-3 border-b border-[#e5ece3] pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[#438263] shadow-sm">
                    {job.attachments && job.attachments.length > 1 ? (
                      <ImageIcon size={18} />
                    ) : (
                      <FileText size={18} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[#2a4032]">{job.fileName}</div>
                    <div className="mt-0.5 text-xs text-[#7d8e82]">
                      {(job.fileSize / (1024 * 1024)).toFixed(1)} MB · {pageCount} {pageCount === 1 ? "page" : "pages"} · {job.copies}{" "}
                      {job.copies === 1 ? "copy" : "copies"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                  {/* Download Action */}
                  {job.attachments && job.attachments.length > 1 ? (
                    <a
                      href={`/api/jobs/${job.id}/download?all=1`}
                      download
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#23664b] bg-[#edf5e8] px-3 text-xs font-bold text-[#23664b] shadow-xs transition hover:bg-[#e1f0db]"
                      title="Download all attached files as a ZIP archive"
                    >
                      <ArrowDownToLine size={13} /> Download All (ZIP)
                    </a>
                  ) : (
                    <a
                      href={`/api/jobs/${job.id}/download`}
                      download
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#d8e3d6] bg-white px-3 text-xs font-bold text-[#355240] shadow-xs transition hover:bg-[#f3f7f1]"
                      title="Download your printable file"
                    >
                      <ArrowDownToLine size={13} /> Download File
                    </a>
                  )}

                  <span className="rounded-full bg-white px-2.5 py-1 font-mono text-xs font-bold text-[#355240] shadow-sm">
                    #{job.queueNumber}
                  </span>
                </div>
              </div>

              {/* Multiple Uploads Gallery */}
              {job.attachments && job.attachments.length > 0 && (
                <div className="mt-4 border-b border-[#e5ece3] pb-4">
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#455c4d]">
                    <span>Uploaded Files ({job.attachments.length})</span>
                    <div className="flex items-center gap-3">
                      {job.attachments.length > 1 && (
                        <a
                          href={`/api/jobs/${job.id}/download?all=1`}
                          download
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#23664b] hover:underline"
                          title="Download all images as a ZIP archive"
                        >
                          <ArrowDownToLine size={12} /> Download All (ZIP)
                        </a>
                      )}
                      <span className="text-[11px] font-normal text-[#718276]">Click to preview</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {job.attachments.map((att) => (
                      <div
                        key={att.index}
                        onClick={() => setPreviewModalAttachment(att)}
                        className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-[#dfe6dd] bg-white p-1.5 transition hover:shadow-md"
                      >
                        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-[#f1f5f0]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={att.previewUrl}
                            alt={att.name}
                            className="h-full w-full object-cover transition group-hover:scale-105"
                          />
                          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold text-white">
                            Page {att.index + 1}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-1 px-0.5">
                          <span className="truncate text-[10px] font-semibold text-[#304838]">
                            {att.name}
                          </span>
                          <a
                            href={att.downloadUrl || `/api/jobs/${job.id}/download?index=${att.index}`}
                            download
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 rounded-md p-1 text-[#23664b] hover:bg-[#edf5e8]"
                            title={`Download ${att.name}`}
                          >
                            <ArrowDownToLine size={12} />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

        <p className="mt-5 text-center text-xs text-[#929d95]">
          Keep this page open to track your pickup number with {job.shopName}.
        </p>
      </section>

      {/* PREVIEW ATTACHMENT LIGHTBOX */}
      <AnimatePresence>
        {previewModalAttachment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
            onClick={() => setPreviewModalAttachment(null)}
          >
            <div
              className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-black"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                <a
                  href={`/api/jobs/${job.id}/download?index=${previewModalAttachment.index}`}
                  download
                  className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/90"
                  title={`Download ${previewModalAttachment.name}`}
                >
                  <ArrowDownToLine size={13} /> Download Photo
                </a>
                {job.attachments && job.attachments.length > 1 && (
                  <a
                    href={`/api/jobs/${job.id}/download?all=1`}
                    download
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#23664b] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a4f3a]"
                    title="Download all photos as a ZIP archive"
                  >
                    <ArrowDownToLine size={13} /> Download All (ZIP)
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewModalAttachment(null)}
                  className="rounded-full bg-black/60 p-2 text-white hover:bg-black/90"
                  aria-label="Close image preview"
                >
                  <X size={18} />
                </button>
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewModalAttachment.previewUrl}
                alt={previewModalAttachment.name}
                className="max-h-[85vh] w-auto max-w-full rounded-2xl object-contain"
              />

              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                {previewModalAttachment.name} ({(previewModalAttachment.size / 1024).toFixed(0)} KB)
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
