import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "r0ute",
  description: "MeshCore path viewer — see the route your message took",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="m-0 bg-neutral-950 font-sans text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
