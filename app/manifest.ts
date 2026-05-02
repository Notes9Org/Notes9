import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Notes9",
    short_name: "Notes9",
    description: "Professional laboratory research and experiment management platform",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f4ea",
    theme_color: "#f8f4ea",
    icons: [
      {
        src: "/notes9-logo-favicon.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/notes9-logo.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  }
}
