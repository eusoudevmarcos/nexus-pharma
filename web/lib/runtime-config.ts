const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function url(name: "NEXUS_API_URL" | "NEXT_PUBLIC_SITE_URL", fallback: string) {
  const value = process.env[name]?.trim() || fallback;
  const parsed = new URL(value);
  if (process.env.VERCEL === "1" && (parsed.protocol !== "https:" || localHosts.has(parsed.hostname))) {
    throw new Error(`${name}_MUST_BE_PUBLIC_HTTPS`);
  }
  return parsed.origin;
}

export const nexusApiUrl = () => url("NEXUS_API_URL", "http://localhost:3333");
export const publicSiteUrl = () => url("NEXT_PUBLIC_SITE_URL", "http://localhost:3100");
