import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renderiza o dashboard Nexus Pharma", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Nexus Pharma \| Gestão fiscal simples<\/title>/i);
  assert.match(html, /Economia tributária/i);
  assert.match(html, /Giro e rentabilidade/i);
  assert.match(html, /Inteligência de compras/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("mantém os contratos operacionais e remove o preview inicial", async () => {
  const [page, layout, packageJson, schema, workspaceRoute, catalogRoute, manifest] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/catalogo/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/manifest.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /event\.key === "F2"/);
  assert.match(page, /event\.key === "F8"/);
  assert.match(page, /nexus-pending-sales/);
  assert.match(page, /SIMPLES_NACIONAL/);
  assert.match(page, /LUCRO_PRESUMIDO/);
  assert.match(page, /LUCRO_REAL/);
  assert.match(layout, /Nexus Pharma/);
  assert.match(layout, /og-v5\.png/);
  assert.match(page, /Logo%20Nexus%20pharma\.png/);
  assert.match(manifest, /Icon%20Nexus%20pharma\.png/);
  assert.match(schema, /empresaMembros/);
  assert.match(schema, /auditoria/);
  assert.match(schema, /regrasFiscais/);
  assert.match(schema, /produtos/);
  assert.match(workspaceRoute, /getChatGPTUser/);
  assert.match(workspaceRoute, /isolamentoPorEmpresa: true/);
  assert.match(catalogRoute, /CATEGORIA_FISCAL_SALVA/);
  assert.match(catalogRoute, /PRODUTO_SALVO/);
  assert.match(page, /method: "PUT"/);
  assert.doesNotMatch(page, /SkeletonPreview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("protege o contexto da empresa sem identidade autenticada", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("auth-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/api/workspace"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 401);

  const catalogResponse = await worker.fetch(
    new Request("http://localhost/api/catalogo"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(catalogResponse.status, 401);
});
