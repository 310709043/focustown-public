import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LowBatteryTown",
    short_name: "LBT",
    description: "社交電量低的時候，匿名和一位真人一對一聊聊。不用註冊。",
    lang: "zh-TW",
    // "/" so the middleware picks the visitor's locale (NEXT_LOCALE cookie, Accept-Language).
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#141c31",
    theme_color: "#141c31",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/brand/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
