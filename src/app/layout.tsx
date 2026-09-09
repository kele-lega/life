import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/ui/app-shell";
import { PwaRegister } from "@/components/ui/pwa-register";
import { LibraryBoundary } from "@/features/cloud-backup/components/library-boundary";
import { motionCssVariables } from "@/components/ui/motion";
import "./globals.css";
import "./stateful-button.css";
import "./design-system.css";
import "./motion.css";

export const metadata: Metadata = {
  title: "Life",
  description: "Private local-first life records.",
  applicationName: "Life",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Life" },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#fafaf9" }, { media: "(prefers-color-scheme: dark)", color: "#171a19" }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" style={motionCssVariables}>
      <body>
        <PwaRegister />
        <a className="skip-link" href="#main-content">跳到正文</a>
        <AppShell><LibraryBoundary>{children}</LibraryBoundary></AppShell>
      </body>
    </html>
  );
}
