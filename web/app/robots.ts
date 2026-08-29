import type { MetadataRoute } from "next";
import { publicSiteUrl } from "@/lib/runtime-config";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/portal", "/api/"] }, sitemap: `${publicSiteUrl()}/sitemap.xml` };
}
