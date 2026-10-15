import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rittapadu Saraswathi Puja 2026",
  description:
    "Celebrate Saraswathi Puja with Rittapadu. Programme, puja and prasadam, household Chandas, venue information, and celebration photos in English and Telugu. 16–18 October 2026.",
  applicationName: "Rittapadu Saraswathi Puja",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#581426",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export const runtime = "nodejs";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
