import type { MetadataRoute } from "next";
import { publicSiteUrl } from "@/lib/runtime-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicSiteUrl();
  return ["", "/recursos", "/seguranca", "/planos", "/entrar"].map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: path ? "monthly" : "weekly", priority: path ? 0.8 : 1 }));
}
