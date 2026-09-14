import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

const config: CapacitorConfig = {
  appId: "app.kelelega.life",
  appName: "Life",
  webDir: "out",
  backgroundColor: "#fafaf9",
  server: {
    androidScheme: "https",
    hostname: "localhost",
    ...(process.env.CAPACITOR_DEV_SERVER_URL
      ? { url: process.env.CAPACITOR_DEV_SERVER_URL, cleartext: true }
      : {}),
  },
  android: {
    allowMixedContent: false,
    minWebViewVersion: 90,
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.None,
    },
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#fafaf9",
    },
  },
};

if (config.server && "url" in config.server && process.env.NODE_ENV === "production" && !process.env.CAPACITOR_DEV_SERVER_URL) {
  throw new Error("Production Capacitor builds must not set server.url.");
}

export default config;