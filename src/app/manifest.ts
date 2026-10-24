import type { MetadataRoute } from "next";

// PWA manifest: lets patients and families add Closer to their home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Closer",
    short_name: "Closer",
    description: "Stay close to the people you love during a hospital stay.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5e9dc",
    theme_color: "#f5e9dc",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
