import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nexus Pharma",
    short_name: "Nexus Pharma",
    description: "Inteligência fiscal, estoque e gestão para farmácias.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7f8",
    theme_color: "#ffca05",
    icons: [{ src: "/logo/icon-nexus-pharma.png", sizes: "2000x970", type: "image/png" }],
  };
}
