import type { Metadata } from "next";
import { motionCssVariables } from "@/components/ui/motion";
import "./globals.css";
import "./stateful-button.css";
import "./design-system.css";
import "./motion.css";

export const metadata: Metadata = {
  title: "Life",
  description: "Private local-first life records.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" style={motionCssVariables}>
      <body>
        <a className="skip-link" href="#main-content">跳到正文</a>
        <div id="main-content" tabIndex={-1}>{children}</div>
      </body>
    </html>
  );
}
