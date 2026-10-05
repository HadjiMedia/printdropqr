"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Printer, ShieldCheck } from "lucide-react";

export default function AdminLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error || "Unable to sign in. Please try again.");
        setBusy(false);
        return;
      }
      router.replace("/admin/dashboard");
      router.refresh();
    } catch {
      setError("We couldn't reach the sign-in service. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[#f7f8f5] px-5 py-8 lg:grid-cols-[1fr_1fr] lg:px-0 lg:py-0">
      <section className="relative hidden overflow-hidden bg-[#203c2e] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="absolute -right-40 top-16 size-[500px] rounded-full border border-white/[.07]" />
        <div className="absolute -right-20 top-36 size-[340px] rounded-full border border-white/[.07]" />
        <Link href="/" className="relative flex w-fit items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-[14px] bg-white/10 text-[#d8f5a7]">
            <Printer size={19} />
          </span>
          <span className="text-[19px] font-bold tracking-[-.07em]">
            printdrop<span className="text-[#95bd7b]">.</span>
          </span>
        </Link>
        <div className="relative max-w-[510px] pb-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.08] px-3 py-1.5 text-xs font-semibold text-[#d0e8b4]">
            <span className="size-1.5 rounded-full bg-[#9bc977]" /> Your counter, in sync
          </div>
          <h1 className="text-[clamp(3rem,5.3vw,5.4rem)] font-semibold leading-[.96] tracking-[-.08em]">
            Keep the queue<br />moving.
          </h1>
          <p className="mt-6 max-w-[420px] text-base leading-7 text-white/65">
            A calmer way to receive jobs, keep customers in the loop, and get pages on their way.
          </p>
          <div className="mt-10 flex items-center gap-4 rounded-[22px] border border-white/10 bg-white/[.07] p-4">
            <div className="grid size-12 place-items-center rounded-2xl bg-[#d3edb0] text-[#315b3c]">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="text-sm font-semibold">Private by design</div>
              <div className="mt-1 text-xs text-white/55">Staff-only queue and file access</div>
            </div>
          </div>
        </div>
        <div className="relative text-xs text-white/45">
          PrintDrop staff console · Files are automatically cleared after 24 hours.
        </div>
      </section>
      <section className="flex items-center justify-center lg:px-10 xl:px-16">
        <div className="w-full max-w-[410px]">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#78867e] transition hover:text-[#23664b] lg:hidden"
          >
            <ArrowLeft size={15} /> Back to PrintDrop
          </Link>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mt-12 lg:mt-0"
          >
            <div className="grid size-12 place-items-center rounded-[16px] bg-[#eaf3e4] text-[#438263]">
              <LockKeyhole size={21} />
            </div>
            <p className="mt-6 text-xs font-bold uppercase tracking-[.15em] text-[#71917b]">Staff access</p>
            <h2 className="mt-2 text-[38px] font-semibold tracking-[-.065em] text-[#20372a]">Welcome back.</h2>
            <p className="mt-2 text-sm leading-6 text-[#78867e]">
              Sign in to see the live print queue and manage incoming requests.
            </p>
            <form onSubmit={signIn} className="mt-8">
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-[#35483b]">
                Staff password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-[53px] w-full rounded-[14px] border border-[#dfe6df] bg-white px-4 pr-12 text-sm text-[#263d30] outline-none transition focus:border-[#6d9b79] focus:ring-4 focus:ring-[#438263]/10"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[#8a968d] hover:text-[#42644c]"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {error && (
                <div role="alert" className="mt-4 rounded-xl border border-[#f0cdc1] bg-[#fff6f2] px-3.5 py-3 text-sm leading-5 text-[#a24732]">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={busy || !password}
                className="mt-5 flex h-[53px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#23664b] text-sm font-semibold text-white shadow-[0_9px_18px_rgba(35,102,75,.14)] transition hover:bg-[#194d38] disabled:cursor-wait disabled:opacity-65"
              >
                {busy ? "Signing in…" : <>Sign in to dashboard <ArrowRight size={16} /></>}
              </button>
            </form>
            <div className="mt-7 flex items-start gap-2.5 rounded-[15px] bg-[#f0f5ed] p-3.5 text-xs leading-5 text-[#708074]">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#6e9c73]" />
              <p>Sign-in credentials are set by your PrintDrop administrator. Ask them to configure your staff access.</p>
            </div>
            <Link
              href="/"
              className="mt-8 hidden text-sm font-medium text-[#87938b] transition hover:text-[#23664b] lg:inline-flex"
            >
              ← Back to PrintDrop
            </Link>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
