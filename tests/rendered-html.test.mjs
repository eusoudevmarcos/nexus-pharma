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

test("automatiza convites e cobrança com segurança e monitoramento", async () => {
  const [schema, migration, delivery, webhook, users, server, resendProxy, administration, internal, finance, render] = await Promise.all([
    readFile(new URL("../api/prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../api/prisma/migrations/20260824200000_email_and_billing_automation/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../api/src/services/email-delivery.ts", import.meta.url), "utf8"),
    readFile(new URL("../api/src/routes/billing-webhooks.routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../api/src/routes/users.routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../api/src/server.ts", import.meta.url), "utf8"),
    readFile(new URL("../web/app/api/portal/invitations/[id]/resend/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/usuarios/user-administration.tsx", import.meta.url), "utf8"),
    readFile(new URL("../api/src/routes/internal.routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/interno/financeiro/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../render.yaml", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /model EmailDelivery \{/);
  assert.match(schema, /model BillingWebhookEvent \{/);
  assert.match(schema, /@@unique\(\[provider, externalEventId\]\)/);
  assert.doesNotMatch(schema.match(/model EmailDelivery \{[\s\S]*?\n\}/)?.[0] ?? "", /token/i);
  assert.match(migration, /billing_webhook_events_provider_external_event_id_key/);
  assert.match(delivery, /status: config\.EMAIL_RELAY_URL \? "PROCESSING" : "QUEUED"/);
  assert.match(delivery, /AbortSignal\.timeout\(10_000\)/);
  assert.doesNotMatch(delivery, /token:\s*message\.token/);
  assert.match(webhook, /createHmac\("sha256"/);
  assert.match(webhook, /timingSafeEqual/);
  assert.match(webhook, /5 \* 60 \* 1000/);
  assert.match(webhook, /error\.code === "P2002"/);
  assert.match(server, /prefix: "\/api\/v1\/webhooks"/);
  assert.match(users, /USER_INVITATION_RESENT/);
  assert.match(resendProxy, /inviteUrl/);
  assert.doesNotMatch(resendProxy, /token: body\.token/);
  assert.match(administration, /Reenviar/);
  assert.match(internal, /failedBillingEvents/);
  assert.match(finance, /E-mails e webhooks financeiros/);
  for (const key of ["EMAIL_RELAY_URL", "EMAIL_RELAY_KEY", "BILLING_WEBHOOK_SECRET"]) assert.match(render, new RegExp(key));
});

test("monitora a plataforma e trata incidentes operacionais", async () => {
  const [schema, migration, observability, server, internal, shell, page, board, proxy, render] = await Promise.all([
    readFile(new URL("../api/prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../api/prisma/migrations/20260824213000_operational_observability/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../api/src/services/observability.ts", import.meta.url), "utf8"),
    readFile(new URL("../api/src/server.ts", import.meta.url), "utf8"),
    readFile(new URL("../api/src/routes/internal.routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/internal-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/interno/monitoramento/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/interno/monitoramento/incident-board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/api/portal/internal/incidents/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../render.yaml", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /model OperationalIncident \{/);
  assert.match(schema, /occurrenceCount Int\s+@default\(1\)/);
  assert.match(migration, /operational_incidents_fingerprint_key/);
  assert.match(observability, /occurrenceCount: \{ increment: 1 \}/);
  assert.match(observability, /status: "OPEN"/);
  assert.match(server, /"\/health\/live"/);
  assert.match(server, /"\/health\/ready"/);
  assert.match(server, /OBSERVABILITY_TOKEN/);
  assert.match(server, /recordOperationalIncident/);
  assert.match(internal, /OPERATIONAL_INCIDENT_UPDATED/);
  assert.match(shell, /Monitoramento/);
  assert.match(page, /Saúde dos serviços/);
  assert.match(board, /Assumir/);
  assert.match(board, /Resolver/);
  assert.match(proxy, /monitoramento\/incidentes/);
  assert.match(render, /OBSERVABILITY_TOKEN/);
});

test("automatiza estoque, vencimentos, margem e cobrança em uma central de alertas", async () => {
  const [schema, migration, job, runner, packageJson, reports, operations, render, shell, page, center, proxy, monitoring] = await Promise.all([
    readFile(new URL("../api/prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../api/prisma/migrations/20260824230000_business_automation/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../api/src/jobs/daily-business-automation.ts", import.meta.url), "utf8"),
    readFile(new URL("../api/src/jobs/run-daily.ts", import.meta.url), "utf8"),
    readFile(new URL("../api/package.json", import.meta.url), "utf8"),
    readFile(new URL("../api/src/routes/reports.routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../api/src/routes/operations.routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../render.yaml", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/portal-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/alertas/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/alertas/alert-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/api/portal/alerts/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/interno/monitoramento/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /model BusinessAlert \{/);
  assert.match(schema, /model BackgroundJobRun \{/);
  assert.match(schema, /deduplicationKey\s+String\s+@unique/);
  assert.match(migration, /business_alerts_deduplication_key_key/);
  assert.match(job, /daily-business-automation:\$\{dateKey\}/);
  assert.match(job, /previous\?\.status === "RUNNING"/);
  assert.match(job, /margin >= 0\.25/);
  assert.match(job, /coverageDays[\s\S]*?<= 15/);
  assert.match(job, /EXPIRY_90/);
  assert.match(job, /BILLING_OVERDUE/);
  assert.match(job, /status: "RESOLVED"/);
  assert.match(runner, /prisma\.\$disconnect/);
  assert.match(packageJson, /"jobs:daily"/);
  assert.match(reports, /"\/alertas"/);
  assert.match(operations, /BUSINESS_ALERT_UPDATED/);
  assert.match(render, /type: cron/);
  assert.match(render, /schedule: "0 10 \* \* \*"/);
  assert.match(shell, /Central de alertas|\/portal\/alertas/);
  assert.match(page, /Central de alertas/);
  assert.match(center, /Oportunidade de compra/);
  assert.match(center, /Assumir/);
  assert.match(proxy, /\/api\/v1\/alertas/);
  assert.match(monitoring, /failedAutomations/);
});

test("implementa planos, onboarding, success fee auditável e faturamento mensal idempotente", async () => {
  const [schema, migration, seed, billing, gateway, webhook, internal, billingPage, billingCenter, commercial, shell, render] = await Promise.all([
    readFile(new URL("../api/prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../api/prisma/migrations/20260825010000_saas_pricing_billing/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../api/prisma/seed.ts", import.meta.url), "utf8"),
    readFile(new URL("../api/src/services/monthly-billing.ts", import.meta.url), "utf8"),
    readFile(new URL("../api/src/services/billing-gateway.ts", import.meta.url), "utf8"),
    readFile(new URL("../api/src/routes/billing-webhooks.routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../api/src/routes/internal.routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/interno/faturamento/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/interno/faturamento/billing-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/interno/comercial/commercial-pipeline.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/app/portal/internal-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../render.yaml", import.meta.url), "utf8"),
  ]);

  for (const model of ["Store", "PointOfSale", "CustomerOnboarding", "SetupInstallment", "MonthlySavingsLedger", "InvoiceItem", "BillingChargeRequest"]) assert.match(schema, new RegExp(`model ${model} \\{`));
  assert.match(schema, /@@unique\(\[subscriptionId, billingPeriod\]\)/);
  assert.match(migration, /stores_one_main_per_company_uidx/);
  assert.match(migration, /billing_charge_requests_invoice_id_payload_hash_key/);
  for (const plan of ["BASIC", "SMART", "FISCAL_INTELIGENTE", "ULTIMATE"]) assert.match(seed, new RegExp(`code: "${plan}"`));
  for (const price of ["monthlyPrice: 698", "monthlyPrice: 1199", "monthlyPrice: 1990", "monthlyPrice: 2498", "setupPrice: 10000", "additionalStorePrice: 1000", "extraPdvPrice: 280"]) assert.match(seed, new RegExp(price));
  assert.match(billing, /additionalStores/);
  assert.match(billing, /extraPdvs/);
  assert.match(billing, /totalSavings \* successRate/);
  assert.match(billing, /amount: 5000/);
  assert.match(billing, /amount: 1250/);
  assert.match(billing, /isolationLevel: "Serializable"/);
  assert.match(billing, /requiresReview \? "DRAFT" : "OPEN"/);
  assert.match(gateway, /payloadHash/);
  assert.match(gateway, /idempotency_key/);
  assert.match(gateway, /BILLING_RELAY_URL/);
  assert.match(webhook, /setupInstallment\.updateMany/);
  assert.match(webhook, /status: "COMPLETED"/);
  assert.match(internal, /MONTHLY_SAVINGS_VERIFIED/);
  assert.match(internal, /MONTHLY_INVOICE_CLOSED|faturamento\/fechar/);
  assert.match(billingPage, /OPERAÇÃO OCEAN/);
  assert.match(billingCenter, /Homologar economia mensal/);
  assert.match(billingCenter, /Faturas discriminadas/);
  assert.match(commercial, /Ativar contrato/);
  assert.match(shell, /Faturamento SaaS/);
  for (const key of ["BILLING_RELAY_URL", "BILLING_RELAY_KEY"]) assert.match(render, new RegExp(key));
});
