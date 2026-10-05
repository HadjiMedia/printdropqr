"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  LoaderCircle,
  LogOut,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Timer,
  X,
} from "lucide-react";

type JobStatus = "WAITING" | "PRINTING" | "DONE" | "CANCELLED";
type Shop = { id: string; name: string; slug: string; createdAt: string };
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
  createdAt: string;
  expiresAt: string;
};

type Filter = "ALL" | JobStatus;
type Props = { shops: Shop[]; selectedSlug: string; initialJobs: Job[] };

const statuses: { value: JobStatus; label: string }[] = [
  { value: "WAITING", label: "Waiting" },
  { value: "PRINTING", label: "Printing" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
];

function prettyStatus(status: JobStatus): string {
  return statuses.find((item) => item.value === status)?.label ?? status;
}

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
  const styles: Record<JobStatus, string> = {
    WAITING: "bg-[#f1f3ef] text-[#65746a]",
    PRINTING: "bg-[#eaf2fb] text-[#4e7297]",
    DONE: "bg-[#edf6e8] text-[#4e8057]",
    CANCELLED: "bg-[#fff0eb] text-[#a55c48]",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold ${styles[status]}`}>
      <span
        className={`size-1.5 rounded-full ${
          status === "WAITING"
            ? "bg-[#929d94]"
            : status === "PRINTING"
              ? "bg-[#6a94bd]"
              : status === "DONE"
                ? "bg-[#74a45d]"
                : "bg-[#d17a61]"
        }`}
      />
      {prettyStatus(status)}
    </span>
  );
}

export default function AdminDashboard({ shops: initialShops, selectedSlug: initialSlug, initialJobs }: Props) {
  const router = useRouter();
  const [shops, setShops] = useState(initialShops);
  const [selectedSlug, setSelectedSlug] = useState(initialSlug);
  const [jobs, setJobs] = useState(initialJobs);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [shopModal, setShopModal] = useState(false);
  const [newShopName, setNewShopName] = useState("");
  const [shopSaving, setShopSaving] = useState(false);
  const [copied, setCopied] = useState(false);

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
    const interval = window.setInterval(() => void refreshJobs(), 6000);
    return () => window.clearInterval(interval);
  }, [refreshJobs]);

  function changeShop(slug: string) {
    setSelectedSlug(slug);
    setFilter("ALL");
    setSearch("");
    window.history.replaceState(null, "", `/admin/dashboard?shop=${encodeURIComponent(slug)}`);
  }

  async function updateStatus(job: Job, status: JobStatus) {
    if (job.status === status) return;
    setUpdatingId(job.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = (await response.json()) as { error?: string; status?: JobStatus };
      if (!response.ok) throw new Error(result.error || "Couldn't update this request.");
      setJobs((current) => current.map((item) => (item.id === job.id ? { ...item, status: result.status ?? status } : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't update this request.");
    } finally {
      setUpdatingId("");
    }
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

  async function copyShopLink() {
    if (!selectedShop) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${selectedShop.slug}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy the shop link. You can copy it from the address field instead.");
    }
  }

  const counts = useMemo(
    () => ({
      ALL: jobs.length,
      WAITING: jobs.filter((job) => job.status === "WAITING").length,
      PRINTING: jobs.filter((job) => job.status === "PRINTING").length,
      DONE: jobs.filter((job) => job.status === "DONE").length,
      CANCELLED: jobs.filter((job) => job.status === "CANCELLED").length,
    }),
    [jobs],
  );

  const visibleJobs = useMemo(
    () =>
      jobs.filter((job) => {
        const matchesFilter = filter === "ALL" || job.status === filter;
        const query = search.trim().toLowerCase();
        const matchesSearch =
          !query ||
          [job.customerName, job.fileName, String(job.queueNumber)].some((value) => value.toLowerCase().includes(query));
        return matchesFilter && matchesSearch;
      }),
    [jobs, filter, search],
  );

  return (
    <main className="min-h-screen bg-[#f5f7f4] text-[#20372a]">
      <header className="sticky top-0 z-30 border-b border-[#e3e9e2] bg-white/95 backdrop-blur">
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
            <span className="hidden text-[10px] font-bold uppercase tracking-[.14em] text-[#839087] sm:block">
              Staff console
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden items-center gap-2 text-xs font-medium text-[#78877e] md:inline-flex">
              <span className="size-1.5 animate-pulse rounded-full bg-[#76a65e]" /> Queue live
            </span>
            <button
              onClick={() => void refreshJobs(true)}
              disabled={refreshing}
              className="grid size-9 place-items-center rounded-full border border-[#e5eae4] text-[#738178] transition hover:bg-[#f4f7f3] hover:text-[#23664b] disabled:opacity-60"
              aria-label="Refresh queue"
            >
              {refreshing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={15} />}
            </button>
            <button
              onClick={() => void logOut()}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-[#e5eae4] px-3 text-xs font-semibold text-[#65746a] transition hover:border-[#d5ddd4] hover:bg-[#f6f8f5]"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1480px] px-4 pb-12 pt-7 sm:px-7 sm:pt-9 lg:px-10">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.15em] text-[#718c77]">
              <Activity size={14} /> Print queue
            </div>
            <h1 className="mt-2 text-[34px] font-semibold tracking-[-.065em] text-[#1f362a] sm:text-[42px]">
              Good work starts here.
            </h1>
            <p className="mt-1.5 text-sm text-[#78867e]">
              Keep requests moving and give every customer a smooth pickup.
            </p>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <label htmlFor="shop-select" className="sr-only">
              Select shop
            </label>
            <div className="relative">
              <select
                id="shop-select"
                value={selectedSlug}
                onChange={(event) => changeShop(event.target.value)}
                className="h-11 min-w-[220px] appearance-none rounded-[13px] border border-[#dfe6df] bg-white pl-3.5 pr-10 text-sm font-semibold text-[#35483b] outline-none focus:border-[#82a58a] focus:ring-4 focus:ring-[#438263]/10"
              >
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.slug}>
                    {shop.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#829087]" />
            </div>
            <button
              onClick={() => setShopModal(true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[13px] border border-[#dfe6df] bg-white px-4 text-sm font-semibold text-[#486152] transition hover:border-[#b7cbb8] hover:bg-[#fbfcfa]"
            >
              <Plus size={16} /> Add shop
            </button>
          </div>
        </div>
        {error && (
          <div
            role="alert"
            className="mt-5 flex items-center justify-between gap-3 rounded-[14px] border border-[#f0d2c7] bg-[#fff7f3] px-4 py-3 text-sm text-[#9b4b39]"
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
        <div className="mt-7 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="All active" value={counts.ALL} icon={<FileText size={17} />} tint="green" helper="Last 24 hours" />
            <StatCard label="Waiting" value={counts.WAITING} icon={<Clock3 size={17} />} tint="sand" helper="Needs a first look" />
            <StatCard label="Printing" value={counts.PRINTING} icon={<Printer size={17} />} tint="blue" helper="At the printer now" />
            <StatCard label="Ready" value={counts.DONE} icon={<CheckCircle2 size={17} />} tint="lime" helper="Ready for pickup" />
          </div>
          <aside className="flex items-center gap-4 rounded-[20px] border border-[#dfe8dc] bg-[#edf5e9] p-4 sm:p-5 xl:row-span-1">
            {selectedShop ? (
              <Image
                unoptimized
                src={`/api/qr-code?shop=${encodeURIComponent(selectedShop.slug)}`}
                alt={`Print order QR code for ${selectedShop.name}`}
                width={78}
                height={78}
                className="size-[78px] shrink-0 rounded-xl border border-[#e5ece2] bg-white p-1.5"
              />
            ) : (
              <div className="grid size-[78px] place-items-center rounded-xl bg-white text-[#438263]">
                <QrCode size={32} />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[.13em] text-[#718975]">Customer QR</div>
              <h2 className="mt-1 truncate text-sm font-semibold text-[#324c38]">Scan to send a file</h2>
              <a
                href={selectedShop ? `/${selectedShop.slug}` : "#"}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#567c5b] hover:text-[#23664b]"
              >
                Open order page <ExternalLink size={12} />
              </a>
              <button
                onClick={() => void copyShopLink()}
                className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#708474] hover:text-[#23664b]"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Link copied" : "Copy shop link"}
              </button>
            </div>
          </aside>
        </div>
        <section className="mt-7 overflow-hidden rounded-[22px] border border-[#e2e9e1] bg-white shadow-[0_5px_24px_rgba(37,72,47,.035)]">
          <div className="flex flex-col justify-between gap-4 border-b border-[#e9eee8] px-4 py-5 sm:px-6 sm:py-5 lg:flex-row lg:items-center">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-[-.035em] text-[#2b4233]">Incoming requests</h2>
                <span className="rounded-full bg-[#eff5eb] px-2 py-0.5 text-[10px] font-bold text-[#5b805f]">{jobs.length}</span>
              </div>
              <p className="mt-1 text-xs text-[#89958d]">Queue refreshes automatically every 6 seconds.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-[#f4f6f3] p-1">
                {(
                  [
                    { value: "ALL", label: "All" },
                    ...statuses.map((item) => ({ value: item.value, label: item.value === "DONE" ? "Ready" : item.label })),
                  ] as { value: Filter; label: string }[]
                ).map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setFilter(item.value)}
                    className={`whitespace-nowrap rounded-[9px] px-3 py-2 text-xs font-semibold transition ${
                      filter === item.value ? "bg-white text-[#355540] shadow-sm" : "text-[#87928a] hover:text-[#53645a]"
                    }`}
                  >
                    {item.label}
                    <span className={`ml-1.5 text-[10px] ${filter === item.value ? "text-[#76917c]" : "text-[#a0aaa2]"}`}>
                      {counts[item.value]}
                    </span>
                  </button>
                ))}
              </div>
              <label className="relative block sm:w-[205px]">
                <span className="sr-only">Search the queue</span>
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa49c]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search queue…"
                  className="h-10 w-full rounded-[11px] border border-[#e2e8e1] bg-white pl-9 pr-3 text-xs text-[#3f5546] outline-none placeholder:text-[#a0aaa3] focus:border-[#89aa8c]"
                />
              </label>
            </div>
          </div>
          {visibleJobs.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center px-6 py-12 text-center">
              <div className="grid size-14 place-items-center rounded-[18px] bg-[#f1f6ed] text-[#6d9670]">
                <Printer size={23} />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-[#3d5544]">
                {jobs.length === 0 ? "Your queue is clear" : "No matching requests"}
              </h3>
              <p className="mt-1.5 max-w-[330px] text-xs leading-5 text-[#89958d]">
                {jobs.length === 0
                  ? "New customer requests will appear here as soon as they're sent."
                  : "Try a different search or status filter."}
              </p>
              <div className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#8a9c8c]">
                <span className="size-1.5 animate-pulse rounded-full bg-[#85ad68]" /> Listening for new requests
              </div>
            </div>
          ) : (
            <>
              <div className="divide-y divide-[#edf0ec] lg:hidden">
                {visibleJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    updating={updatingId === job.id}
                    onStatusChange={(status) => void updateStatus(job, status)}
                  />
                ))}
              </div>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1020px] border-collapse text-left">
                  <thead>
                    <tr className="bg-[#fafbf9] text-[10px] font-bold uppercase tracking-[.11em] text-[#94a097]">
                      <th className="px-6 py-3.5">Queue</th>
                      <th className="px-4 py-3.5">Customer</th>
                      <th className="px-4 py-3.5">File</th>
                      <th className="px-4 py-3.5">Print details</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5">Received</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf0ec]">
                    {visibleJobs.map((job) => (
                      <tr key={job.id} className="transition hover:bg-[#fbfcfa]">
                        <td className="px-6 py-4">
                          <span className="font-mono text-[13px] font-bold text-[#35543e]">#{job.queueNumber}</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="max-w-[170px] truncate text-sm font-semibold text-[#35483b]">{job.customerName}</div>
                          <div className="mt-1 text-[10px] text-[#a0aaa3]">
                            Expires in {Math.max(1, Math.ceil((new Date(job.expiresAt).getTime() - Date.now()) / 3600000))}h
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex max-w-[220px] items-center gap-2">
                            <FileText size={15} className="shrink-0 text-[#7d9780]" />
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium text-[#506055]">{job.fileName}</div>
                              <div className="mt-0.5 text-[10px] text-[#a0aaa3]">{readableSize(job.fileSize)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-xs font-medium text-[#596b5f]">
                            {job.paperSize === "LETTER" ? "Letter" : job.paperSize} · {job.colorType === "BW" ? "B&W" : "Color"}
                          </div>
                          <div className="mt-1 text-[10px] text-[#9aa49d]">
                            {job.copies} {job.copies === 1 ? "copy" : "copies"}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="px-4 py-4 text-xs text-[#829087]">{relativeTime(job.createdAt)}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <a
                              href={`/api/jobs/${job.id}/download`}
                              className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[#e1e8e0] bg-white px-2.5 text-[11px] font-semibold text-[#5d7362] transition hover:border-[#9fbea1] hover:bg-[#f4f8f1]"
                              aria-label={`Download ${job.fileName}`}
                            >
                              <ArrowDownToLine size={13} /> File
                            </a>
                            <StatusSelect
                              job={job}
                              updating={updatingId === job.id}
                              onChange={(status) => void updateStatus(job, status)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex flex-col justify-between gap-2 border-t border-[#edf0ec] bg-[#fcfdfb] px-4 py-3 text-[10px] text-[#98a29b] sm:flex-row sm:items-center sm:px-6">
            <span>Private files are removed automatically 24 hours after submission.</span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={12} /> Staff-only downloads
            </span>
          </div>
        </section>
        <div className="mt-5 flex flex-col justify-between gap-2 text-[11px] text-[#98a29b] sm:flex-row sm:items-center">
          <span className="inline-flex items-center gap-1.5">
            <Timer size={13} /> Retention sweep removes expired jobs and files
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Bell size={13} /> Updates are live while this page is open
          </span>
        </div>
      </div>
      {shopModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#14271d]/45 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShopModal(false);
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-shop-title"
            className="w-full max-w-[440px] rounded-[24px] border border-[#e2e9e1] bg-white p-6 shadow-2xl sm:p-7"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="grid size-10 place-items-center rounded-xl bg-[#eff6e9] text-[#438263]">
                  <Settings2 size={18} />
                </span>
                <h2 id="add-shop-title" className="mt-4 text-xl font-semibold tracking-[-.04em] text-[#243a2d]">
                  Add a print shop
                </h2>
                <p className="mt-1 text-sm leading-5 text-[#849087]">
                  Give this location a name. We&apos;ll create its unique order link and QR code.
                </p>
              </div>
              <button
                onClick={() => setShopModal(false)}
                aria-label="Close dialog"
                className="grid size-8 place-items-center rounded-full text-[#8b968e] hover:bg-[#f2f5f1]"
              >
                <X size={17} />
              </button>
            </div>
            <form onSubmit={createShop} className="mt-6">
              <label htmlFor="new-shop-name" className="mb-2 block text-sm font-semibold text-[#35483b]">
                Shop name
              </label>
              <input
                id="new-shop-name"
                value={newShopName}
                onChange={(event) => setNewShopName(event.target.value)}
                required
                minLength={2}
                maxLength={140}
                placeholder="e.g. Riverside Copy & Print"
                autoFocus
                className="h-12 w-full rounded-[13px] border border-[#dfe6df] px-3.5 text-sm outline-none focus:border-[#82a58a] focus:ring-4 focus:ring-[#438263]/10"
              />
              <p className="mt-2 text-xs text-[#89958d]">
                Your customer link will be printdrop.app/
                {newShopName
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "") || "shop-name"}
              </p>
              <button
                type="submit"
                disabled={shopSaving || newShopName.trim().length < 2}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[13px] bg-[#23664b] text-sm font-semibold text-white transition hover:bg-[#194d38] disabled:opacity-60"
              >
                {shopSaving ? "Creating shop…" : <>Create shop <ArrowRight size={15} /></>}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  icon,
  tint,
  helper,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tint: "green" | "sand" | "blue" | "lime";
  helper: string;
}) {
  const palette = {
    green: "bg-[#edf5e9] text-[#527c59]",
    sand: "bg-[#f7f2e9] text-[#a17d46]",
    blue: "bg-[#edf3f9] text-[#5e7e9c]",
    lime: "bg-[#f0f6e4] text-[#70914c]",
  };
  return (
    <div className="rounded-[19px] border border-[#e3e9e2] bg-white p-4.5 shadow-[0_3px_12px_rgba(30,65,39,.025)]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#7b8980]">{label}</span>
        <span className={`grid size-8 place-items-center rounded-[11px] ${palette[tint]}`}>{icon}</span>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <span className="text-[30px] font-semibold leading-none tracking-[-.06em] text-[#263e2e]">{value}</span>
        <span className="text-[10px] text-[#a0aaa3]">{helper}</span>
      </div>
    </div>
  );
}

function StatusSelect({
  job,
  updating,
  onChange,
}: {
  job: Job;
  updating: boolean;
  onChange: (status: JobStatus) => void;
}) {
  return (
    <label className="relative inline-flex h-8 items-center rounded-[9px] border border-[#e1e8e0] bg-white pr-2 text-[11px] font-semibold text-[#617265] transition hover:border-[#b8cabb]">
      <span className="sr-only">Change status for queue number {job.queueNumber}</span>
      {updating ? <LoaderCircle size={13} className="ml-2 animate-spin" /> : null}
      <select
        value={job.status}
        disabled={updating}
        onChange={(event) => onChange(event.target.value as JobStatus)}
        className="h-full appearance-none bg-transparent py-0 pl-2.5 pr-5 outline-none"
      >
        {statuses.map((status) => (
          <option key={status.value} value={status.value}>
            {status.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-1.5 text-[#94a097]" />
    </label>
  );
}

function JobCard({
  job,
  updating,
  onStatusChange,
}: {
  job: Job;
  updating: boolean;
  onStatusChange: (status: JobStatus) => void;
}) {
  return (
    <article className="px-4 py-4 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eff5eb] font-mono text-xs font-bold text-[#4d7255]">
            #{job.queueNumber}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[#35483b]">{job.customerName}</div>
            <div className="mt-0.5 text-[10px] text-[#8d9991]">{relativeTime(job.createdAt)}</div>
          </div>
        </div>
        <StatusBadge status={job.status} />
      </div>
      <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-[#f8faf7] p-3">
        <FileText size={16} className="shrink-0 text-[#7d9780]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-[#52645a]">{job.fileName}</div>
          <div className="mt-0.5 text-[10px] text-[#98a29a]">{readableSize(job.fileSize)}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-[#718078]">
          {job.paperSize === "LETTER" ? "Letter" : job.paperSize} · {job.colorType === "BW" ? "B&W" : "Color"} · {job.copies}{" "}
          {job.copies === 1 ? "copy" : "copies"}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/jobs/${job.id}/download`}
            className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[#e1e8e0] bg-white px-2.5 text-[11px] font-semibold text-[#5d7362]"
            aria-label={`Download ${job.fileName}`}
          >
            <ArrowDownToLine size={13} /> Download
          </a>
          <label className="relative inline-flex h-8 items-center rounded-[9px] border border-[#e1e8e0] bg-white pr-2 text-[11px] font-semibold text-[#617265]">
            <span className="sr-only">Change status for queue number {job.queueNumber}</span>
            {updating && <LoaderCircle size={12} className="ml-2 animate-spin" />}
            <select
              value={job.status}
              disabled={updating}
              onChange={(event) => onStatusChange(event.target.value as JobStatus)}
              className="h-full appearance-none bg-transparent py-0 pl-2.5 pr-5 outline-none"
            >
              {statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-1.5 text-[#94a097]" />
          </label>
        </div>
      </div>
      {job.notes && (
        <p className="mt-3 border-l-2 border-[#cddbc8] pl-3 text-xs leading-5 text-[#78867e]">{job.notes}</p>
      )}
    </article>
  );
}
