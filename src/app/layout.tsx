import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PrintDrop — print, without the line",
    template: "%s — PrintDrop",
  },
  description: "A faster, simpler way to send print jobs to your local print shop.",
  applicationName: "PrintDrop",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
