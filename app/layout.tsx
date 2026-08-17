import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "./pwa-register";

const robotoSans = Roboto({
  variable: "--font-roboto-sans",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
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
    images: [{ url: "/og-v3.png", width: 1672, height: 941 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexus Pharma",
    description: "Gestão fiscal simples, moderna e acessível.",
    images: ["/og-v3.png"],
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
        className={`${robotoSans.variable} ${robotoMono.variable} antialiased`}
      >
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
