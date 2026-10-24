import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Nunito } from "next/font/google";
import "./globals.css";

// Atkinson Hyperlegible: designed for readability, good for young and low-vision readers.
const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
});

// Nunito: rounded, friendly headings.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Closer",
  description: "Stay close to the people you love during a hospital stay.",
};

export const viewport: Viewport = {
  themeColor: "#f5e9dc",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${atkinson.variable} ${nunito.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col text-base">{children}</body>
    </html>
  );
}
