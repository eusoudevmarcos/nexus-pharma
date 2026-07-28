import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nexus Pharma",
    short_name: "Nexus",
    description:
      "Inteligência fiscal, sell-out e reposição para farmácias.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5ef",
    theme_color: "#101411",
    lang: "pt-BR",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}

