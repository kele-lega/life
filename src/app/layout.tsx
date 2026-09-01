import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Life",
  description: "Private local-first life records.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
