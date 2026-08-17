import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "./pwa-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://nexus-pharma.pages.dev"),
  title: "Nexus Pharma | Gestão fiscal simples",
  description:
    "Produtos, estoque, validades e tributação em uma gestão simples para a farmácia brasileira.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Nexus Pharma",
    description: "Gestão fiscal simples, moderna e acessível.",
    images: [{ url: "/og-v2.png", width: 1672, height: 941 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexus Pharma",
    description: "Gestão fiscal simples, moderna e acessível.",
    images: ["/og-v2.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
