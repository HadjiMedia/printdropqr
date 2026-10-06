"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  ImageIcon,
  Inbox,
  LoaderCircle,
  LogOut,
  Maximize2,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Timer,
  X,
  XCircle,
} from "lucide-react";
import {
  calculatePrintPrice,
  COMMON_CANCELLATION_REASONS,
  extractCancellationReason,
  extractPageCount,
  extractUserNotes,
  formatPeso,
  getPaperSizeLabel,
  getPricePerPage,
} from "@/lib/pricing";

type JobStatus = "WAITING" | "PRINTING" | "DONE" | "CANCELLED";
type CategoryTab = "ACTIVE" | "WAITING" | "PRINTING" | "DONE" | "CANCELLED" | "ALL";

type Shop = { id: string; name: string; slug: string; createdAt: string };

type JobAttachment = {
  index: number;
  name: string;
  size: number;
  ext: string;
  mime: string;
  previewUrl: string;
  downloadUrl: string;
};

type Job = {
  id: string;
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
  createdAt: string;
  expiresAt: string;
  pageCount?: number;
  totalPrice?: number;
  pricePerPage?: number;
};

type Props = { shops: Shop[]; selectedSlug: string; initialJobs: Job[] };

function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function readableSize(size: number): string {
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

function StatusBadge({ status }: { status: JobStatus }) {
  const styles: Record<JobStatus, { bg: string; text: string; dot: string; label: string }> = {
    WAITING: { bg: "bg-[#f4f7f2]", text: "text-[#4d6352]", dot: "bg-[#71917a]", label: "Waiting" },
    PRINTING: { bg: "bg-[#edf5fc]", text: "text-[#23588a]", dot: "bg-[#3f88c5]", label: "Printing" },
    DONE: { bg: "bg-[#edf7ea]", text: "text-[#2e7436]", dot: "bg-[#43a047]", label: "Completed" },
    CANCELLED: { bg: "bg-[#fff1ed]", text: "text-[#963724]", dot: "bg-[#c93f26]", label: "Cancelled" },
  };
  const current = styles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${current.bg} ${current.text}`}>
      <span className={`size-1.5 rounded-full ${current.dot}`} />
      {current.label}
    </span>
  );
}

export default function AdminDashboard({ shops: initialShops, selectedSlug: initialSlug, initialJobs }: Props) {
  const router = useRouter();
  const [shops, setShops] = useState(initialShops);
  const [selectedSlug, setSelectedSlug] = useState(initialSlug);
  const [jobs, setJobs] = useState(initialJobs);
  const [activeTab, setActiveTab] = useState<CategoryTab>("ACTIVE");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [shopModal, setShopModal] = useState(false);
  const [newShopName, setNewShopName] = useState("");
  const [shopSaving, setShopSaving] = useState(false);

  // Cancellation modal state
  const [cancellationJob, setCancellationJob] = useState<Job | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>(COMMON_CANCELLATION_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [isSubmittingCancellation, setIsSubmittingCancellation] = useState(false);

  // Image lightbox preview state
  const [lightboxJob, setLightboxJob] = useState<Job | null>(null);
  const [lightboxAttachmentIndex, setLightboxAttachmentIndex] = useState(0);

  const selectedShop = shops.find((shop) => shop.slug === selectedSlug);

  const refreshJobs = useCallback(async (showBusy = false) => {
    if (!selectedSlug) return;
    if (showBusy) setRefreshing(true);
    try {
      const response = await fetch(`/api/admin/jobs?shop=${encodeURIComponent(selectedSlug)}`, { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const result = (await response.json()) as { jobs?: Job[]; error?: string };
      if (!response.ok || !result.jobs) throw new Error(result.error || "Couldn't refresh the queue.");
      setJobs(result.jobs);
      setError("");
    } catch (cause) {
      if (showBusy) setError(cause instanceof Error ? cause.message : "Couldn't refresh the queue.");
    } finally {
      if (showBusy) setRefreshing(false);
    }
  }, [router, selectedSlug]);

  useEffect(() => {
    void refreshJobs();
    const interval = window.setInterval(() => void refreshJobs(), 4500);
    return () => window.clearInterval(interval);
  }, [refreshJobs]);

  function changeShop(slug: string) {
    setSelectedSlug(slug);
    setActiveTab("ACTIVE");
    setSearch("");
    window.history.replaceState(null, "", `/admin/dashboard?shop=${encodeURIComponent(slug)}`);
  }

  async function updateStatus(job: Job, status: JobStatus, reason?: string) {
    setUpdatingId(job.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason }),
      });
      const result = (await response.json()) as { error?: string; status?: JobStatus; cancellationReason?: string };
      if (!response.ok) throw new Error(result.error || "Couldn't update this request.");

      setJobs((current) =>
        current.map((item) =>
          item.id === job.id
            ? {
                ...item,
                status: result.status ?? status,
                cancellationReason: result.cancellationReason ?? reason ?? item.cancellationReason,
              }
            : item,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't update this request.");
    } finally {
      setUpdatingId("");
    }
  }

  async function confirmCancellation() {
    if (!cancellationJob) return;
    const finalReason = selectedReason === "OTHER" ? customReason.trim() : selectedReason;
    if (!finalReason) {
      setError("Please provide a reason for cancelling this print job.");
      return;
    }

    setIsSubmittingCancellation(true);
    await updateStatus(cancellationJob, "CANCELLED", finalReason);
    setIsSubmittingCancellation(false);
    setCancellationJob(null);
    setSelectedReason(COMMON_CANCELLATION_REASONS[0]);
    setCustomReason("");
  }

  async function createShop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShopSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newShopName }),
      });
      const result = (await response.json()) as { shop?: Shop; error?: string };
      if (!response.ok || !result.shop) throw new Error(result.error || "Couldn't create this shop.");
      const created = { ...result.shop, createdAt: new Date(result.shop.createdAt).toISOString() };
      setShops((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setJobs([]);
      changeShop(created.slug);
      setNewShopName("");
      setShopModal(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't create this shop.");
    } finally {
      setShopSaving(false);
    }
  }

  async function logOut() {
    await fetch("/api/admin/session", { method: "DELETE" });
    router.replace("/admin/login");
    router.refresh();
  }

  const counts = useMemo(
    () => ({
      ALL: jobs.length,
      ACTIVE: jobs.filter((job) => job.status === "WAITING" || job.status === "PRINTING").length,
      WAITING: jobs.filter((job) => job.status === "WAITING").length,
      PRINTING: jobs.filter((job) => job.status === "PRINTING").length,
      DONE: jobs.filter((job) => job.status === "DONE").length,
      CANCELLED: jobs.filter((job) => job.status === "CANCELLED").length,
    }),
    [jobs],
  );

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      let matchesTab = true;
      if (activeTab === "ACTIVE") {
        matchesTab = job.status === "WAITING" || job.status === "PRINTING";
      } else if (activeTab !== "ALL") {
        matchesTab = job.status === activeTab;
      }

      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        [job.customerName, job.fileName, String(job.queueNumber), job.notes, job.cancellationReason || ""]
          .some((val) => val.toLowerCase().includes(query));

      return matchesTab && matchesSearch;
    });
  }, [jobs, activeTab, search]);

  return (
    <main className="min-h-screen bg-[#f5f7f4] text-[#20372a]">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-[#e3e9e2] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-[1480px] items-center justify-between px-4 sm:px-7 lg:px-10">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5" aria-label="PrintDrop home">
              <span className="grid size-9 place-items-center rounded-[13px] bg-[#23664b] text-[#d8f5a7]">
                <Printer size={17} />
              </span>
              <span className="text-[18px] font-bold tracking-[-.07em] text-[#20352a]">
                printdrop<span className="text-[#71917f]">.</span>
              </span>
            </Link>
            <span className="hidden h-6 w-px bg-[#e7ece6] sm:block" />
            <span className="hidden text-[11px] font-bold uppercase tracking-[.14em] text-[#6b7c70] sm:block">
              Staff Console
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <span className="hidden items-center gap-2 text-xs font-semibold text-[#486351] md:inline-flex">
              <span className="size-2 animate-pulse rounded-full bg-[#46a85f]" /> Live sync
            </span>
            <button
              onClick={() => void refreshJobs(true)}
              disabled={refreshing}
              className="grid size-9 place-items-center rounded-full border border-[#e5eae4] text-[#738178] transition hover:bg-[#f4f7f3] hover:text-[#23664b] disabled:opacity-60"
              aria-label="Refresh queue"
            >
              {refreshing ? <LoaderCircle size={16} className="animate-spin text-[#23664b]" /> : <RefreshCw size={15} />}
            </button>
            <button
              onClick={() => void logOut()}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-[#e5eae4] px-3.5 text-xs font-semibold text-[#65746a] transition hover:border-[#d5ddd4] hover:bg-[#f6f8f5]"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="mx-auto max-w-[1480px] px-4 pb-14 pt-7 sm:px-7 sm:pt-9 lg:px-10">
        {/* Shop Switcher & Storefront Actions */}
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.15em] text-[#718c77]">
              <Activity size={14} /> Print Management
            </div>
            <h1 className="mt-2 text-[32px] font-bold tracking-[-.06em] text-[#1f362a] sm:text-[40px]">
              {selectedShop ? selectedShop.name : "Print Queue"}
            </h1>
            <p className="mt-1 text-sm text-[#78867e]">
              Monitor print requests, advance queue statuses, preview images, and manage customer orders.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Shop Selector */}
            <div className="relative">
              <select
                id="shop-select"
                value={selectedSlug}
                onChange={(event) => changeShop(event.target.value)}
                className="h-11 min-w-[210px] appearance-none rounded-xl border border-[#dfe6df] bg-white pl-3.5 pr-10 text-sm font-bold text-[#35483b] outline-none shadow-xs focus:border-[#23664b] focus:ring-4 focus:ring-[#23664b]/10"
              >
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.slug}>
                    {shop.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#829087]" />
            </div>

            {/* PAGE ACTION / NAVIGATION: Open Customer Storefront (replaces Copy button) */}
            {selectedShop && (
              <a
                href={`/${selectedShop.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#23664b] bg-[#edf5e8] px-4 text-xs font-bold text-[#23664b] shadow-xs transition hover:bg-[#e1f0db]"
              >
                Open Customer Storefront <ExternalLink size={13} />
              </a>
            )}

            <button
              onClick={() => setShopModal(true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#dfe6df] bg-white px-3.5 text-xs font-bold text-[#486152] transition hover:border-[#b7cbb8] hover:bg-[#fbfcfa]"
            >
              <Plus size={15} /> Add Shop
            </button>
          </div>
        </div>

        {/* Global Error Alert */}
        {error && (
          <div
            role="alert"
            className="mt-5 flex items-center justify-between gap-3 rounded-[16px] border border-[#f0d2c7] bg-[#fff7f3] px-4 py-3 text-sm text-[#9b4b39]"
          >
            <span className="flex items-center gap-2">
              <CircleAlert size={16} />
              {error}
            </span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}

        {/* METRICS & STATUS CATEGORY CARDS */}
        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Waiting Card */}
          <div
            onClick={() => setActiveTab("WAITING")}
            className={`cursor-pointer rounded-2xl border p-4.5 transition ${
              activeTab === "WAITING"
                ? "border-[#23664b] bg-[#f2f8f0] ring-2 ring-[#23664b]/20"
                : "border-[#e3e9e1] bg-white hover:border-[#9cb9a3]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[.1em] text-[#6d8272]">Waiting</span>
              <span className="grid size-8 place-items-center rounded-xl bg-[#f2f6f1] text-[#4d6b53]">
                <Clock3 size={16} />
              </span>
            </div>
            <div className="mt-3 text-3xl font-black tracking-tight text-[#1e3427]">{counts.WAITING}</div>
            <p className="mt-1 text-xs text-[#7d8e81]">Pending printer assignment</p>
          </div>

          {/* Printing Card */}
          <div
            onClick={() => setActiveTab("PRINTING")}
            className={`cursor-pointer rounded-2xl border p-4.5 transition ${
              activeTab === "PRINTING"
                ? "border-[#2968a3] bg-[#f0f6fc] ring-2 ring-[#2968a3]/20"
                : "border-[#e3e9e1] bg-white hover:border-[#9cb9a3]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[.1em] text-[#3b6b98]">Printing</span>
              <span className="grid size-8 place-items-center rounded-xl bg-[#edf5fc] text-[#2968a3]">
                <Printer size={16} />
              </span>
            </div>
            <div className="mt-3 text-3xl font-black tracking-tight text-[#164169]">{counts.PRINTING}</div>
            <p className="mt-1 text-xs text-[#7d8e81]">Active print jobs</p>
          </div>

          {/* Completed Card */}
          <div
            onClick={() => setActiveTab("DONE")}
            className={`cursor-pointer rounded-2xl border p-4.5 transition ${
              activeTab === "DONE"
                ? "border-[#2e7d32] bg-[#f1f8f0] ring-2 ring-[#2e7d32]/20"
                : "border-[#e3e9e1] bg-white hover:border-[#9cb9a3]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[.1em] text-[#38783e]">Completed</span>
              <span className="grid size-8 place-items-center rounded-xl bg-[#eef7ec] text-[#2e7d32]">
                <CheckCircle2 size={16} />
              </span>
            </div>
            <div className="mt-3 text-3xl font-black tracking-tight text-[#1c4e20]">{counts.DONE}</div>
            <p className="mt-1 text-xs text-[#7d8e81]">Ready for customer pickup</p>
          </div>

          {/* Cancelled Card */}
          <div
            onClick={() => setActiveTab("CANCELLED")}
            className={`cursor-pointer rounded-2xl border p-4.5 transition ${
              activeTab === "CANCELLED"
                ? "border-[#c43827] bg-[#fff5f2] ring-2 ring-[#c43827]/20"
                : "border-[#e3e9e1] bg-white hover:border-[#9cb9a3]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[.1em] text-[#9c4535]">Cancelled</span>
              <span className="grid size-8 place-items-center rounded-xl bg-[#fff2ee] text-[#c43827]">
                <XCircle size={16} />
              </span>
            </div>
            <div className="mt-3 text-3xl font-black tracking-tight text-[#7a281b]">{counts.CANCELLED}</div>
            <p className="mt-1 text-xs text-[#7d8e81]">Cancelled with logged reasons</p>
          </div>
        </div>

        {/* WORKSPACE QUEUE SECTION */}
        <section className="mt-7 overflow-hidden rounded-[24px] border border-[#e2e9e1] bg-white shadow-[0_5px_24px_rgba(37,72,47,.035)]">
          {/* Header Controls: Status Category Tabs & Search Filter */}
          <div className="flex flex-col justify-between gap-4 border-b border-[#e9eee8] p-4 sm:p-6 lg:flex-row lg:items-center">
            {/* Category Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-[#f2f5f1] p-1.5">
              <button
                type="button"
                onClick={() => setActiveTab("ACTIVE")}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  activeTab === "ACTIVE"
                    ? "bg-white text-[#1e3427] shadow-xs"
                    : "text-[#627768] hover:text-[#1e3427]"
                }`}
              >
                <span>Active Queue</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                  activeTab === "ACTIVE" ? "bg-[#23664b] text-white" : "bg-[#dfe7de] text-[#4d6352]"
                }`}>
                  {counts.ACTIVE}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("WAITING")}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  activeTab === "WAITING"
                    ? "bg-white text-[#1e3427] shadow-xs"
                    : "text-[#627768] hover:text-[#1e3427]"
                }`}
              >
                <span>Waiting</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                  activeTab === "WAITING" ? "bg-[#23664b] text-white" : "bg-[#dfe7de] text-[#4d6352]"
                }`}>
                  {counts.WAITING}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("PRINTING")}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  activeTab === "PRINTING"
                    ? "bg-white text-[#1e3427] shadow-xs"
                    : "text-[#627768] hover:text-[#1e3427]"
                }`}
              >
                <span>Printing</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                  activeTab === "PRINTING" ? "bg-[#23664b] text-white" : "bg-[#dfe7de] text-[#4d6352]"
                }`}>
                  {counts.PRINTING}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("DONE")}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  activeTab === "DONE"
                    ? "bg-white text-[#1e3427] shadow-xs"
                    : "text-[#627768] hover:text-[#1e3427]"
                }`}
              >
                <span>Completed</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                  activeTab === "DONE" ? "bg-[#23664b] text-white" : "bg-[#dfe7de] text-[#4d6352]"
                }`}>
                  {counts.DONE}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("CANCELLED")}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  activeTab === "CANCELLED"
                    ? "bg-white text-[#1e3427] shadow-xs"
                    : "text-[#627768] hover:text-[#1e3427]"
                }`}
              >
                <span>Cancelled</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                  activeTab === "CANCELLED" ? "bg-[#23664b] text-white" : "bg-[#dfe7de] text-[#4d6352]"
                }`}>
                  {counts.CANCELLED}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("ALL")}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  activeTab === "ALL"
                    ? "bg-white text-[#1e3427] shadow-xs"
                    : "text-[#627768] hover:text-[#1e3427]"
                }`}
              >
                <span>All</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                  activeTab === "ALL" ? "bg-[#23664b] text-white" : "bg-[#dfe7de] text-[#4d6352]"
                }`}>
                  {counts.ALL}
                </span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[260px]">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8b998e]" />
              <input
                type="text"
                placeholder="Search queue #, customer, file…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-xl border border-[#dfe5df] bg-[#fafcfa] pl-9 pr-8 text-xs font-semibold text-[#273d30] outline-none placeholder:text-[#95a397] focus:border-[#23664b] focus:bg-white focus:ring-2 focus:ring-[#23664b]/15"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8b998e] hover:text-[#233a2c]"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Job List / Cards */}
          {filteredJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-[#f0f5ed] text-[#4d7a5b]">
                <Inbox size={26} />
              </span>
              <h3 className="mt-4 text-base font-bold text-[#233b2c]">
                {activeTab === "ACTIVE"
                  ? "Active queue is clear"
                  : `No ${activeTab.toLowerCase()} print jobs`}
              </h3>
              <p className="mt-1 text-xs text-[#7b8c80]">
                {search ? "No requests match your current search query." : "Incoming orders will appear here automatically."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#edf2eb]">
              {filteredJobs.map((job) => {
                const isWorking = updatingId === job.id;
                const pageCount = job.pageCount ?? extractPageCount(job.notes);
                const pricePerPage = job.pricePerPage ?? getPricePerPage(job.colorType, job.paperSize);
                const totalPrice = job.totalPrice ?? calculatePrintPrice(pageCount, job.copies, job.colorType, job.paperSize);
                const userNotes = extractUserNotes(job.notes);
                const cancellationReason = job.cancellationReason ?? extractCancellationReason(job.notes);
                const hasMultiImages = job.attachments && job.attachments.length > 1;

                return (
                  <div
                    key={job.id}
                    className={`p-4.5 transition sm:p-6 ${
                      job.status === "PRINTING"
                        ? "bg-[#f8fbfe]/80"
                        : job.status === "DONE"
                          ? "bg-[#fafcfa]/60"
                          : job.status === "CANCELLED"
                            ? "bg-[#fffdfd]/50"
                            : "hover:bg-[#fafcfa]"
                    }`}
                  >
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                      {/* Left: Queue Number & Customer Details */}
                      <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center">
                          <span className="rounded-xl border border-[#d6e3d4] bg-[#f4f8f2] px-3 py-1.5 font-mono text-base font-black text-[#1b432e] shadow-xs">
                            #{job.queueNumber}
                          </span>
                          <span className="mt-1.5 text-[10px] font-semibold text-[#8b998f]">
                            {relativeTime(job.createdAt)}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-[#1f372a]">{job.customerName}</h3>
                            <StatusBadge status={job.status} />
                          </div>

                          {/* File Description */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#526658]">
                            <span className="font-semibold text-[#253f2f]">{job.fileName}</span>
                            <span>•</span>
                            <span>{readableSize(job.fileSize)}</span>
                          </div>

                          {/* Print Specs */}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-[#edf4ea] px-2 py-0.5 text-[11px] font-bold text-[#2d5c3d]">
                              {getPaperSizeLabel(job.paperSize).split("(")[0].trim()}
                            </span>
                            <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                              job.colorType === "COLOR" ? "bg-[#fcefe8] text-[#b0432a]" : "bg-[#f0f4ef] text-[#3c5545]"
                            }`}>
                              {job.colorType === "COLOR" ? "Color" : "B&W"} (₱{pricePerPage}/page)
                            </span>
                            <span className="rounded-md bg-[#f0f4ee] px-2 py-0.5 text-[11px] font-bold text-[#355240]">
                              {pageCount}p × {job.copies} {job.copies === 1 ? "copy" : "copies"}
                            </span>
                            <span className="rounded-md bg-[#23664b]/10 px-2 py-0.5 text-[11px] font-black text-[#1d523c]">
                              Total {formatPeso(totalPrice)}
                            </span>
                          </div>

                          {/* Customer Notes */}
                          {userNotes && (
                            <div className="mt-2.5 rounded-lg border border-[#e5ede4] bg-[#fcfdfb] px-3 py-1.5 text-xs text-[#526a5a]">
                              <span className="font-bold text-[#2e4737]">Customer note: </span>
                              {userNotes}
                            </div>
                          )}

                          {/* Cancelled Reason Banner */}
                          {job.status === "CANCELLED" && cancellationReason && (
                            <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-[#f5d5cc] bg-[#fff6f3] px-3 py-2 text-xs text-[#9c3924]">
                              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[#b53a22]" />
                              <div>
                                <span className="font-bold">Cancellation Reason: </span>
                                <span>{cancellationReason}</span>
                              </div>
                            </div>
                          )}

                          {/* MULTIPLE ATTACHMENTS PREVIEW THUMBNAILS */}
                          {hasMultiImages && job.attachments && (
                            <div className="mt-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-[.1em] text-[#617767]">
                                  Attached Photos ({job.attachments.length})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLightboxJob(job);
                                    setLightboxAttachmentIndex(0);
                                  }}
                                  className="text-[11px] font-semibold text-[#23664b] hover:underline"
                                >
                                  Preview Gallery
                                </button>
                              </div>
                              <div className="mt-1.5 flex flex-wrap gap-2">
                                {job.attachments.map((att, index) => (
                                  <div
                                    key={att.index}
                                    onClick={() => {
                                      setLightboxJob(job);
                                      setLightboxAttachmentIndex(index);
                                    }}
                                    className="group relative size-14 cursor-pointer overflow-hidden rounded-lg border border-[#dbe4d9] bg-[#f0f4ef] transition hover:shadow-md"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={att.previewUrl}
                                      alt={att.name}
                                      className="size-full object-cover transition group-hover:scale-110"
                                    />
                                    <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[8px] font-bold text-white">
                                      {index + 1}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Quick Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2 self-end lg:self-start">
                        {/* Download / View File */}
                        {hasMultiImages ? (
                          <button
                            type="button"
                            onClick={() => {
                              setLightboxJob(job);
                              setLightboxAttachmentIndex(0);
                            }}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#d8e3d6] bg-white px-3 text-xs font-bold text-[#355240] shadow-xs transition hover:bg-[#f3f7f1]"
                          >
                            <Eye size={14} /> Preview Photos ({job.attachments?.length})
                          </button>
                        ) : (
                          <a
                            href={`/api/jobs/${job.id}/download`}
                            download
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#d8e3d6] bg-white px-3 text-xs font-bold text-[#355240] shadow-xs transition hover:bg-[#f3f7f1]"
                          >
                            <ArrowDownToLine size={14} /> Download File
                          </a>
                        )}

                        {/* Status Transition Action Buttons */}
                        {job.status === "WAITING" && (
                          <>
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() => void updateStatus(job, "PRINTING")}
                              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#23664b] px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#1a4f3a] disabled:opacity-50"
                            >
                              {isWorking ? <LoaderCircle size={14} className="animate-spin" /> : <Printer size={14} />}
                              Start Printing
                            </button>
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() => setCancellationJob(job)}
                              className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#f0d2c8] bg-white px-2.5 text-xs font-bold text-[#a6402e] shadow-xs transition hover:bg-[#fff5f2] disabled:opacity-50"
                            >
                              <X size={13} /> Cancel
                            </button>
                          </>
                        )}

                        {job.status === "PRINTING" && (
                          <>
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() => void updateStatus(job, "DONE")}
                              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#2e7d32] px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#256328] disabled:opacity-50"
                            >
                              {isWorking ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                              Mark Completed
                            </button>
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() => setCancellationJob(job)}
                              className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#f0d2c8] bg-white px-2.5 text-xs font-bold text-[#a6402e] shadow-xs transition hover:bg-[#fff5f2] disabled:opacity-50"
                            >
                              <X size={13} /> Cancel
                            </button>
                          </>
                        )}

                        {job.status === "DONE" && (
                          <button
                            type="button"
                            disabled={isWorking}
                            onClick={() => void updateStatus(job, "WAITING")}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#dfe7de] bg-white px-2.5 text-[11px] font-semibold text-[#667a6d] transition hover:bg-[#f4f7f3]"
                            title="Re-open this job back to Waiting queue"
                          >
                            <RefreshCw size={11} /> Re-queue
                          </button>
                        )}

                        {job.status === "CANCELLED" && (
                          <button
                            type="button"
                            disabled={isWorking}
                            onClick={() => void updateStatus(job, "WAITING")}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#dfe7de] bg-white px-2.5 text-[11px] font-semibold text-[#667a6d] transition hover:bg-[#f4f7f3]"
                            title="Re-open this cancelled job back to Waiting queue"
                          >
                            <RefreshCw size={11} /> Reinstate Job
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* CANCELLATION MODAL WITH REQUIRED REASONS */}
      <AnimatePresence>
        {cancellationJob && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            onClick={() => setCancellationJob(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg overflow-hidden rounded-[24px] border border-[#f0d2c8] bg-white p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[#f5e4df] pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-xl bg-[#fff0ec] text-[#bd3720]">
                    <XCircle size={20} />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-[#1f372a]">
                      Cancel Print Job #{cancellationJob.queueNumber}
                    </h3>
                    <p className="text-xs text-[#7d8f82]">
                      Customer: {cancellationJob.customerName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCancellationJob(null)}
                  className="rounded-lg p-1 text-[#8b998f] hover:bg-[#f4f7f3]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-bold uppercase tracking-[.1em] text-[#4d6354]">
                  Cancellation Reason (Required) <span className="text-[#c43827]">*</span>
                </label>
                <p className="mt-0.5 text-xs text-[#718276]">
                  This reason is saved to job history and shown to the customer in real time.
                </p>

                {/* Common Reasons Radio Options */}
                <div className="mt-3 space-y-2">
                  {COMMON_CANCELLATION_REASONS.map((reason) => (
                    <label
                      key={reason}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-xs font-semibold transition ${
                        selectedReason === reason
                          ? "border-[#c43827] bg-[#fff5f2] text-[#96301f]"
                          : "border-[#e2eae1] bg-[#fafcfa] text-[#344d3e] hover:bg-white"
                      }`}
                    >
                      <span>{reason}</span>
                      <input
                        type="radio"
                        name="cancellation-reason"
                        value={reason}
                        checked={selectedReason === reason}
                        onChange={() => setSelectedReason(reason)}
                        className="size-4 text-[#c43827]"
                      />
                    </label>
                  ))}

                  <label
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-xs font-semibold transition ${
                      selectedReason === "OTHER"
                        ? "border-[#c43827] bg-[#fff5f2] text-[#96301f]"
                        : "border-[#e2eae1] bg-[#fafcfa] text-[#344d3e] hover:bg-white"
                    }`}
                  >
                    <span>Custom / Other Reason…</span>
                    <input
                      type="radio"
                      name="cancellation-reason"
                      value="OTHER"
                      checked={selectedReason === "OTHER"}
                      onChange={() => setSelectedReason("OTHER")}
                      className="size-4 text-[#c43827]"
                    />
                  </label>
                </div>

                {/* Custom Reason Textfield */}
                {selectedReason === "OTHER" && (
                  <div className="mt-3">
                    <textarea
                      rows={2}
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      placeholder="Type specific reason for customer..."
                      maxLength={140}
                      className="w-full rounded-xl border border-[#d8e3d6] p-3 text-xs font-medium text-[#233a2c] outline-none focus:border-[#c43827] focus:ring-2 focus:ring-[#c43827]/15"
                    />
                  </div>
                )}
              </div>

              {/* Modal Action Buttons */}
              <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#f2f6f1] pt-4">
                <button
                  type="button"
                  onClick={() => setCancellationJob(null)}
                  className="rounded-xl border border-[#dbe4d9] px-4 py-2 text-xs font-bold text-[#556e5e] hover:bg-[#f6f8f5]"
                >
                  Keep Job
                </button>
                <button
                  type="button"
                  disabled={isSubmittingCancellation || (selectedReason === "OTHER" && !customReason.trim())}
                  onClick={() => void confirmCancellation()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#c43827] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#a82d1e] disabled:opacity-50"
                >
                  {isSubmittingCancellation ? <LoaderCircle size={14} className="animate-spin" /> : <XCircle size={14} />}
                  Confirm Cancellation
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MULTIPLE IMAGES LIGHTBOX PREVIEW MODAL */}
      <AnimatePresence>
        {lightboxJob && lightboxJob.attachments && lightboxJob.attachments[lightboxAttachmentIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs"
            onClick={() => setLightboxJob(null)}
          >
            <div
              className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-black"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                <a
                  href={lightboxJob.attachments[lightboxAttachmentIndex].downloadUrl}
                  download
                  className="inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/90"
                >
                  <ArrowDownToLine size={13} /> Download
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxJob(null)}
                  className="rounded-full bg-black/60 p-2 text-white hover:bg-black/90"
                  aria-label="Close modal"
                >
                  <X size={18} />
                </button>
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxJob.attachments[lightboxAttachmentIndex].previewUrl}
                alt={lightboxJob.attachments[lightboxAttachmentIndex].name}
                className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain"
              />

              {/* Bottom Thumbnails Strip for Quick Switching */}
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-4 py-2 backdrop-blur-sm">
                <span className="text-xs font-bold text-white">
                  Image {lightboxAttachmentIndex + 1} of {lightboxJob.attachments.length}:
                </span>
                <span className="max-w-[200px] truncate text-xs text-white/80">
                  {lightboxJob.attachments[lightboxAttachmentIndex].name}
                </span>

                {lightboxJob.attachments.length > 1 && (
                  <div className="ml-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxAttachmentIndex((prev) =>
                          prev > 0 ? prev - 1 : lightboxJob.attachments!.length - 1,
                        )
                      }
                      className="rounded bg-white/20 px-2 py-0.5 text-xs font-bold text-white hover:bg-white/30"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxAttachmentIndex((prev) =>
                          prev < lightboxJob.attachments!.length - 1 ? prev + 1 : 0,
                        )
                      }
                      className="rounded bg-white/20 px-2 py-0.5 text-xs font-bold text-white hover:bg-white/30"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CREATE SHOP MODAL */}
      <AnimatePresence>
        {shopModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShopModal(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-[#dfe7de] bg-white p-6 shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-[#e9eee8] pb-3">
                <h3 className="text-base font-bold text-[#1f372a]">Create New Print Shop</h3>
                <button
                  type="button"
                  onClick={() => setShopModal(false)}
                  className="rounded-lg p-1 text-[#8b998f] hover:bg-[#f4f7f3]"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={createShop} className="mt-4 space-y-4">
                <div>
                  <label htmlFor="shop-name-input" className="block text-xs font-bold uppercase tracking-[.1em] text-[#4d6354]">
                    Shop Name
                  </label>
                  <input
                    id="shop-name-input"
                    type="text"
                    required
                    value={newShopName}
                    onChange={(e) => setNewShopName(e.target.value)}
                    placeholder="e.g. Campus Express Print"
                    className="mt-1.5 h-11 w-full rounded-xl border border-[#d8e3d6] px-3.5 text-sm font-semibold text-[#233a2c] outline-none focus:border-[#23664b] focus:ring-2 focus:ring-[#23664b]/20"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShopModal(false)}
                    className="rounded-xl border border-[#dbe4d9] px-4 py-2 text-xs font-bold text-[#556e5e] hover:bg-[#f6f8f5]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={shopSaving || !newShopName.trim()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#23664b] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#1a4f3a] disabled:opacity-50"
                  >
                    {shopSaving ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}
                    Create Shop
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
