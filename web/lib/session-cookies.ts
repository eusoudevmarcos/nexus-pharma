export const sessionCookieNames = {
  access: process.env.NODE_ENV === "production" ? "__Host-nexus_access" : "nexus_access",
  refresh: process.env.NODE_ENV === "production" ? "__Host-nexus_refresh" : "nexus_refresh",
  company: process.env.NODE_ENV === "production" ? "__Host-nexus_company" : "nexus_company",
} as const;

export const sessionCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge,
  priority: "high" as const,
});

export const legacyCookieNames = ["nexus_access", "nexus_refresh", "nexus_company"] as const;
