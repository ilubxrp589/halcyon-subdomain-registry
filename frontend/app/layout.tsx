import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/header";
import { Footer } from "@/components/common/Footer";
import { Toaster } from "sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false, // Only used in code blocks, don't preload
});

export const metadata: Metadata = {
  title: "Halcyon — The Decentralized Domain Marketplace",
  description: "AI-powered domains on Handshake + Flare. Register subdomains as NFTs, or stake your TLD and earn from every registration.",
  keywords: ["handshake", "hns", "subdomain", "nft", "flare", "blockchain", "dns", "tld", "marketplace", "domain", "staking"],
  openGraph: {
    title: "Halcyon — The Decentralized Domain Marketplace",
    description: "AI-powered domains on Handshake + Flare. Register subdomains as NFTs, or stake your TLD and earn from every registration.",
    siteName: "Halcyon",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Halcyon — The Decentralized Domain Marketplace",
    description: "AI-powered domains on Handshake + Flare. Register subdomains as NFTs, or stake your TLD and earn from every registration.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-screen bg-background text-foreground`}>
        <Providers>
          <Header />
          <main className="min-h-[calc(100vh-10rem)]">{children}</main>
          <Footer />
          <Toaster richColors position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
