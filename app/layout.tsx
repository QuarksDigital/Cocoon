import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./globals.css";
import Cursor from "@/components/Cursor";

const inter = Inter({ variable: "--font-body", subsets: ["latin"] });
const interTight = Inter_Tight({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700", "800", "900"] });

export const metadata: Metadata = {
  title: "Cocoon - Premium 304 Stainless Steel Bath Drains",
  description:
    "Cocoon by Goel Sinks India. Linear, square, round and rooftop drains in 304-grade stainless steel. Laser-cut grates, rust resistant, built to last.",
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable}`}>
      <body>
        {children}
        <Cursor />
      </body>
    </html>
  );
}
