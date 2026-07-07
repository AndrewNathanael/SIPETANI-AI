import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIPETANI — AI Deteksi Penyakit Tanaman",
  description: "Deteksi penyakit dan hama tanaman secara instan menggunakan YOLOv8. Upload foto daun untuk diagnosis AI dalam hitungan detik.",
  keywords: ["plant disease", "AI detection", "YOLOv8", "pertanian", "singkong", "padi", "SIPETANI", "agriculture AI"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#030b06" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,400&family=Space+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
