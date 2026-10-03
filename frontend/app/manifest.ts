import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LowBatteryTown",
    short_name: "LBT",
    description:
      "A low-pressure place to sit and chat when your social battery is low. Interactive prototype.",
    start_url: "/",
    display: "standalone",
    background_color: "#141c31",
    theme_color: "#141c31",
    icons: [
      { src: "/logo.png", sizes: "192x192", type: "image/png" },
      { src: "/logo.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
