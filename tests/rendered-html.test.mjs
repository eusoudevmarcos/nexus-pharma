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
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
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
  const [
    page,
    layout,
    packageJson,
    schema,
    workspaceRoute,
    catalogRoute,
    manifest,
    styles,
  ] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/catalogo/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/manifest.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /event\.key === "F2"/);
  assert.match(page, /event\.key === "F8"/);
  assert.match(page, /nexus-pending-sales/);
  assert.match(page, /SIMPLES_NACIONAL/);
  assert.match(page, /LUCRO_PRESUMIDO/);
  assert.match(page, /LUCRO_REAL/);
  assert.match(layout, /Nexus Pharma/);
  assert.match(layout, /og-v5\.png/);
  assert.match(page, /Logo%20Nexus%20pharma%20transparente\.png/);
  assert.match(
    styles,
    /\.brand\s*\{\s*height:\s*190px;[\s\S]*?background:\s*transparent;/,
  );
  assert.match(styles, /--mist:\s*#d8e6ed/);
  assert.match(manifest, /logo\/nexus-icon\.png/);
  assert.match(schema, /empresaMembros/);
  assert.match(schema, /auditoria/);
  assert.match(schema, /regrasFiscais/);
  assert.match(schema, /produtos/);
  assert.match(workspaceRoute, /getChatGPTUser/);
  assert.match(workspaceRoute, /isolamentoPorEmpresa: true/);
  assert.match(catalogRoute, /CATEGORIA_FISCAL_SALVA/);
  assert.match(catalogRoute, /PRODUTO_SALVO/);
  assert.match(page, /method: "PUT"/);
  assert.match(page, /aria-label="Cadastrar novo produto"/);
  assert.match(page, /aria-label="Cadastrar nova categoria"/);
  assert.match(page, /rulesFor\(\)/);
  assert.doesNotMatch(page, /SkeletonPreview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("protege o contexto da empresa sem identidade autenticada", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("auth-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/api/workspace"),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 401);

  const catalogResponse = await worker.fetch(
    new Request("http://localhost/api/catalogo"),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(catalogResponse.status, 401);
});

test("mantém a fundação SaaS pronta para PostgreSQL, Prisma e Render", async () => {
  const [schema, migration, apiPackage, renderBlueprint, auth, operations] =
    await Promise.all([
      readFile(new URL("../api/prisma/schema.prisma", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../api/prisma/migrations/20260823170000_init_saas/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../api/package.json", import.meta.url), "utf8"),
      readFile(new URL("../render.yaml", import.meta.url), "utf8"),
      readFile(new URL("../api/src/security/auth.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../api/src/routes/operations.routes.ts", import.meta.url),
        "utf8",
      ),
    ]);

  for (const model of [
    "User",
    "AuthSession",
    "Company",
    "Plan",
    "Subscription",
    "FiscalCategory",
    "Product",
    "Sale",
    "TaxAnalysis",
    "SupportTicket",
    "Release",
    "AuditLog",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(schema, /provider = "postgresql"/);
  assert.match(migration, /subscriptions_one_current_per_company_uidx/);
  assert.match(apiPackage, /"prisma:migrate:deploy"/);
  assert.doesNotMatch(apiPackage, /mongoose/);
  assert.match(
    renderBlueprint,
    /preDeployCommand: npm run prisma:migrate:deploy/,
  );
  assert.match(renderBlueprint, /property: connectionString/);
  assert.match(auth, /x-company-id/);
  assert.match(operations, /financeiro\/assinaturas/);
  assert.match(operations, /desenvolvimento\/releases/);
});

test("mantém o site institucional pronto para Vercel e login seguro", async () => {
  const [home, layout, brand, styles, login, logout, vercel, webPackage] =
    await Promise.all([
      readFile(new URL("../web/app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../web/app/layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../web/components/brand.tsx", import.meta.url), "utf8"),
      readFile(new URL("../web/app/globals.css", import.meta.url), "utf8"),
      readFile(
        new URL("../web/app/api/session/login/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../web/app/api/session/logout/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../web/vercel.json", import.meta.url), "utf8"),
      readFile(new URL("../web/package.json", import.meta.url), "utf8"),
    ]);

  assert.match(home, /INTELIGÊNCIA FISCAL PARA FARMÁCIAS/);
  assert.match(home, /Reposição &amp; margem/);
  assert.match(layout, /@fontsource-variable\/roboto/);
  assert.match(layout, /logo\/icon-nexus-pharma\.png/);
  assert.match(brand, /logo-nexus-horizontal\.png/);
  assert.match(styles, /\.brand img[\s\S]*background: transparent/);
  assert.match(login, /httpOnly: true/);
  assert.match(login, /sameSite: "lax"/);
  assert.match(login, /nexus_refresh/);
  assert.match(logout, /cookies\.delete\("nexus_access"\)/);
  assert.match(vercel, /nextjs/);
  assert.match(webPackage, /"next": "16\.2\.6"/);
});

test("entrega o portal multiempresa com relatórios separados por perfil", async () => {
  const [reports, server, portal, shell, companySession, management, operation, fiscal, users] = await Promise.all([
    readFile(new URL("../api/src/routes/reports.routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../api/src/server.ts", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/portal-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/api/session/company/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/gestao/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/operacao/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/fiscal/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/usuarios/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(server, /prefix: "\/api\/v1\/relatorios"/);
  for (const route of ["/gestao", "/operacao", "/fiscal", "/usuarios"]) assert.match(reports, new RegExp(`"${route}"`));
  assert.match(reports, /tenantContext/);
  assert.match(reports, /requireTenantRoles/);
  assert.match(companySession, /httpOnly: true/);
  assert.match(companySession, /memberships\?\.find/);
  assert.match(portal, /CompanySelector/);
  assert.match(shell, /Módulos do portal/);
  assert.match(management, /Gestão do negócio/);
  assert.match(operation, /Estoque e vendas/);
  assert.match(fiscal, /Motor fiscal/);
  assert.match(users, /UserAdministration/);
});

test("protege convites e alterações de acesso com trilha de auditoria", async () => {
  const [routes, server, administration, acceptance, inviteProxy, logout] = await Promise.all([
    readFile(new URL("../api/src/routes/users.routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../api/src/server.ts", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/usuarios/user-administration.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/convite/invitation-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/api/portal/users/invite/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../web/app/api/session/logout/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(server, /prefix: "\/api\/v1\/usuarios"/);
  assert.match(routes, /createHash\("sha256"\)/);
  assert.match(routes, /randomBytes\(36\)/);
  assert.match(routes, /72 \* 60 \* 60 \* 1000/);
  assert.match(routes, /ULTIMO_PROPRIETARIO/);
  assert.match(routes, /AUTO_SUSPENSAO_NAO_PERMITIDA/);
  assert.match(routes, /MEMBERSHIP_UPDATED/);
  assert.match(routes, /INVITATION_ACCEPTED/);
  assert.match(administration, /Gerar convite seguro/);
  assert.match(administration, /Suspender/);
  assert.match(acceptance, /Aceitar convite/);
  assert.match(inviteProxy, /inviteUrl/);
  assert.doesNotMatch(inviteProxy, /token: body\.token/);
  assert.match(logout, /cookies\.delete\("nexus_company"\)/);
});

test("separa a operação interna por departamento e perfil de sistema", async () => {
  const [routes, server, portalLib, layout, shell, support, finance, commercial, development] = await Promise.all([
    readFile(new URL("../api/src/routes/internal.routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../api/src/server.ts", import.meta.url), "utf8"),
    readFile(new URL("../web/lib/portal.ts", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/internal-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/interno/suporte/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/interno/financeiro/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/interno/comercial/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/interno/desenvolvimento/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(server, /prefix: "\/api\/v1\/interno"/);
  for (const role of ["HELPDESK", "FINANCE", "COMMERCIAL", "DEVELOPER"]) assert.match(routes, new RegExp(`"${role}"`));
  assert.match(routes, /SUPPORT_TICKET_UPDATED/);
  assert.match(routes, /COMPANY_PIPELINE_UPDATED/);
  assert.match(portalLib, /defaultInternalArea/);
  assert.match(portalLib, /requireInternal/);
  assert.match(layout, /InternalShell/);
  assert.match(shell, /Áreas internas/);
  assert.match(support, /Fila única/);
  assert.match(finance, /Receita recorrente/);
  assert.match(commercial, /Pipeline SaaS/);
  assert.match(development, /Esteira de publicação/);
});
