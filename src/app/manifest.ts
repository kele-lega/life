import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Life",
    short_name: "Life",
    description: "Private local-first life records.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#fafaf9",
    lang: "zh-CN",
    icons: [
      { src: "/icons/life-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/life-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
