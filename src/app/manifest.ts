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
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Full-bleed coral with the glyph inside the 80% safe zone, for launchers that crop
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
