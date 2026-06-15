import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Low Battery Town",
    short_name: "LBT",
    description:
      "A cinematic focus & social study platform for low battery minds.",
    start_url: "/",
    display: "standalone",
    background_color: "#030111",
    theme_color: "#030111",
    icons: [
      { src: "/logo.png", sizes: "192x192", type: "image/png" },
      { src: "/logo.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
