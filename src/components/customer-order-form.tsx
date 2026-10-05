"use client";

import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, FileText, FileUp, LoaderCircle, Printer, ShieldCheck, Trash2 } from "lucide-react";
import { MAX_FILE_SIZE, MAX_COPIES } from "@/lib/validation";

type ShopInfo = { id: string; name: string; slug: string };

function validateClientFile(file: File): string | null {
  if (!file.size) return "This file is empty. Please choose another file.";
  if (file.size > MAX_FILE_SIZE) return "That file is over 50 MB. Choose a smaller file to continue.";
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["pdf", "docx", "png", "jpg", "jpeg"].includes(extension)) {
    return "Please choose a PDF, DOCX, PNG, or JPG file.";
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
    return "This file type isn't supported. Choose a PDF, DOCX, PNG, or JPG.";
  }
  return null;
}

function formatFileSize(size: number): string {
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CustomerOrderForm({ shop }: { shop: ShopInfo }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function chooseFile(nextFile?: File) {
    setError("");
    if (!nextFile) return;
    const validationError = validateClientFile(nextFile);
    if (validationError) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setError(validationError);
      return;
    }
    setFile(nextFile);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0]);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!file) {
      setError("Add a file before sending your print request.");
      return;
    }
    setSubmitting(true);
    const body = new FormData(event.currentTarget);
    body.set("shopSlug", shop.slug);
    body.set("file", file);
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
        setError(result.error || "Your request couldn't be sent. Please try again.");
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
    <main className="min-h-screen bg-[#f7f8f5] px-4 pb-12 pt-5 sm:px-6 sm:pt-7">
      <header className="mx-auto flex max-w-[1020px] items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5" aria-label="PrintDrop home">
          <span className="grid size-9 place-items-center rounded-[13px] bg-[#23664b] text-[#d8f5a7]">
            <Printer size={17} strokeWidth={2.4} />
          </span>
          <span className="text-[18px] font-bold tracking-[-.07em] text-[#20352a]">
            printdrop<span className="text-[#71917f]">.</span>
          </span>
        </Link>
        <div className="hidden items-center gap-2 rounded-full border border-[#e2e9e1] bg-white px-3.5 py-2 text-xs font-semibold text-[#5b6e62] sm:flex">
          <span className="size-1.5 rounded-full bg-[#74a963]" /> No account needed
        </div>
      </header>
      <section className="mx-auto mt-8 max-w-[570px] sm:mt-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#75847a] transition hover:text-[#23664b]"
        >
          <ArrowLeft size={15} /> Back to PrintDrop
        </Link>
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#e3eadf] bg-white px-4 py-3.5 shadow-[0_4px_18px_rgba(43,73,53,.035)]">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eff6e9] text-[#438263]">
            <Printer size={19} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#84938a]">You&apos;re sending to</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-[#294333]">{shop.name}</p>
          </div>
          <span className="ml-auto mt-2 size-2 shrink-0 rounded-full bg-[#70a95c]" aria-label="Shop is available" />
        </div>
        <div className="mt-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#edf5e8] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.13em] text-[#4e8057]">
            <FileUp size={13} /> Print request
          </div>
          <h1 className="mt-4 text-[42px] font-semibold leading-[1.02] tracking-[-.075em] text-[#1e3529] sm:text-[52px]">
            Let&apos;s get your<br className="hidden sm:block" /> pages printed.
          </h1>
          <p className="mt-3 max-w-[440px] text-[15px] leading-6 text-[#718078]">
            Add a file and a few details. We&apos;ll give you a queue number so you can follow along.
          </p>
        </div>
        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          onSubmit={submitOrder}
          className="mt-7 rounded-[26px] border border-[#e4eae3] bg-white p-5 shadow-[0_14px_45px_rgba(33,66,45,.055)] sm:p-7"
          noValidate
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#294333]">Your print details</h2>
              <p className="mt-1 text-xs text-[#87938c]">Fields marked required help us get it right.</p>
            </div>
            <span className="rounded-full bg-[#f4f7f2] px-2.5 py-1 text-[10px] font-bold text-[#7d8c82]">ABOUT 1 MIN</span>
          </div>
          <div className="mt-6">
            <label htmlFor="file" className="mb-2 block text-sm font-semibold text-[#35483b]">
              File to print <span className="text-[#d76d4e]">*</span>
            </label>
            <div
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
              }}
              onDrop={onDrop}
              className={`rounded-[19px] border border-dashed transition ${
                dragging
                  ? "border-[#438263] bg-[#f0f7eb]"
                  : file
                    ? "border-[#b6d3b8] bg-[#f7faf5]"
                    : "border-[#d7e1d7] bg-[#fbfcfa] hover:border-[#94b59b] hover:bg-[#f8fbf6]"
              }`}
            >
              <input
                ref={inputRef}
                id="file"
                name="file"
                type="file"
                accept=".pdf,.docx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"
                className="sr-only"
                onChange={onFileChange}
                aria-describedby="file-help file-error"
              />
              {file ? (
                <div className="flex items-center gap-3 px-4 py-4">
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-[#438263] shadow-sm">
                    <FileText size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[#33483a]">{file.name}</div>
                    <div className="mt-1 text-xs text-[#849188]">{formatFileSize(file.size)} · Ready to upload</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      if (inputRef.current) inputRef.current.value = "";
                    }}
                    className="grid size-9 shrink-0 place-items-center rounded-full text-[#8b9690] transition hover:bg-[#f0f2ef] hover:text-[#a5523e]"
                    aria-label="Remove selected file"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : (
                <label htmlFor="file" className="flex cursor-pointer flex-col items-center px-4 py-7 text-center sm:py-8">
                  <span className="grid size-11 place-items-center rounded-[15px] bg-[#edf5e8] text-[#438263]">
                    <FileUp size={20} />
                  </span>
                  <span className="mt-3 text-sm font-semibold text-[#35483b]">
                    Drop your file here, or <span className="text-[#438263] underline underline-offset-2">browse</span>
                  </span>
                  <span id="file-help" className="mt-1.5 text-xs text-[#87938b]">
                    PDF, DOCX, PNG, or JPG · Up to 50 MB
                  </span>
                </label>
              )}
            </div>
            <p id="file-error" className="sr-only" aria-live="polite">
              {error}
            </p>
          </div>
          <div className="mt-5">
            <label htmlFor="customerName" className="mb-2 block text-sm font-semibold text-[#35483b]">
              Name or queue identifier <span className="text-[#d76d4e]">*</span>
            </label>
            <input
              id="customerName"
              name="customerName"
              type="text"
              autoComplete="name"
              maxLength={80}
              minLength={1}
              required
              placeholder="e.g. Alex or Blue jacket"
              className="h-12 w-full rounded-[13px] border border-[#dfe6df] bg-white px-4 text-sm text-[#263d30] outline-none transition placeholder:text-[#a1aaa3] focus:border-[#6d9b79] focus:ring-4 focus:ring-[#438263]/10"
            />
            <p className="mt-1.5 text-xs text-[#8a958e]">This helps the shop match your pages to you.</p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="copies" className="mb-2 block text-sm font-semibold text-[#35483b]">
                Copies
              </label>
              <input
                id="copies"
                name="copies"
                type="number"
                min={1}
                max={MAX_COPIES}
                defaultValue={1}
                required
                className="h-12 w-full rounded-[13px] border border-[#dfe6df] bg-white px-3.5 text-sm text-[#263d30] outline-none transition focus:border-[#6d9b79] focus:ring-4 focus:ring-[#438263]/10"
              />
            </div>
            <div>
              <label htmlFor="paperSize" className="mb-2 block text-sm font-semibold text-[#35483b]">
                Paper size
              </label>
              <select
                id="paperSize"
                name="paperSize"
                defaultValue="A4"
                className="h-12 w-full rounded-[13px] border border-[#dfe6df] bg-white px-3.5 text-sm text-[#263d30] outline-none transition focus:border-[#6d9b79] focus:ring-4 focus:ring-[#438263]/10"
              >
                <option value="A4">A4</option>
                <option value="LETTER">Letter</option>
                <option value="LEGAL">Legal</option>
              </select>
            </div>
          </div>
          <fieldset className="mt-5">
            <legend className="mb-2.5 text-sm font-semibold text-[#35483b]">Print color</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="cursor-pointer">
                <input className="peer sr-only" type="radio" name="colorType" value="BW" defaultChecked />
                <span className="flex h-[54px] items-center gap-3 rounded-[13px] border border-[#e0e6df] px-3.5 text-sm font-medium text-[#54645a] transition peer-checked:border-[#85ae8c] peer-checked:bg-[#f5faf1] peer-checked:text-[#315b3c] peer-focus-visible:ring-4 peer-focus-visible:ring-[#438263]/15">
                  <span className="grid size-7 place-items-center rounded-lg bg-[#f0f2ef] text-xs font-bold text-[#54645a]">
                    B/W
                  </span>
                  Black &amp; white
                  <span className="ml-auto grid size-4 place-items-center rounded-full border border-[#ccd6cc] peer-checked:border-[#438263] peer-checked:bg-[#438263]">
                    <Check size={10} className="text-white" />
                  </span>
                </span>
              </label>
              <label className="cursor-pointer">
                <input className="peer sr-only" type="radio" name="colorType" value="COLOR" />
                <span className="flex h-[54px] items-center gap-3 rounded-[13px] border border-[#e0e6df] px-3.5 text-sm font-medium text-[#54645a] transition peer-checked:border-[#85ae8c] peer-checked:bg-[#f5faf1] peer-checked:text-[#315b3c] peer-focus-visible:ring-4 peer-focus-visible:ring-[#438263]/15">
                  <span className="grid size-7 place-items-center rounded-lg bg-[conic-gradient(#ec7564_0_25%,#efc34f_25%_50%,#52a9a2_50%_75%,#887ad6_75%)]">
                    <span className="size-3 rounded-full bg-white" />
                  </span>
                  Color
                  <span className="ml-auto grid size-4 place-items-center rounded-full border border-[#ccd6cc]">
                    <Check size={10} className="text-transparent" />
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
          <div className="mt-5">
            <label htmlFor="notes" className="mb-2 block text-sm font-semibold text-[#35483b]">
              Notes <span className="font-normal text-[#96a098]">· optional</span>
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              maxLength={500}
              placeholder="Anything else the print team should know?"
              className="w-full resize-y rounded-[13px] border border-[#dfe6df] bg-white px-4 py-3 text-sm leading-5 text-[#263d30] outline-none transition placeholder:text-[#a1aaa3] focus:border-[#6d9b79] focus:ring-4 focus:ring-[#438263]/10"
            />
          </div>
          {error && (
            <div role="alert" className="mt-5 rounded-[13px] border border-[#f0cdc1] bg-[#fff6f2] px-4 py-3 text-sm leading-5 text-[#a24732]">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="mt-6 flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[15px] bg-[#23664b] px-5 text-sm font-semibold text-white shadow-[0_9px_18px_rgba(35,102,75,.16)] transition hover:bg-[#194d38] disabled:cursor-wait disabled:opacity-70"
          >
            {submitting ? (
              <>
                <LoaderCircle size={17} className="animate-spin" /> Sending your file…
              </>
            ) : (
              <>
                Send print request <ArrowRight size={17} />
              </>
            )}
          </button>
          <div className="mt-4 flex items-start justify-center gap-2 text-center text-[11px] leading-4 text-[#87938b]">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#6d9b79]" />
            <span>Your file is private and automatically deleted after 24 hours.</span>
          </div>
        </motion.form>
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-[#8a958e]">
          <span className="grid size-5 place-items-center rounded-md bg-white text-[#72917c]">
            <Check size={12} />
          </span>{" "}
          You&apos;ll get a live queue number as soon as it&apos;s sent.
        </div>
        <footer className="mt-10 text-center text-[11px] text-[#9aa39d]">PrintDrop · Printing, made a little simpler.</footer>
      </section>
    </main>
  );
}
