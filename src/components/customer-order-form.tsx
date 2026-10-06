"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  FileUp,
  Image as ImageIcon,
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
import {
  calculatePrintPrice,
  formatPeso,
  getPaperSizeLabel,
  getPricePerPage,
  type ColorType,
  type PaperSize,
} from "@/lib/pricing";
import {
  fileExtension,
  hasValidFileSignature,
  MAX_COPIES,
  MAX_FILE_SIZE,
  MAX_PAGES,
} from "@/lib/validation";

type ShopInfo = {
  id: string;
  name: string;
  slug: string;
};

type UploadedItem = {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  size: number;
  ext: string;
  kind: "image" | "pdf" | "docx" | "other";
};

function validateClientFile(file: File): string | null {
  if (file.size <= 0) {
    return "That file is empty. Please select a file with content.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "That file exceeds the 50 MB limit. Please select a smaller file.";
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["pdf", "docx", "png", "jpg", "jpeg"].includes(extension)) {
    return "This file type isn't supported. Please upload a PDF, DOCX, JPG, or PNG.";
  }
  return null;
}

function formatFileSize(size: number): string {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getKind(fileName: string): "image" | "pdf" | "docx" | "other" {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  return "other";
}

export default function CustomerOrderForm({ shop }: { shop: ShopInfo }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const appendInputRef = useRef<HTMLInputElement>(null);

  // Files state
  const [items, setItems] = useState<UploadedItem[]>([]);
  const [detectedPdfPages, setDetectedPdfPages] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Print configuration state
  const [colorType, setColorType] = useState<ColorType>("BW");
  const [pageCount, setPageCount] = useState<number>(1);
  const [copies, setCopies] = useState<number>(1);
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [customerName, setCustomerName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // UI state
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [analyzingFile, setAnalyzingFile] = useState(false);

  // Clean up object URLs when items change
  useEffect(() => {
    return () => {
      items.forEach((item) => {
        try {
          URL.revokeObjectURL(item.previewUrl);
        } catch {
          // Ignore
        }
      });
    };
  }, [items]);

  async function processFiles(incomingFiles: File[], isAppending = false) {
    setError("");
    if (!incomingFiles || incomingFiles.length === 0) return;

    setAnalyzingFile(true);

    try {
      const validNewItems: UploadedItem[] = [];

      for (let i = 0; i < incomingFiles.length; i++) {
        const file = incomingFiles[i];
        const validationError = validateClientFile(file);
        if (validationError) {
          setError(validationError);
          setAnalyzingFile(false);
          return;
        }

        const ext = fileExtension(file.name);
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        if (!hasValidFileSignature(ext, bytes)) {
          setError(`File "${file.name}" appears corrupted or does not match its extension.`);
          setAnalyzingFile(false);
          return;
        }

        const kind = getKind(file.name);
        const objectUrl = URL.createObjectURL(file);

        // If it's a PDF, detect page count
        if (kind === "pdf") {
          const { extractPdfPageCount } = await import("@/lib/pdf");
          const pages = extractPdfPageCount(buffer);
          setDetectedPdfPages(pages);
          setPageCount(Math.max(1, pages));
        }

        validNewItems.push({
          id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
          file,
          previewUrl: objectUrl,
          name: file.name,
          size: file.size,
          ext,
          kind,
        });
      }

      if (validNewItems.length === 0) {
        setAnalyzingFile(false);
        return;
      }

      // Check if user is mixing documents and images
      if (isAppending) {
        const existingKind = items[0]?.kind;
        if (existingKind !== "image" || validNewItems.some((i) => i.kind !== "image")) {
          setError("Multiple file uploads only support images (PNG, JPG, JPEG). Documents must be submitted individually.");
          setAnalyzingFile(false);
          return;
        }

        const combined = [...items, ...validNewItems];
        setItems(combined);
        setPageCount(combined.length);
      } else {
        // Replacing
        items.forEach((item) => {
          try {
            URL.revokeObjectURL(item.previewUrl);
          } catch {
            // Ignore
          }
        });

        // If first is image and there are multiple images
        if (validNewItems.every((i) => i.kind === "image")) {
          setItems(validNewItems);
          setPageCount(validNewItems.length);
        } else {
          // If document, keep the single document
          setItems([validNewItems[0]]);
        }
      }
    } catch {
      setError("An error occurred while reading your file. Please try again.");
    } finally {
      setAnalyzingFile(false);
      if (inputRef.current) inputRef.current.value = "";
      if (appendInputRef.current) appendInputRef.current.value = "";
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (fileList && fileList.length > 0) {
      void processFiles(Array.from(fileList), false);
    }
  }

  function onAppendFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (fileList && fileList.length > 0) {
      void processFiles(Array.from(fileList), true);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const fileList = event.dataTransfer.files;
    if (fileList && fileList.length > 0) {
      void processFiles(Array.from(fileList), false);
    }
  }

  function removeItem(id: string) {
    const target = items.find((i) => i.id === id);
    if (target) {
      try {
        URL.revokeObjectURL(target.previewUrl);
      } catch {
        // Ignore
      }
    }
    const remaining = items.filter((i) => i.id !== id);
    setItems(remaining);
    if (remaining.length === 0) {
      setDetectedPdfPages(null);
      setPageCount(1);
    } else if (remaining.every((i) => i.kind === "image")) {
      setPageCount(remaining.length);
    }
  }

  function removeAllFiles() {
    items.forEach((item) => {
      try {
        URL.revokeObjectURL(item.previewUrl);
      } catch {
        // Ignore
      }
    });
    setItems([]);
    setDetectedPdfPages(null);
    setPageCount(1);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function triggerFilePicker() {
    inputRef.current?.click();
  }

  function triggerAppendPicker() {
    appendInputRef.current?.click();
  }

  // Automatic pricing calculation using centralized functions
  const pricePerPage = getPricePerPage(colorType, paperSize);
  const totalPrice = calculatePrintPrice(pageCount, copies, colorType, paperSize);
  const bwRate = getPricePerPage("BW", paperSize);
  const colorRate = getPricePerPage("COLOR", paperSize);
  const totalSheetsToPrint = pageCount * copies;
  const totalBytes = items.reduce((acc, curr) => acc + curr.size, 0);

  const isMultiImage = items.length > 1 && items.every((i) => i.kind === "image");
  const isSingleImage = items.length === 1 && items[0].kind === "image";
  const isDocument = items.length === 1 && (items[0].kind === "pdf" || items[0].kind === "docx");

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (items.length === 0) {
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

    if (items.length === 1) {
      body.set("file", items[0].file);
    } else {
      items.forEach((item) => {
        body.append("files", item.file);
      });
      body.set("file", items[0].file);
    }

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

  return (
    <main className="min-h-screen bg-[#f6f8f5] px-4 pb-16 pt-5 text-[#1f372a] sm:px-6 sm:pt-7">
      {/* Top Header */}
      <header className="mx-auto flex max-w-[1040px] items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 transition hover:opacity-85" aria-label="PrintDrop home">
          <span className="grid size-9 place-items-center rounded-[13px] bg-[#23664b] text-[#d8f5a7] shadow-sm">
            <Printer size={17} />
          </span>
          <span className="text-[19px] font-bold tracking-[-.07em] text-[#1f3528]">
            printdrop<span className="text-[#6c917a]">.</span>
          </span>
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dce5da] bg-white px-3 py-1 text-xs font-semibold text-[#32523e] shadow-xs">
          <span className="size-2 animate-pulse rounded-full bg-[#3fa364]" />
          {shop.name}
        </span>
      </header>

      {/* Main Container */}
      <div className="mx-auto mt-6 max-w-[760px] sm:mt-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between text-xs text-[#718276]">
          <Link href="/" className="transition hover:text-[#23664b]">
            ← Back to shop list
          </Link>
          <span className="rounded-md bg-[#edf5e8] px-2 py-0.5 text-[11px] font-bold text-[#35684a]">
            Accepting orders
          </span>
        </div>

        {/* Hero Section */}
        <div className="mt-6 sm:mt-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#edf5e8] px-3 py-1 text-[11px] font-bold uppercase tracking-[.12em] text-[#3b6e4d]">
            <Sparkles size={12} /> Easy self-service printing
          </div>
          <h1 className="mt-2.5 text-[32px] font-bold leading-[1.08] tracking-[-.05em] text-[#1b3225] sm:text-[40px]">
            Send documents &amp; photos.<br className="hidden sm:inline" /> Pick up at the counter.
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#697a6f] sm:text-[15px]">
            Upload your documents or multiple photos, review the preview, select your options, and track your order in real time.
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

            {/* Hidden Inputs */}
            <input
              ref={inputRef}
              id="file"
              name="file"
              type="file"
              multiple
              accept=".pdf,.docx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"
              className="sr-only"
              onChange={onFileChange}
              aria-label="Upload document or image"
            />
            <input
              ref={appendInputRef}
              id="append-file"
              type="file"
              multiple
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
              className="sr-only"
              onChange={onAppendFilesChange}
              aria-label="Add more images"
            />

            {/* Dropzone or Preview Area */}
            <div className="mt-5">
              {items.length === 0 ? (
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
                    Click to upload file(s) or drag &amp; drop
                  </p>
                  <p className="mt-1 text-xs text-[#758478]">
                    Supports PDF, DOCX, or multiple PNG/JPG photos (up to 50 MB total)
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
                        {items[0].kind === "image" ? <ImageIcon size={20} /> : <FileText size={20} />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#22392c]">
                          {items.length === 1
                            ? items[0].name
                            : `${items.length} Images Selected`}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#6e8074]">
                          <span className="font-medium">{formatFileSize(totalBytes)}</span>
                          <span>•</span>
                          <span className="rounded-md bg-[#edf4ea] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#35684a]">
                            {items.length === 1
                              ? items[0].ext.toUpperCase()
                              : `${items.length} PHOTOS`}
                          </span>
                          {detectedPdfPages !== null && (
                            <>
                              <span>•</span>
                              <span className="font-semibold text-[#256843]">
                                {detectedPdfPages} {detectedPdfPages === 1 ? "page" : "pages"} detected
                              </span>
                            </>
                          )}
                          {isMultiImage && (
                            <>
                              <span>•</span>
                              <span className="font-semibold text-[#256843]">
                                {items.length} pages total
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions: Add more images, Replace & Remove */}
                    <div className="flex flex-wrap items-center gap-2">
                      {items.every((i) => i.kind === "image") && (
                        <button
                          type="button"
                          onClick={triggerAppendPicker}
                          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#23664b] bg-[#edf5e8] px-3 text-xs font-semibold text-[#23664b] transition hover:bg-[#e1f0db]"
                          aria-label="Add more images"
                        >
                          <Plus size={13} /> Add more images
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={triggerFilePicker}
                        className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#d7e2d5] bg-white px-3 text-xs font-semibold text-[#455c4d] transition hover:border-[#23664b] hover:text-[#23664b]"
                        aria-label="Replace selected file"
                      >
                        <RefreshCw size={12} /> Replace
                      </button>
                      <button
                        type="button"
                        onClick={removeAllFiles}
                        className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#f0d4cb] bg-white px-3 text-xs font-semibold text-[#a34433] transition hover:bg-[#fff5f2] hover:text-[#bf3a23]"
                        aria-label="Remove all files"
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
                  </div>

                  {/* PREVIEW SECTION */}
                  <div className="mt-4">
                    {/* 1. Multiple Images Gallery Grid */}
                    {isMultiImage && (
                      <div>
                        <div className="mb-2.5 flex items-center justify-between text-xs font-semibold text-[#5a7062]">
                          <span>Image gallery ({items.length} files)</span>
                          <span className="text-[11px] text-[#718276]">Click image to expand</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                          {items.map((item, index) => (
                            <div
                              key={item.id}
                              className="group relative overflow-hidden rounded-xl border border-[#dfe7de] bg-white p-1.5 transition hover:shadow-md"
                            >
                              <div
                                onClick={() => setLightboxIndex(index)}
                                className="relative aspect-square w-full cursor-pointer overflow-hidden rounded-lg bg-[#f0f4ef]"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={item.previewUrl}
                                  alt={item.name}
                                  className="h-full w-full object-cover transition group-hover:scale-105"
                                />
                                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold text-white">
                                  Page {index + 1}
                                </span>
                              </div>
                              <div className="mt-1.5 flex items-center justify-between px-0.5">
                                <span className="truncate text-[11px] font-medium text-[#2d4234]" title={item.name}>
                                  {item.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeItem(item.id)}
                                  className="rounded p-0.5 text-[#9e5241] transition hover:bg-[#faeae6] hover:text-[#c4321d]"
                                  aria-label={`Remove ${item.name}`}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 2. Single Image Preview */}
                    {isSingleImage && (
                      <div className="overflow-hidden rounded-xl border border-[#e2eae0] bg-white p-3 text-center">
                        <div className="flex items-center justify-between pb-2 text-[11px] font-semibold text-[#66776a]">
                          <span className="flex items-center gap-1.5">
                            <Eye size={13} className="text-[#3a7553]" /> Preview
                          </span>
                          <button
                            type="button"
                            onClick={() => setLightboxIndex(0)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#23664b] hover:underline"
                          >
                            <Maximize2 size={12} /> Expand preview
                          </button>
                        </div>
                        <div className="relative flex max-h-[340px] min-h-[180px] w-full items-center justify-center overflow-hidden rounded-lg bg-[#f4f7f3]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={items[0].previewUrl}
                            alt={`Preview of ${items[0].name}`}
                            className="max-h-[320px] w-auto max-w-full rounded object-contain shadow-sm"
                          />
                        </div>
                      </div>
                    )}

                    {/* 3. PDF Document Preview */}
                    {items.length === 1 && items[0].kind === "pdf" && (
                      <div className="overflow-hidden rounded-xl border border-[#e2eae0] bg-white p-3">
                        <div className="flex items-center justify-between pb-2.5 text-[11px] font-semibold text-[#66776a]">
                          <span className="flex items-center gap-1.5">
                            <FileCheck size={14} className="text-[#3a7553]" /> Preview
                          </span>
                          <a
                            href={items[0].previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-[#23664b] hover:underline"
                          >
                            Open full document <ExternalLink size={12} />
                          </a>
                        </div>
                        <div className="relative h-64 w-full overflow-hidden rounded-lg border border-[#e4ebe2] bg-[#f5f8f4] sm:h-72">
                          <object
                            data={items[0].previewUrl}
                            type="application/pdf"
                            className="h-full w-full"
                          >
                            <div className="flex h-full flex-col items-center justify-center p-5 text-center text-xs text-[#6e7e72]">
                              <FileText size={36} className="text-[#3a7553]" />
                              <p className="mt-2 font-bold text-[#2e4537]">{items[0].name}</p>
                              <a
                                href={items[0].previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#23664b] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1a4f3a]"
                              >
                                View PDF in new tab <ExternalLink size={13} />
                              </a>
                            </div>
                          </object>
                        </div>
                      </div>
                    )}

                    {/* 4. DOCX Card */}
                    {items.length === 1 && items[0].kind === "docx" && (
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
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Confirmation Banner */}
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#eaf4e6] px-3 py-2 text-xs font-semibold text-[#306843]">
                      <CheckCircle2 size={16} className="shrink-0 text-[#306843]" />
                      <span>
                        {items.length === 1
                          ? "This is the file I want to print. Verified and ready."
                          : `All ${items.length} images verified and ready for printing.`}
                      </span>
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

            {/* Paper Size Selection */}
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="paperSize" className="block text-xs font-bold uppercase tracking-[.1em] text-[#4d6354]">
                  Paper Size <span className="text-[#cb4d36]">*</span>
                </label>
                <span className="text-[11px] font-semibold text-[#5a7062]">
                  {getPaperSizeLabel(paperSize)}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* Short / Letter */}
                <button
                  type="button"
                  onClick={() => setPaperSize("LETTER")}
                  className={`flex flex-col justify-between rounded-[16px] border p-3.5 text-left transition ${
                    paperSize === "LETTER"
                      ? "border-[#23664b] bg-[#f3f8f1] ring-2 ring-[#23664b]/20"
                      : "border-[#dfe6de] bg-white hover:border-[#9ab4a1] hover:bg-[#fafcfa]"
                  }`}
                  aria-pressed={paperSize === "LETTER"}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[#1f372a]">Short / Letter</span>
                      <span className="rounded-md bg-[#edf4ea] px-1.5 py-0.5 text-[10px] font-bold text-[#35684a]">8.5 × 11 in</span>
                    </div>
                    <p className="mt-1 text-xs text-[#6e8074]">Short bond paper</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-[#e2eae0] pt-2 text-[11px] font-semibold text-[#3b5c46]">
                    <span>B&amp;W: ₱3</span>
                    <span>Color: ₱6</span>
                  </div>
                </button>

                {/* A4 */}
                <button
                  type="button"
                  onClick={() => setPaperSize("A4")}
                  className={`flex flex-col justify-between rounded-[16px] border p-3.5 text-left transition ${
                    paperSize === "A4"
                      ? "border-[#23664b] bg-[#f3f8f1] ring-2 ring-[#23664b]/20"
                      : "border-[#dfe6de] bg-white hover:border-[#9ab4a1] hover:bg-[#fafcfa]"
                  }`}
                  aria-pressed={paperSize === "A4"}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[#1f372a]">A4</span>
                      <span className="rounded-md bg-[#edf4ea] px-1.5 py-0.5 text-[10px] font-bold text-[#35684a]">8.27 × 11.69 in</span>
                    </div>
                    <p className="mt-1 text-xs text-[#6e8074]">Standard size</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-[#e2eae0] pt-2 text-[11px] font-semibold text-[#3b5c46]">
                    <span>B&amp;W: ₱5</span>
                    <span>Color: ₱8</span>
                  </div>
                </button>

                {/* Long / Legal */}
                <button
                  type="button"
                  onClick={() => setPaperSize("LEGAL")}
                  className={`flex flex-col justify-between rounded-[16px] border p-3.5 text-left transition ${
                    paperSize === "LEGAL"
                      ? "border-[#23664b] bg-[#f3f8f1] ring-2 ring-[#23664b]/20"
                      : "border-[#dfe6de] bg-white hover:border-[#9ab4a1] hover:bg-[#fafcfa]"
                  }`}
                  aria-pressed={paperSize === "LEGAL"}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[#1f372a]">Long / Legal</span>
                      <span className="rounded-md bg-[#edf4ea] px-1.5 py-0.5 text-[10px] font-bold text-[#35684a]">8.5 × 13 in</span>
                    </div>
                    <p className="mt-1 text-xs text-[#6e8074]">Long bond paper</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-[#e2eae0] pt-2 text-[11px] font-semibold text-[#3b5c46]">
                    <span>B&amp;W: ₱7</span>
                    <span>Color: ₱10</span>
                  </div>
                </button>
              </div>

              <select
                id="paperSize"
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value as PaperSize)}
                className="sr-only"
                aria-label="Select paper size"
              >
                <option value="LETTER">Short / Letter (8.5 × 11 in)</option>
                <option value="A4">A4 (8.27 × 11.69 in)</option>
                <option value="LEGAL">Long / Legal (8.5 × 13 in)</option>
              </select>
            </div>

            {/* Print Type Selection */}
            <div className="mt-5">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[.1em] text-[#4d6354]">
                Print Type <span className="text-[#cb4d36]">*</span>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Black & White */}
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
                      <p className="text-sm font-bold text-[#1f372a]">Black &amp; White — ₱{bwRate}/page</p>
                      <p className="text-xs text-[#6e8074]">Standard crisp text &amp; documents</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block rounded-full bg-[#e3ece0] px-2.5 py-1 text-xs font-bold text-[#2a593c]">
                      ₱{bwRate}/page
                    </span>
                  </div>
                </button>

                {/* Color */}
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
                      <p className="text-sm font-bold text-[#1f372a]">Color — ₱{colorRate}/page</p>
                      <p className="text-xs text-[#6e8074]">Vibrant graphics &amp; photos</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block rounded-full bg-[#fcece6] px-2.5 py-1 text-xs font-bold text-[#b5462d]">
                      ₱{colorRate}/page
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
                  <span className="text-[11px] text-[#6b7c70]">
                    {items.length > 1
                      ? `${items.length} images uploaded`
                      : detectedPdfPages !== null
                        ? "Auto-detected"
                        : "Per set"}
                  </span>
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
                <p className="mt-1.5 text-[11px] text-[#718276]">Pages in one complete set</p>
              </div>

              {/* Number of Copies Stepper */}
              <div className="rounded-[16px] border border-[#e1e8df] bg-[#fafcfa] p-3.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="copies-input" className="text-xs font-bold text-[#354c3e]">
                    Number of Copies
                  </label>
                  <span className="text-[11px] text-[#6b7c70]">Sets to print</span>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setCopies((prev) => Math.max(1, prev - 1))}
                    disabled={copies <= 1}
                    className="grid size-9 place-items-center rounded-xl border border-[#d6dfd5] bg-white text-[#455c4d] shadow-sm transition hover:bg-[#f1f6ef] disabled:opacity-40"
                    aria-label="Decrease quantity"
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
                    aria-label="Increase quantity"
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-[#718276]">Total printed sets of this document</p>
              </div>
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

              {/* Exact format required */}
              <div className="mt-3.5 space-y-2 text-xs sm:text-sm">
                <div className="flex items-center justify-between text-[#4d6353]">
                  <span className="font-medium">Paper size:</span>
                  <span className="font-bold text-[#1f372a]">
                    {getPaperSizeLabel(paperSize)}
                  </span>
                </div>

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
                    {items.length === 0
                      ? "No file uploaded yet"
                      : items.length === 1
                        ? items[0].name
                        : `${items.length} images (${items.map((i) => i.name).slice(0, 2).join(", ")}${items.length > 2 ? "…" : ""})`}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#64786b]">Print Type:</span>
                  <span className="font-semibold text-[#1f372a]">
                    {colorType === "COLOR" ? `Color — ${formatPeso(pricePerPage)}/page` : `Black & White — ${formatPeso(pricePerPage)}/page`}
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

              <div>
                <label htmlFor="notes" className="mb-1.5 block text-xs font-bold uppercase tracking-[.1em] text-[#4d6354]">
                  Special Instructions (Optional)
                </label>
                <input
                  id="notes"
                  name="notes"
                  type="text"
                  maxLength={250}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Please staple top-left, double-sided, or fit to page"
                  className="h-11 w-full rounded-[14px] border border-[#d9e2d7] bg-white px-4 text-sm font-medium text-[#21382a] outline-none transition placeholder:text-[#95a498] focus:border-[#23664b] focus:ring-2 focus:ring-[#23664b]/20"
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                className="mt-5 flex items-start gap-2.5 rounded-xl border border-[#f2d3cb] bg-[#fff5f2] p-3.5 text-xs font-medium text-[#993b2a]"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#b33722]" />
                <p>{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <div className="mt-6">
              <button
                type="submit"
                disabled={submitting || items.length === 0 || analyzingFile}
                className="group relative flex h-14 w-full items-center justify-between rounded-[18px] bg-[#23664b] px-6 text-base font-bold text-white shadow-[0_10px_30px_rgba(35,102,75,.28)] transition hover:bg-[#1a4f3a] active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-2">
                  {submitting ? (
                    <>
                      <LoaderCircle size={18} className="animate-spin" />
                      Sending to shop…
                    </>
                  ) : analyzingFile ? (
                    <>
                      <LoaderCircle size={18} className="animate-spin" />
                      Analyzing files…
                    </>
                  ) : (
                    <>
                      Submit Order
                      <ArrowRight size={18} className="transition group-hover:translate-x-1" />
                    </>
                  )}
                </span>
                <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-black text-[#d8f5a7]">
                  {formatPeso(totalPrice)}
                </span>
              </button>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-[#718276]">
              <ShieldCheck size={14} className="text-[#3b7252]" />
              <span>Files are securely transferred and automatically removed after 24 hours.</span>
            </div>
          </section>
        </form>
      </div>

      {/* LIGHTBOX MODAL */}
      <AnimatePresence>
        {lightboxIndex !== null && items[lightboxIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs"
            onClick={() => setLightboxIndex(null)}
          >
            <div
              className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-black"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                <span className="rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white">
                  {lightboxIndex + 1} of {items.length}
                </span>
                <button
                  type="button"
                  onClick={() => setLightboxIndex(null)}
                  className="rounded-full bg-black/60 p-2 text-white hover:bg-black/90"
                  aria-label="Close image preview"
                >
                  <X size={18} />
                </button>
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={items[lightboxIndex].previewUrl}
                alt={items[lightboxIndex].name}
                className="max-h-[85vh] w-auto max-w-full rounded-2xl object-contain"
              />

              {items.length > 1 && (
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={() => setLightboxIndex((prev) => (prev! > 0 ? prev! - 1 : items.length - 1))}
                    className="text-xs font-semibold text-white hover:underline"
                  >
                    Previous
                  </button>
                  <span className="text-white/40">•</span>
                  <button
                    type="button"
                    onClick={() => setLightboxIndex((prev) => (prev! < items.length - 1 ? prev! + 1 : 0))}
                    className="text-xs font-semibold text-white hover:underline"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
