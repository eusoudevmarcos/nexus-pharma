import type { Metadata } from "next";
import "@fontsource-variable/roboto";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { publicSiteUrl } from "@/lib/runtime-config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(publicSiteUrl()),
  title: {
    default: "Nexus Pharma | Inteligência fiscal para farmácias",
    template: "%s | Nexus Pharma",
  },
  description:
    "Gestão fiscal, classificação de produtos, estoque, validade e margem em uma plataforma feita para farmácias.",
  openGraph: {
    title: "Nexus Pharma",
    description: "Inteligência fiscal e comercial para farmácias.",
    images: ["/og.png"],
    locale: "pt_BR",
    type: "website",
  },
  icons: {
    icon: "/logo/icon-nexus-pharma.png",
    apple: "/logo/icon-nexus-pharma.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
