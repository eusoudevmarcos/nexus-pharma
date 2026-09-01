const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function publicOrigin(name, value) {
  if (!value) throw new Error(`${name}_OBRIGATORIA`);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || localHosts.has(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error(`${name}_DEVE_SER_HTTPS_PUBLICA`);
  }
  return parsed.origin;
}

async function probe(name, url, validate = () => true, request = {}) {
  const started = performance.now();
  try {
    const { expectedStatus, ...fetchOptions } = request;
    const response = await fetch(url, { redirect: "follow", ...fetchOptions, signal: AbortSignal.timeout(8_000) });
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("json") ? await response.json().catch(() => null) : null;
    const validStatus = expectedStatus === undefined ? response.ok : response.status === expectedStatus;
    const valid = validStatus && validate({ response, payload });
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
    probe("web-password-recovery-page", `${web}/esqueci-senha`),
    probe("web-password-reset-page", `${web}/redefinir-senha?token=validacao`),
    probe(
      "web-password-recovery-bridge",
      `${web}/api/session/password/forgot`,
      ({ payload }) => typeof payload?.message === "string",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "nexus-validation-invalid@example.invalid" }), expectedStatus: 202 },
    ),
    probe(
      "api-rejects-invalid-reset-token",
      `${api}/api/v1/auth/password/reset`,
      ({ payload }) => payload?.erro === "LINK_DE_REDEFINICAO_INVALIDO_OU_EXPIRADO",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "x".repeat(40), nova_senha: "Validacao#2026Segura" }), expectedStatus: 400 },
    ),
    probe(
      "api-protects-customer-helpdesk",
      `${api}/api/v1/suporte/tickets`,
      ({ payload }) => payload?.erro === "TOKEN_INVALIDO_OU_EXPIRADO",
      { expectedStatus: 401 },
    ),
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
