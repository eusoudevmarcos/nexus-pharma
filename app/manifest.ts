import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nexus Pharma",
    short_name: "Nexus",
    description:
      "Inteligência fiscal, sell-out e reposição para farmácias.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7f9",
    theme_color: "#00345f",
    lang: "pt-BR",
    icons: [
      {
        src: "/logo/Icon%20Nexus%20pharma.png",
        sizes: "2000x970",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
