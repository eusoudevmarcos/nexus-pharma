const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function publicOrigin(name, value) {
  if (!value) throw new Error(`${name}_OBRIGATORIA`);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || localHosts.has(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error(`${name}_DEVE_SER_HTTPS_PUBLICA`);
  }
  return parsed.origin;
}

async function probe(name, url, validate = () => true) {
  const started = performance.now();
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8_000) });
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("json") ? await response.json().catch(() => null) : null;
    const valid = response.ok && validate({ response, payload });
    return { name, url, ok: valid, status: response.status, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { name, url, ok: false, status: null, latencyMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : "ERRO_DESCONHECIDO" };
  }
}

try {
  const api = publicOrigin("NEXUS_API_URL", process.env.NEXUS_API_URL ?? process.argv[2]);
  const web = publicOrigin("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL ?? process.argv[3]);
  const checks = await Promise.all([
    probe("api-live", `${api}/health/live`, ({ payload }) => payload?.status === "ok"),
    probe("api-ready", `${api}/health/ready`, ({ payload }) => payload?.status === "ok" && payload?.database === "up"),
    probe("web-home", `${web}/`, ({ response }) => Boolean(response.headers.get("strict-transport-security")) && response.headers.get("x-content-type-options") === "nosniff"),
    probe("web-api-bridge", `${web}/api/health`, ({ payload }) => payload?.status === "ok" && payload?.api === "ready"),
    probe("web-robots", `${web}/robots.txt`),
    probe("web-sitemap", `${web}/sitemap.xml`),
  ]);
  const result = { ready: checks.every((item) => item.ok), checkedAt: new Date().toISOString(), checks };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ ready: false, error: error instanceof Error ? error.message : "ERRO_DESCONHECIDO" }, null, 2));
  process.exitCode = 1;
}
