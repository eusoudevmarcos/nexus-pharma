import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { allowedOrigins, config } from "../config.js";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";

export type ReadinessStatus = "PASS" | "WARN" | "BLOCKED";
export type ReadinessCategory = "ACCESS" | "DATABASE" | "RECOVERY" | "INTEGRATIONS" | "OPERATIONS" | "FISCAL";
export type ReadinessCheck = {
  id: string;
  category: ReadinessCategory;
  status: ReadinessStatus;
  title: string;
  detail: string;
  action: string | null;
};

const DAY = 86_400_000;
const expectedPlans = ["BASIC", "SMART", "FISCAL_INTELIGENTE", "ULTIMATE"];
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

const check = (id: string, category: ReadinessCategory, status: ReadinessStatus, title: string, detail: string, action: string | null = null): ReadinessCheck => ({ id, category, status, title, detail, action });
const publicHttps = (value: string) => {
  const url = new URL(value);
  return url.protocol === "https:" && !localHosts.has(url.hostname);
};

async function expectedMigrations() {
  const migrationRoot = join(process.cwd(), "prisma", "migrations");
  const entries = await readdir(migrationRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

export async function getProductionReadiness() {
  const checks: ReadinessCheck[] = [];
  const productionStage = config.DEPLOYMENT_STAGE === "production";
  checks.push(check("deployment-stage", "OPERATIONS", productionStage ? "PASS" : "BLOCKED", "Ambiente de execução", productionStage ? "API declarada como produção." : `Ambiente atual: ${config.DEPLOYMENT_STAGE}.`, productionStage ? null : "Defina DEPLOYMENT_STAGE=production somente no ambiente final."));
  const versionReady = !["development", "unknown"].includes(config.SERVICE_VERSION.toLowerCase());
  checks.push(check("service-version", "OPERATIONS", versionReady ? "PASS" : "BLOCKED", "Versão implantada", versionReady ? `Revisão ${config.SERVICE_VERSION.slice(0, 12)} identificada.` : "A revisão implantada não pode ser rastreada.", versionReady ? null : "Publique a partir de um commit e preserve RENDER_GIT_COMMIT."));
  const originsReady = allowedOrigins.length > 0 && allowedOrigins.every(publicHttps);
  checks.push(check("web-origin", "ACCESS", originsReady ? "PASS" : "BLOCKED", "Origem do portal", originsReady ? `${allowedOrigins.length} origem(ns) HTTPS restrita(s).` : "Há origem local, HTTP ou inválida configurada.", originsReady ? null : "Defina WEB_ORIGIN somente com o domínio HTTPS da Vercel."));
  const appUrlReady = publicHttps(config.WEB_APP_URL);
  checks.push(check("web-app-url", "ACCESS", appUrlReady ? "PASS" : "BLOCKED", "URL pública do portal", appUrlReady ? "Endereço HTTPS configurado." : "O portal ainda aponta para endereço local ou sem HTTPS.", appUrlReady ? null : "Defina WEB_APP_URL com a URL final da Vercel."));
  const mfaSecretReady = Boolean(config.MFA_ENCRYPTION_KEY?.trim() && config.MFA_ENCRYPTION_KEY.trim().length >= 32);
  checks.push(check("mfa-encryption", "ACCESS", mfaSecretReady ? "PASS" : "BLOCKED", "Proteção do MFA", mfaSecretReady ? "Chave exclusiva de criptografia do segundo fator configurada." : "O segundo fator não possui chave de criptografia válida.", mfaSecretReady ? null : "Gere MFA_ENCRYPTION_KEY com ao menos 32 caracteres exclusivamente no Render."));
  checks.push(check("seed-credentials", "ACCESS", config.SEED_ADMIN_EMAIL || config.SEED_ADMIN_PASSWORD ? "WARN" : "PASS", "Credenciais iniciais", config.SEED_ADMIN_EMAIL || config.SEED_ADMIN_PASSWORD ? "Variáveis de criação do administrador ainda estão presentes." : "Credenciais temporárias não permanecem no ambiente.", config.SEED_ADMIN_EMAIL || config.SEED_ADMIN_PASSWORD ? "Remova SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD após criar o administrador." : null));
  checks.push(check("observability", "OPERATIONS", config.OBSERVABILITY_TOKEN ? "PASS" : "BLOCKED", "Observabilidade protegida", config.OBSERVABILITY_TOKEN ? "Token de métricas configurado." : "Endpoint de métricas sem credencial operacional.", config.OBSERVABILITY_TOKEN ? null : "Gere OBSERVABILITY_TOKEN no Render."));
  const emailReady = Boolean(config.EMAIL_RELAY_URL && config.EMAIL_RELAY_KEY);
  checks.push(check("email-relay", "INTEGRATIONS", emailReady ? "PASS" : "BLOCKED", "E-mail transacional", emailReady ? "Relay e credencial configurados." : "Convites e avisos ainda dependem de envio manual.", emailReady ? null : "Configure EMAIL_RELAY_URL, EMAIL_RELAY_KEY e EMAIL_FROM."));
  const billingReady = Boolean(config.BILLING_WEBHOOK_SECRET && config.BILLING_RELAY_URL && config.BILLING_RELAY_KEY);
  checks.push(check("billing-gateway", "INTEGRATIONS", billingReady ? "PASS" : "BLOCKED", "Gateway de cobrança", billingReady ? "Envio e retorno financeiro autenticados." : "Cobrança automática ainda não está completamente conectada.", billingReady ? null : "Configure o relay de cobrança e o segredo do webhook."));
  const recoveryReady = config.DATABASE_RECOVERY_MODE === "PITR" && config.DATABASE_RECOVERY_WINDOW_DAYS > 0;
  checks.push(check("managed-recovery", "RECOVERY", recoveryReady ? "PASS" : "BLOCKED", "Recuperação do banco", recoveryReady ? `PITR declarado por ${config.DATABASE_RECOVERY_WINDOW_DAYS} dia(s).` : "Nenhuma janela de restauração gerenciada declarada.", recoveryReady ? null : "Migre o PostgreSQL para plano pago, ative PITR e atualize as variáveis de recuperação."));
  checks.push(check("fiscal-secret-vault", "FISCAL", config.DFE_CERTIFICATE_ENCRYPTION_KEY ? "PASS" : "BLOCKED", "Cofre do certificado fiscal", config.DFE_CERTIFICATE_ENCRYPTION_KEY ? "Chave de criptografia configurada fora do código." : "Certificado A1 e CSC não podem ser protegidos.", config.DFE_CERTIFICATE_ENCRYPTION_KEY ? null : "Gere DFE_CERTIFICATE_ENCRYPTION_KEY no Render e não a copie para a Vercel."));
  const dfeReady = Boolean(config.DFE_ENABLE_SEFAZ_TRANSMISSION && config.DFE_DISTRIBUTION_URL_PRODUCTION && config.DFE_EVENT_URL_PRODUCTION);
  checks.push(check("dfe-sefaz", "FISCAL", dfeReady ? "PASS" : "BLOCKED", "Distribuição e manifestação DF-e", dfeReady ? "Transmissão e endpoints de produção habilitados." : "Distribuição ou manifestação SEFAZ ainda está bloqueada.", dfeReady ? null : "Homologue certificado e endpoints; só depois habilite DFE_ENABLE_SEFAZ_TRANSMISSION."));
  const nfceConfigured = config.NFCE_ENABLE_SEFAZ_TRANSMISSION && config.NFCE_ALLOW_PRODUCTION_PREPARATION && !config.NFCE_SCHEMA_VERSION.startsWith("local-");
  checks.push(check("nfce-sefaz", "FISCAL", "BLOCKED", "Emissão NFC-e", nfceConfigured ? "Variáveis externas foram habilitadas, mas o adaptador do código ainda bloqueia a transmissão." : "O emissor permanece local, sem assinatura/XSD/autorização SEFAZ.", "Implemente assinatura, XSD, QR Code/DANFE e autorização em homologação; depois substitua o bloqueio explícito do adaptador."));

  try {
    const started = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Math.round(performance.now() - started);
    checks.push(check("database-connection", "DATABASE", "PASS", "Conexão PostgreSQL", `Banco respondeu em ${latency} ms.`));

    try {
      const [expected, applied] = await Promise.all([
        expectedMigrations(),
        prisma.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      ]);
      const appliedNames = new Set(applied.map((item) => item.migration_name));
      const pending = expected.filter((name) => !appliedNames.has(name));
      checks.push(check("database-migrations", "DATABASE", pending.length ? "BLOCKED" : "PASS", "Migrations Prisma", pending.length ? `${pending.length} migration(s) pendente(s): ${pending.join(", ")}.` : `${expected.length} migration(s) aplicadas.`, pending.length ? "Execute prisma migrate deploy antes de liberar tráfego." : null));
    } catch {
      checks.push(check("database-migrations", "DATABASE", "BLOCKED", "Migrations Prisma", "Não foi possível comprovar o histórico de migrations.", "Valide a tabela _prisma_migrations e execute prisma migrate deploy."));
    }

    const privilegedWhere: Prisma.UserWhereInput = { OR: [{ systemRole: { not: "CUSTOMER" } }, { memberships: { some: { active: true, role: { in: ["OWNER", "ADMIN"] } } } }] };
    const [plans, activeAdmins, privilegedUsers, privilegedMfa, recentDrill, lastDailyJob] = await Promise.all([
      prisma.plan.findMany({ where: { code: { in: expectedPlans }, active: true }, select: { code: true } }),
      prisma.user.count({ where: { systemRole: "INTERNAL_ADMIN", status: "ACTIVE" } }),
      prisma.user.count({ where: { status: "ACTIVE", ...privilegedWhere } }),
      prisma.user.count({ where: { status: "ACTIVE", ...privilegedWhere, mfaMethod: { is: { status: "ACTIVE" } } } }),
      prisma.recoveryDrill.findFirst({ where: { status: "PASSED", completedAt: { gte: new Date(Date.now() - 90 * DAY) } }, select: { completedAt: true }, orderBy: { completedAt: "desc" } }),
      prisma.backgroundJobRun.findFirst({ where: { jobName: "DAILY_BUSINESS_AUTOMATION", status: "COMPLETED" }, select: { finishedAt: true }, orderBy: { finishedAt: "desc" } }),
    ]);
    const planCodes = new Set(plans.map((plan) => plan.code));
    const missingPlans = expectedPlans.filter((code) => !planCodes.has(code));
    checks.push(check("commercial-plans", "DATABASE", missingPlans.length ? "BLOCKED" : "PASS", "Planos comerciais", missingPlans.length ? `Faltam planos ativos: ${missingPlans.join(", ")}.` : "Quatro planos comerciais ativos.", missingPlans.length ? "Execute o seed idempotente do ambiente." : null));
    checks.push(check("internal-admin", "ACCESS", activeAdmins > 0 ? "PASS" : "BLOCKED", "Administrador interno", activeAdmins > 0 ? `${activeAdmins} administrador(es) ativo(s).` : "Nenhum administrador interno ativo.", activeAdmins > 0 ? null : "Crie o primeiro administrador pelo seed e remova a senha do ambiente."));
    const privilegedMfaReady = privilegedUsers > 0 && privilegedUsers === privilegedMfa;
    checks.push(check("privileged-mfa", "ACCESS", privilegedMfaReady ? "PASS" : "BLOCKED", "MFA em perfis privilegiados", privilegedMfaReady ? `${privilegedMfa} de ${privilegedUsers} usuário(s) privilegiado(s) protegido(s).` : `${privilegedMfa} de ${privilegedUsers} usuário(s) privilegiado(s) estão com MFA ativo.`, privilegedMfaReady ? null : "Ative o MFA de administradores internos, proprietários e administradores das empresas antes do piloto."));
    checks.push(check("recovery-drill", "RECOVERY", recentDrill ? "PASS" : "BLOCKED", "Teste de restauração", recentDrill?.completedAt ? `Último teste aprovado em ${recentDrill.completedAt.toISOString()}.` : "Não existe teste aprovado nos últimos 90 dias.", recentDrill ? null : "Restaure um backup em ambiente isolado e registre RPO, RTO e evidências."));
    const dailyRecent = Boolean(lastDailyJob?.finishedAt && lastDailyJob.finishedAt > new Date(Date.now() - 36 * 60 * 60 * 1000));
    checks.push(check("daily-automation", "OPERATIONS", dailyRecent ? "PASS" : "WARN", "Automação diária", dailyRecent ? `Última execução em ${lastDailyJob!.finishedAt!.toISOString()}.` : "Ainda não há execução concluída nas últimas 36 horas.", dailyRecent ? null : "Confirme o Cron Job da Render e execute uma rodada controlada."));
  } catch {
    checks.push(check("database-connection", "DATABASE", "BLOCKED", "Conexão PostgreSQL", "A API não conseguiu consultar o banco.", "Verifique DATABASE_URL, disponibilidade e regras de rede."));
    checks.push(check("database-dependent", "DATABASE", "BLOCKED", "Validações persistidas", "Planos, administrador, migrations e testes não puderam ser conferidos.", "Restabeleça a conexão e execute o preflight novamente."));
  }

  const summary = {
    pass: checks.filter((item) => item.status === "PASS").length,
    warn: checks.filter((item) => item.status === "WARN").length,
    blocked: checks.filter((item) => item.status === "BLOCKED").length,
  };
  return { generatedAt: new Date(), stage: config.DEPLOYMENT_STAGE, ready: summary.blocked === 0, summary, checks };
}
