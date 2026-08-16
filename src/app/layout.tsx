import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vows & Vibe",
  description: "Real-time virtual try-on & lineup board for wedding parties.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
