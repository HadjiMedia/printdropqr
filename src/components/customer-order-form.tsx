"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  FileUp,
  Image as ImageIcon,
  Info,
  LoaderCircle,
  Maximize2,
  Minus,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { MAX_FILE_SIZE, MAX_COPIES, MAX_PAGES, hasValidFileSignature } from "@/lib/validation";
import {
  BLACK_AND_WHITE,
  COLOR,
  calculatePrintPrice,
  formatPeso,
  getPricePerPage,
  type ColorType,
} from "@/lib/pricing";
import { extractPdfPageCount } from "@/lib/pdf";

type ShopInfo = { id: string; name: string; slug: string };

function validateClientFile(file: File): string | null {
  if (file.size <= 0) {
    return "This file is empty. Please choose a file with content.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "That file exceeds the 50 MB limit. Please select a smaller file.";
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["pdf", "docx", "png", "jpg", "jpeg"].includes(extension)) {
    return "This file type isn't supported. Please upload a PDF, JPG, or PNG.";
  }
  if (
    file.type &&
    ![
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/png",
      "image/jpeg",
    ].includes(file.type)
  ) {
    return "This file type isn't supported. Please upload a PDF, JPG, or PNG.";
  }
  return null;
}

function formatFileSize(size: number): string {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileTypeLabel(fileName: string, mimeType?: string): { label: string; kind: "image" | "pdf" | "docx" | "other" } {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg"].includes(extension) || mimeType?.startsWith("image/")) {
    return { label: `${extension.toUpperCase()} Image`, kind: "image" };
  }
  if (extension === "pdf" || mimeType === "application/pdf") {
    return { label: "PDF Document", kind: "pdf" };
  }
  if (extension === "docx") {
    return { label: "Word Document (.docx)", kind: "docx" };
  }
  return { label: "Document", kind: "other" };
}

export default function CustomerOrderForm({ shop }: { shop: ShopInfo }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Print configuration state
  const [colorType, setColorType] = useState<ColorType>("BW");
  const [pageCount, setPageCount] = useState<number>(1);
  const [detectedPdfPages, setDetectedPdfPages] = useState<number | null>(null);
  const [copies, setCopies] = useState<number>(1);
  const [paperSize, setPaperSize] = useState<"A4" | "LETTER" | "LEGAL">("A4");
  const [customerName, setCustomerName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // UI state
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [analyzingFile, setAnalyzingFile] = useState(false);

  // Clean up object URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleFileSelection(nextFile?: File) {
    setError("");
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setImageDimensions(null);
    setImageLoadError(false);
    setDetectedPdfPages(null);

    if (!nextFile) return;

    const validationError = validateClientFile(nextFile);
    if (validationError) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setError(validationError);
      return;
    }

    const ext = nextFile.name.split(".").pop()?.toLowerCase() ?? "";

    // Signature and corruption check
    try {
      setAnalyzingFile(true);
      const buffer = await nextFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      if (!hasValidFileSignature(ext, bytes)) {
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        setError("This file appears to be corrupted or does not match its file extension. Please choose a valid document or image.");
        setAnalyzingFile(false);
        return;
      }

      setFile(nextFile);
      const objectUrl = URL.createObjectURL(nextFile);
      setPreviewUrl(objectUrl);

      if (ext === "pdf") {
        const pages = extractPdfPageCount(buffer);
        setDetectedPdfPages(pages);
        setPageCount(Math.max(1, pages));
      } else {
        setPageCount(1);
      }
    } catch {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setError("This file could not be read or may be corrupted. Please choose a different file.");
    } finally {
      setAnalyzingFile(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFileSelection(event.target.files?.[0]);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handleFileSelection(event.dataTransfer.files?.[0]);
  }

  function removeFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setImageDimensions(null);
    setImageLoadError(false);
    setDetectedPdfPages(null);
    setPageCount(1);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function triggerFilePicker() {
    inputRef.current?.click();
  }

  // Automatic pricing calculation using centralized functions
  const pricePerPage = getPricePerPage(colorType);
  const totalPrice = calculatePrintPrice(pageCount, copies, colorType);
  const totalSheetsToPrint = pageCount * copies;

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!file) {
      setError("Please select or drop a file to print before submitting.");
      return;
    }

    if (!customerName.trim()) {
      setError("Please provide your name or a queue identifier.");
      return;
    }

    setSubmitting(true);
    const body = new FormData();
    body.set("shopSlug", shop.slug);
    body.set("file", file);
    body.set("customerName", customerName.trim());
    body.set("pageCount", String(pageCount));
    body.set("copies", String(copies));
    body.set("paperSize", paperSize);
    body.set("colorType", colorType);
    body.set("notes", notes.trim());

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120_000);

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        body,
        signal: controller.signal,
      });

      const result = (await response.json()) as { jobId?: string; error?: string };
      if (!response.ok || !result.jobId) {
        setError(result.error || "Your print request could not be sent. Please check your details and try again.");
        setSubmitting(false);
        return;
      }

      router.push(`/${shop.slug}/status/${result.jobId}`);
    } catch (cause) {
      setError(
        cause instanceof DOMException && cause.name === "AbortError"
          ? "Upload timed out. Check your connection and try sending the file again."
          : "We couldn't reach the print shop. Check your connection and try again.",
      );
      setSubmitting(false);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  const fileInfo = file ? getFileTypeLabel(file.name, file.type) : null;

  return (
    <main className="min-h-screen bg-[#f6f8f5] px-4 pb-16 pt-5 text-[#1f372a] sm:px-6 sm:pt-7">
      {/* Top Header */}
      <header className="mx-auto flex max-w-[1040px] items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 transition hover:opacity-85" aria-label="PrintDrop home">
          <span className="grid size-9 place-items-center rounded-[12px] bg-[#23664b] text-[#d8f5a7] shadow-sm">
            <Printer size={17} strokeWidth={2.4} />
          </span>
          <span className="text-[19px] font-bold tracking-[-.07em] text-[#1e3427]">
            printdrop<span className="text-[#6c8f7a]">.</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 rounded-full border border-[#dfe6dc] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#546b5d] shadow-sm">
          <span className="size-2 rounded-full bg-[#52a468]" />
          <span>Self-service print counter</span>
        </div>
      </header>

      {/* Main Container */}
      <div className="mx-auto mt-6 max-w-[700px] sm:mt-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#66776c] transition hover:text-[#23664b]"
        >
          <ArrowLeft size={14} /> Back to PrintDrop home
        </Link>

        {/* Shop Destination Banner */}
        <div className="mt-3.5 flex items-center justify-between gap-3 rounded-2xl border border-[#e1e9df] bg-white px-4 py-3 shadow-[0_3px_12px_rgba(35,70,45,.03)] sm:px-5 sm:py-3.5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5e8] text-[#346b4f]">
              <Printer size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#7a8a7f]">Printing at</p>
              <h2 className="truncate text-sm font-bold text-[#233a2c] sm:text-[15px]">{shop.name}</h2>
            </div>
          </div>
          <span className="rounded-full bg-[#f0f6ec] px-2.5 py-1 text-[11px] font-semibold text-[#447653]">
            Accepting orders
          </span>
        </div>

        {/* Hero Section */}
        <div className="mt-6 sm:mt-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#edf5e8] px-3 py-1 text-[11px] font-bold uppercase tracking-[.12em] text-[#3b6e4d]">
            <Sparkles size={12} /> Easy self-service printing
          </div>
          <h1 className="mt-2.5 text-[32px] font-bold leading-[1.08] tracking-[-.05em] text-[#1b3225] sm:text-[40px]">
            Send documents.<br className="hidden sm:inline" /> Pick up at the counter.
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#697a6f] sm:text-[15px]">
            Upload your file, review its preview, choose Black &amp; White (₱5) or Color (₱8), and receive your live queue number.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={submitOrder} className="mt-6 space-y-6" noValidate>
          {/* STEP 1: UPLOAD DOCUMENT & PREVIEW */}
          <section className="rounded-[24px] border border-[#e2e9e0] bg-white p-5 shadow-[0_8px_30px_rgba(28,55,36,.04)] sm:p-7">
            <div className="flex items-center justify-between border-b border-[#edf2ec] pb-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-6 place-items-center rounded-full bg-[#23664b] text-[11px] font-bold text-white">
                  1
                </span>
                <h3 className="text-base font-bold text-[#22392c]">Upload Document &amp; Preview</h3>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-[#7e8f83]">
                Step 1 of 4
              </span>
            </div>

            {/* Hidden Input */}
            <input
              ref={inputRef}
              id="file"
              name="file"
              type="file"
              accept=".pdf,.docx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"
              className="sr-only"
              onChange={onFileChange}
              aria-label="Upload document or image"
            />

            {/* Dropzone or Preview Area */}
            <div className="mt-5">
              {!file ? (
                <div
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
                  }}
                  onDrop={onDrop}
                  onClick={triggerFilePicker}
                  className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-[20px] border-2 border-dashed p-7 text-center transition sm:p-9 ${
                    dragging
                      ? "border-[#2d7a57] bg-[#edf6eb]"
                      : "border-[#d4ded4] bg-[#fbfdfa] hover:border-[#4d8666] hover:bg-[#f6faf4]"
                  }`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      triggerFilePicker();
                    }
                  }}
                  aria-label="Upload Document. Click or drag file here"
                >
                  <span className="grid size-12 place-items-center rounded-2xl bg-[#edf5e8] text-[#346b4f] transition group-hover:scale-105 group-hover:bg-[#23664b] group-hover:text-white">
                    <FileUp size={22} />
                  </span>
                  <p className="mt-3 text-sm font-bold text-[#283e31]">
                    Click to upload document or drag &amp; drop
                  </p>
                  <p className="mt-1 text-xs text-[#758478]">
                    Supported formats: PDF, PNG, JPG, or DOCX (up to 50 MB)
                  </p>
                  <span className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-[#f0f4ee] px-3.5 py-1 text-[11px] font-semibold text-[#486352] transition group-hover:bg-[#e4efe0]">
                    Browse from computer or phone
                  </span>
                </div>
              ) : (
                <div className="rounded-[20px] border border-[#dce6db] bg-[#fafcfa] p-4 sm:p-5">
                  {/* Top File Metadata Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e9efe8] pb-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#23664b] text-[#d8f5a7] shadow-sm">
                        {fileInfo?.kind === "image" ? (
                          <ImageIcon size={20} />
                        ) : (
                          <FileText size={20} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#22392c]" title={file.name}>
                          {file.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#6e8074]">
                          <span className="font-medium">{formatFileSize(file.size)}</span>
                          <span>•</span>
                          <span className="rounded-md bg-[#edf4ea] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#35684a]">
                            {fileInfo?.label}
                          </span>
                          {detectedPdfPages !== null && (
                            <>
                              <span>•</span>
                              <span className="font-semibold text-[#256843]">
                                {detectedPdfPages} {detectedPdfPages === 1 ? "page" : "pages"} detected
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions: Replace & Remove */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={triggerFilePicker}
                        className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#d7e2d5] bg-white px-3 text-xs font-semibold text-[#455c4d] transition hover:border-[#23664b] hover:text-[#23664b]"
                        aria-label="Replace selected file"
                      >
                        <RefreshCw size={12} /> Replace file
                      </button>
                      <button
                        type="button"
                        onClick={removeFile}
                        className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#f0d4cb] bg-white px-3 text-xs font-semibold text-[#a34433] transition hover:bg-[#fff5f2] hover:text-[#bf3a23]"
                        aria-label="Remove selected file"
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
                  </div>

                  {/* PREVIEW SECTION */}
                  <div className="mt-4">
                    {/* 1. Image Preview */}
                    {fileInfo?.kind === "image" && previewUrl && (
                      <div className="overflow-hidden rounded-xl border border-[#e2eae0] bg-white p-3 text-center">
                        <div className="flex items-center justify-between pb-2 text-[11px] font-semibold text-[#66776a]">
                          <span className="flex items-center gap-1.5">
                            <Eye size={13} className="text-[#3a7553]" /> Preview
                          </span>
                          <button
                            type="button"
                            onClick={() => setLightboxOpen(true)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#23664b] hover:underline"
                          >
                            <Maximize2 size={12} /> Expand preview
                          </button>
                        </div>
                        <div className="relative flex max-h-[340px] min-h-[180px] w-full items-center justify-center overflow-hidden rounded-lg bg-[#f4f7f3]">
                          {!imageLoadError ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={previewUrl}
                              alt={`Preview of ${file.name}`}
                              onError={() => setImageLoadError(true)}
                              onLoad={(e) => {
                                const img = e.currentTarget;
                                setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                              }}
                              className="max-h-[320px] w-auto max-w-full rounded object-contain shadow-sm"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-[#8c4b3a]">
                              <AlertCircle size={24} className="text-[#a8442e]" />
                              <p className="mt-2 font-semibold">Unable to display image preview</p>
                              <p className="mt-1 text-[11px] text-[#718275]">
                                The image may be corrupted or using an unrenderable format.
                              </p>
                            </div>
                          )}
                        </div>
                        {imageDimensions && (
                          <p className="mt-2 text-[11px] text-[#78887c]">
                            Dimensions: {imageDimensions.width} × {imageDimensions.height} px · Ready for printing
                          </p>
                        )}
                      </div>
                    )}

                    {/* 2. PDF Document Preview */}
                    {fileInfo?.kind === "pdf" && previewUrl && (
                      <div className="overflow-hidden rounded-xl border border-[#e2eae0] bg-white p-3">
                        <div className="flex items-center justify-between pb-2.5 text-[11px] font-semibold text-[#66776a]">
                          <span className="flex items-center gap-1.5">
                            <FileCheck size={14} className="text-[#3a7553]" /> Preview
                          </span>
                          <a
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-[#23664b] hover:underline"
                          >
                            Open full document <ExternalLink size={12} />
                          </a>
                        </div>
                        <div className="relative h-64 w-full overflow-hidden rounded-lg border border-[#e4ebe2] bg-[#f5f8f4] sm:h-72">
                          <object
                            data={previewUrl}
                            type="application/pdf"
                            className="h-full w-full"
                          >
                            <div className="flex h-full flex-col items-center justify-center p-5 text-center text-xs text-[#6e7e72]">
                              <FileText size={36} className="text-[#3a7553]" />
                              <p className="mt-2 font-bold text-[#2e4537]">{file.name}</p>
                              <p className="mt-1 text-[#78887c]">
                                Embedded browser PDF viewer is not active on this device.
                              </p>
                              <a
                                href={previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#23664b] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1a4f3a]"
                              >
                                View PDF in new tab <ExternalLink size={13} />
                              </a>
                            </div>
                          </object>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#6b7c70]">
                          <span>
                            {analyzingFile
                              ? "Analyzing pages…"
                              : `${detectedPdfPages ?? pageCount} ${(detectedPdfPages ?? pageCount) === 1 ? "page" : "pages"} detected`}
                          </span>
                          <span className="text-[#2b6845]">Scroll inside box to review pages</span>
                        </div>
                      </div>
                    )}

                    {/* 3. DOCX Non-previewable Card */}
                    {fileInfo?.kind === "docx" && (
                      <div className="rounded-xl border border-[#d8e4f5] bg-[#f4f8fe] p-4 text-left">
                        <div className="flex items-start gap-3">
                          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#2b579a] text-white">
                            <FileText size={20} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-[#1f3f73]">Word Document (.docx)</p>
                            <p className="mt-1 text-xs leading-5 text-[#3b5883]">
                              In-browser page rendering is not available for Word files. Your document has been verified and will be printed cleanly by the shop.
                            </p>
                            <p className="mt-2 text-xs font-semibold text-[#1f3f73]">
                              👉 Please confirm the number of pages in Step 2 below to ensure accurate pricing.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 4. Confirmation Banner */}
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#eaf4e6] px-3 py-2 text-xs font-semibold text-[#306843]">
                      <CheckCircle2 size={16} className="shrink-0 text-[#306843]" />
                      <span>This is the file I want to print. Verified and ready.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* STEP 2: PRINT TYPE & QUANTITY */}
          <section className="rounded-[24px] border border-[#e2e9e0] bg-white p-5 shadow-[0_8px_30px_rgba(28,55,36,.04)] sm:p-7">
            <div className="flex items-center justify-between border-b border-[#edf2ec] pb-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-6 place-items-center rounded-full bg-[#23664b] text-[11px] font-bold text-white">
                  2
                </span>
                <h3 className="text-base font-bold text-[#22392c]">Print Type &amp; Quantity</h3>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-[#7e8f83]">
                Step 2 of 4
              </span>
            </div>

            {/* Print Type Selection */}
            <div className="mt-5">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[.1em] text-[#4d6354]">
                Print Type <span className="text-[#cb4d36]">*</span>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Black & White — ₱5/page */}
                <button
                  type="button"
                  onClick={() => setColorType("BW")}
                  className={`flex items-center justify-between rounded-[16px] border p-4 text-left transition ${
                    colorType === "BW"
                      ? "border-[#23664b] bg-[#f3f8f1] ring-2 ring-[#23664b]/20"
                      : "border-[#dfe6de] bg-white hover:border-[#9ab4a1] hover:bg-[#fafcfa]"
                  }`}
                  aria-pressed={colorType === "BW"}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-[#263b2f] text-xs font-bold text-white shadow-sm">
                      B/W
                    </span>
                    <div>
                      <p className="text-sm font-bold text-[#1f372a]">Black &amp; White — ₱{BLACK_AND_WHITE}/page</p>
                      <p className="text-xs text-[#6e8074]">Standard crisp text &amp; documents</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block rounded-full bg-[#e3ece0] px-2.5 py-1 text-xs font-bold text-[#2a593c]">
                      ₱{BLACK_AND_WHITE}/page
                    </span>
                  </div>
                </button>

                {/* Color — ₱8/page */}
                <button
                  type="button"
                  onClick={() => setColorType("COLOR")}
                  className={`flex items-center justify-between rounded-[16px] border p-4 text-left transition ${
                    colorType === "COLOR"
                      ? "border-[#23664b] bg-[#f3f8f1] ring-2 ring-[#23664b]/20"
                      : "border-[#dfe6de] bg-white hover:border-[#9ab4a1] hover:bg-[#fafcfa]"
                  }`}
                  aria-pressed={colorType === "COLOR"}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-tr from-[#e5533c] via-[#edaa2f] to-[#3ca7c4] text-white shadow-sm">
                      <Sparkles size={17} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-[#1f372a]">Color — ₱{COLOR}/page</p>
                      <p className="text-xs text-[#6e8074]">Vibrant graphics &amp; photos</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block rounded-full bg-[#fcece6] px-2.5 py-1 text-xs font-bold text-[#b5462d]">
                      ₱{COLOR}/page
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* Steppers: Number of Pages & Number of Copies */}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Document Pages Stepper */}
              <div className="rounded-[16px] border border-[#e1e8df] bg-[#fafcfa] p-3.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="pages-input" className="text-xs font-bold text-[#354c3e]">
                    Number of Pages
                  </label>
                  {detectedPdfPages && (
                    <span className="text-[10px] font-semibold text-[#3b7a54]">
                      Detected: {detectedPdfPages} {detectedPdfPages === 1 ? "page" : "pages"}
                    </span>
                  )}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setPageCount((prev) => Math.max(1, prev - 1))}
                    disabled={pageCount <= 1}
                    className="grid size-9 place-items-center rounded-xl border border-[#d6dfd5] bg-white text-[#455c4d] shadow-sm transition hover:bg-[#f1f6ef] disabled:opacity-40"
                    aria-label="Decrease page count"
                  >
                    <Minus size={15} />
                  </button>
                  <input
                    id="pages-input"
                    type="number"
                    min={1}
                    max={MAX_PAGES}
                    value={pageCount}
                    onChange={(e) => setPageCount(Math.max(1, Math.min(MAX_PAGES, parseInt(e.target.value, 10) || 1)))}
                    className="h-10 w-20 rounded-xl border border-[#d6dfd5] bg-white text-center text-base font-bold text-[#233a2b] shadow-inner outline-none focus:border-[#23664b] focus:ring-2 focus:ring-[#23664b]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setPageCount((prev) => Math.min(MAX_PAGES, prev + 1))}
                    className="grid size-9 place-items-center rounded-xl border border-[#d6dfd5] bg-white text-[#455c4d] shadow-sm transition hover:bg-[#f1f6ef]"
                    aria-label="Increase page count"
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-[#718276]">Pages in document to print</p>
              </div>

              {/* Number of Copies Stepper */}
              <div className="rounded-[16px] border border-[#e1e8df] bg-[#fafcfa] p-3.5">
                <label htmlFor="copies-input" className="block text-xs font-bold text-[#354c3e]">
                  Number of Copies
                </label>
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setCopies((prev) => Math.max(1, prev - 1))}
                    disabled={copies <= 1}
                    className="grid size-9 place-items-center rounded-xl border border-[#d6dfd5] bg-white text-[#455c4d] shadow-sm transition hover:bg-[#f1f6ef] disabled:opacity-40"
                    aria-label="Decrease copy count"
                  >
                    <Minus size={15} />
                  </button>
                  <input
                    id="copies-input"
                    type="number"
                    min={1}
                    max={MAX_COPIES}
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, Math.min(MAX_COPIES, parseInt(e.target.value, 10) || 1)))}
                    className="h-10 w-20 rounded-xl border border-[#d6dfd5] bg-white text-center text-base font-bold text-[#233a2b] shadow-inner outline-none focus:border-[#23664b] focus:ring-2 focus:ring-[#23664b]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setCopies((prev) => Math.min(MAX_COPIES, prev + 1))}
                    className="grid size-9 place-items-center rounded-xl border border-[#d6dfd5] bg-white text-[#455c4d] shadow-sm transition hover:bg-[#f1f6ef]"
                    aria-label="Increase copy count"
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-[#718276]">Total printed sets of this document</p>
              </div>
            </div>

            {/* Paper Size */}
            <div className="mt-4">
              <label htmlFor="paperSize" className="mb-1.5 block text-xs font-bold uppercase tracking-[.1em] text-[#4d6354]">
                Paper Size
              </label>
              <select
                id="paperSize"
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value as "A4" | "LETTER" | "LEGAL")}
                className="h-11 w-full rounded-[14px] border border-[#d9e2d7] bg-white px-3.5 text-sm font-semibold text-[#253d2d] outline-none transition focus:border-[#23664b] focus:ring-2 focus:ring-[#23664b]/20"
              >
                <option value="A4">A4 (210 × 297 mm) — Standard</option>
                <option value="LETTER">Letter (8.5 × 11 in) — Short</option>
                <option value="LEGAL">Legal (8.5 × 14 in) — Long</option>
              </select>
            </div>
          </section>

          {/* STEP 3: AUTOMATIC PRINTING PRICE CALCULATION */}
          <section className="rounded-[24px] border border-[#e2e9e0] bg-white p-5 shadow-[0_8px_30px_rgba(28,55,36,.04)] sm:p-7">
            <div className="flex items-center justify-between border-b border-[#edf2ec] pb-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-6 place-items-center rounded-full bg-[#23664b] text-[11px] font-bold text-white">
                  3
                </span>
                <h3 className="text-base font-bold text-[#22392c]">Printing Price Calculation</h3>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-[#7e8f83]">
                Step 3 of 4
              </span>
            </div>

            <div className="mt-5 overflow-hidden rounded-[18px] border-2 border-[#cfe3cc] bg-gradient-to-br from-[#f2f8ef] to-[#e7f3e4] p-4.5 sm:p-5">
              <div className="flex items-center justify-between border-b border-[#cfe0cb] pb-3">
                <span className="text-xs font-bold uppercase tracking-[.12em] text-[#366848]">
                  Price Calculation
                </span>
                <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-[#2e593e] shadow-xs">
                  Updates automatically
                </span>
              </div>

              {/* Exact format required: Print type, Pages, Price per page, Total */}
              <div className="mt-3.5 space-y-2 text-xs sm:text-sm">
                <div className="flex items-center justify-between text-[#4d6353]">
                  <span className="font-medium">Print type:</span>
                  <span className="font-bold text-[#1f372a]">
                    {colorType === "COLOR" ? "Colored" : "Black & White"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[#4d6353]">
                  <span className="font-medium">Pages:</span>
                  <span className="font-bold text-[#1f372a]">{pageCount}</span>
                </div>

                <div className="flex items-center justify-between text-[#4d6353]">
                  <span className="font-medium">Price per page:</span>
                  <span className="font-bold text-[#1f372a]">{formatPeso(pricePerPage)}</span>
                </div>

                {copies > 1 && (
                  <div className="flex items-center justify-between text-[#4d6353]">
                    <span className="font-medium">Number of Copies:</span>
                    <span className="font-bold text-[#1f372a]">{copies}</span>
                  </div>
                )}

                {copies > 1 && (
                  <div className="flex items-center justify-between text-[#4d6353]">
                    <span className="font-medium">Calculation:</span>
                    <span className="font-mono text-xs text-[#355240]">
                      {pageCount} pages × {copies} copies × {formatPeso(pricePerPage)}
                    </span>
                  </div>
                )}
              </div>

              {/* Total Banner */}
              <div className="mt-4 flex items-center justify-between border-t border-[#cfe0cb] pt-3.5">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[.1em] text-[#556e5c]">
                    {copies > 1 ? "Estimated Total" : "Total"}
                  </span>
                  <p className="text-[11px] text-[#6d8072]">Pay at the counter upon pickup</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black tracking-tight text-[#17462f] sm:text-3xl">
                    {formatPeso(totalPrice)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* STEP 4: REVIEW ORDER & SUBMIT */}
          <section className="rounded-[24px] border border-[#e2e9e0] bg-white p-5 shadow-[0_8px_30px_rgba(28,55,36,.04)] sm:p-7">
            <div className="flex items-center justify-between border-b border-[#edf2ec] pb-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-6 place-items-center rounded-full bg-[#23664b] text-[11px] font-bold text-white">
                  4
                </span>
                <h3 className="text-base font-bold text-[#22392c]">Review Order &amp; Submit</h3>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-[#7e8f83]">
                Step 4 of 4
              </span>
            </div>

            {/* REVIEW ORDER SUMMARY CARD */}
            <div className="mt-5 rounded-2xl border border-[#e2eae0] bg-[#fbfdfa] p-4.5 sm:p-5">
              <div className="flex items-center justify-between border-b border-[#edf2eb] pb-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.1em] text-[#3d5e49]">
                  <Receipt size={15} /> Review Order
                </div>
                <span className="text-xs font-medium text-[#7a8c80]">Please verify details below</span>
              </div>

              <div className="mt-3.5 space-y-2.5 text-xs sm:text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[#64786b]">Document:</span>
                  <span className="max-w-[240px] truncate font-semibold text-[#1f372a] sm:max-w-[320px]">
                    {file ? file.name : "No file uploaded yet"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#64786b]">Print Type:</span>
                  <span className="font-semibold text-[#1f372a]">
                    {colorType === "COLOR" ? "Color — ₱8/page" : "Black & White — ₱5/page"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#64786b]">Quantity:</span>
                  <span className="font-semibold text-[#1f372a]">
                    {pageCount} {pageCount === 1 ? "page" : "pages"} × {copies} {copies === 1 ? "copy" : "copies"} ({totalSheetsToPrint} total printed)
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#64786b]">Paper Size:</span>
                  <span className="font-semibold text-[#1f372a]">
                    {paperSize === "LETTER" ? "Letter (Short)" : paperSize === "LEGAL" ? "Legal (Long)" : "A4 (Standard)"}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-[#edf2eb] pt-2.5">
                  <span className="font-bold text-[#234230]">Estimated Total:</span>
                  <span className="text-lg font-black text-[#1b4b32] sm:text-xl">
                    {formatPeso(totalPrice)}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Inputs */}
            <div className="mt-5 space-y-4">
              {/* Customer Name */}
              <div>
                <label htmlFor="customerName" className="mb-1.5 block text-xs font-bold uppercase tracking-[.1em] text-[#4d6354]">
                  Your Name or Queue Identifier <span className="text-[#cb4d36]">*</span>
                </label>
                <input
                  id="customerName"
                  name="customerName"
                  type="text"
                  autoComplete="name"
                  maxLength={80}
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Maria Santos or Blue backpack"
                  className="h-12 w-full rounded-[14px] border border-[#d9e2d7] bg-white px-4 text-sm font-medium text-[#21382a] outline-none transition placeholder:text-[#95a498] focus:border-[#23664b] focus:ring-2 focus:ring-[#23664b]/20"
                />
                <p className="mt-1 text-[11px] text-[#78887c]">
                  This is called at the counter when your pages are ready.
                </p>
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="notes" className="mb-1.5 block text-xs font-bold uppercase tracking-[.1em] text-[#4d6354]">
                  Special Instructions <span className="font-normal text-[#8c9c90]">(Optional)</span>
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Staple top-left, print back-to-back if possible..."
                  className="w-full resize-y rounded-[14px] border border-[#d9e2d7] bg-white px-4 py-3 text-sm font-medium text-[#21382a] outline-none transition placeholder:text-[#95a498] focus:border-[#23664b] focus:ring-2 focus:ring-[#23664b]/20"
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                className="mt-5 flex items-center gap-2.5 rounded-[14px] border border-[#f0cdc1] bg-[#fff6f2] p-3.5 text-xs font-medium text-[#a2432e]"
              >
                <AlertCircle size={16} className="shrink-0 text-[#b53a23]" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <div className="mt-6">
              <button
                type="submit"
                disabled={submitting}
                className="flex h-[56px] w-full items-center justify-between rounded-[16px] bg-[#23664b] px-6 text-sm font-bold text-white shadow-[0_10px_25px_rgba(35,102,75,.22)] transition hover:bg-[#1a4f3a] hover:shadow-[0_12px_28px_rgba(35,102,75,.28)] disabled:cursor-wait disabled:opacity-65"
              >
                {submitting ? (
                  <span className="flex w-full items-center justify-center gap-2">
                    <LoaderCircle size={18} className="animate-spin" />
                    <span>Submitting order…</span>
                  </span>
                ) : (
                  <>
                    <span className="flex items-center gap-2">
                      <Printer size={18} />
                      <span>Submit Order</span>
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-sm font-black text-white">
                      <span>{formatPeso(totalPrice)}</span>
                      <ArrowRight size={15} />
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* Privacy Guarantee */}
            <div className="mt-4 flex items-center justify-center gap-2 text-center text-[11px] text-[#718274]">
              <ShieldCheck size={14} className="text-[#3b7a54]" />
              <span>Private upload · Automatically removed from servers after 24 hours</span>
            </div>
          </section>
        </form>

        {/* Footer */}
        <footer className="mt-12 text-center text-xs text-[#8e9f93]">
          PrintDrop Counter Dispatch · Simple, fast, account-free printing.
        </footer>
      </div>

      {/* Lightbox Modal for Image Preview */}
      <AnimatePresence>
        {lightboxOpen && previewUrl && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Full size image preview"
            onClick={() => setLightboxOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-[#1b2b22] p-2 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-white">
                <span className="truncate text-xs font-semibold">{file?.name}</span>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  className="grid size-7 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                  aria-label="Close image preview"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt={file?.name ?? "Full preview"}
                  className="max-h-[80vh] max-w-[85vw] rounded-lg object-contain"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
