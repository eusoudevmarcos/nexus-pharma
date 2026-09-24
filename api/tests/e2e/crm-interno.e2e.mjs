// E2E do escopo Gestor/Colaborador do CRM interno (Comercial, Suporte, Equipe).
// Precisa de um Postgres REAL — por isso fica fora de tests/*.test.mjs e não
// roda no CI. Cria fixtures com sufixo único, exercita as rotas reais via
// app.inject e apaga tudo no final. Uso (de dentro de api/): npm run test:e2e:crm
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { randomBytes, randomUUID } from "node:crypto";

// Trava: este teste grava e apaga linhas de verdade — só em banco local.
const dbHost = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "[::1]"].includes(dbHost) && process.env.E2E_ALLOW_REMOTE_DB !== "1") {
  console.error(`Recusado: DATABASE_URL aponta para "${dbHost || "?"}". Este e2e só roda em banco local (ou com E2E_ALLOW_REMOTE_DB=1).`);
  process.exit(1);
}

const { config } = await import("../../dist/config.js");
const { prisma } = await import("../../dist/infra/prisma.js");
const { internalRoutes } = await import("../../dist/routes/internal.routes.js");

const app = Fastify({ logger: false });
await app.register(jwt, {
  secret: config.JWT_SECRET,
  sign: { expiresIn: "15m", iss: config.JWT_ISSUER, aud: config.JWT_AUDIENCE },
  verify: { allowedIss: config.JWT_ISSUER, allowedAud: config.JWT_AUDIENCE },
});
await app.register(internalRoutes, { prefix: "/api/v1/interno" });
await app.ready();

const tag = `e2e-crm-${randomBytes(4).toString("hex")}`;
const users = {};
const companies = {};
const tickets = {};
let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ""}`); }
}

async function makeUser(key, systemRole, seniority, { mfa = false } = {}) {
  const user = await prisma.user.create({
    data: { email: `${tag}-${key}@teste.local`, name: `${tag} ${key}`, systemRole, seniority, status: "ACTIVE" },
  });
  if (mfa) await prisma.userMfaMethod.create({ data: { userId: user.id, status: "ACTIVE", encryptedSecret: "e2e" } });
  users[key] = user;
  return user;
}

async function tokenFor(user, { mfaVerified = false } = {}) {
  const session = await prisma.authSession.create({
    data: {
      userId: user.id, refreshTokenHash: randomBytes(32).toString("hex"),
      expiresAt: new Date(Date.now() + 3600_000), mfaVerifiedAt: mfaVerified ? new Date() : null,
    },
  });
  return app.jwt.sign({ sub: user.id, sid: session.id, email: user.email, systemRole: user.systemRole });
}

async function call(token, method, url, payload) {
  const res = await app.inject({ method, url: `/api/v1/interno${url}`, headers: { authorization: `Bearer ${token}` }, ...(payload && { payload }) });
  let body = null;
  try { body = res.json(); } catch {}
  return { status: res.statusCode, body };
}

try {
  // ---------- fixtures ----------
  const admin = await makeUser("admin", "INTERNAL_ADMIN", "GESTOR", { mfa: true });
  const adminNoMfa = await makeUser("admin-sem-mfa", "INTERNAL_ADMIN", "GESTOR");
  const gestor = await makeUser("gestor-com", "COMMERCIAL", "GESTOR");
  const colab = await makeUser("colab-com", "COMMERCIAL", "COLABORADOR");
  const customer = await makeUser("cliente", "CUSTOMER", "GESTOR");
  const dev = await makeUser("dev", "DEVELOPER", "GESTOR");
  const helpGestor = await makeUser("gestor-sup", "HELPDESK", "GESTOR");
  const helpColab = await makeUser("colab-sup", "HELPDESK", "COLABORADOR");

  companies.A = await prisma.company.create({ data: { legalName: `${tag} A`, tradeName: `${tag} A`, commercialOwnerId: colab.id } });
  companies.B = await prisma.company.create({ data: { legalName: `${tag} B`, tradeName: `${tag} B`, commercialOwnerId: gestor.id } });
  tickets.mine = await prisma.supportTicket.create({ data: { code: `${tag}-1`.slice(0, 24), createdById: admin.id, assignedToId: helpColab.id, subject: "e2e mine", description: "e2e" } });
  tickets.other = await prisma.supportTicket.create({ data: { code: `${tag}-2`.slice(0, 24), createdById: admin.id, assignedToId: helpGestor.id, subject: "e2e other", description: "e2e" } });

  const tAdmin = await tokenFor(admin, { mfaVerified: true });
  const tAdminStale = await tokenFor(admin, { mfaVerified: false });
  const tAdminNoMfa = await tokenFor(adminNoMfa, { mfaVerified: false });
  const tGestor = await tokenFor(gestor);
  const tColab = await tokenFor(colab);
  const tHelpGestor = await tokenFor(helpGestor);
  const tHelpColab = await tokenFor(helpColab);

  const pipelineIds = (r) => new Set((r.body?.pipeline ?? []).map((c) => c.id));

  // ---------- Comercial ----------
  console.log("Comercial");
  let r = await call(tColab, "GET", "/comercial");
  check("colaborador lista só a própria carteira (A sim, B não)", r.status === 200 && pipelineIds(r).has(companies.A.id) && !pipelineIds(r).has(companies.B.id), JSON.stringify([r.status, [...pipelineIds(r)].length]));
  check("colaborador recebe isColaborador=true", r.body?.isColaborador === true);
  check("indicadores do colaborador contam só a carteira dele", Object.values(r.body?.indicators ?? {}).reduce((a, b) => a + b, 0) === pipelineIds(r).size, JSON.stringify(r.body?.indicators));

  r = await call(tGestor, "GET", "/comercial");
  check("gestor vê a carteira toda (A e B)", r.status === 200 && pipelineIds(r).has(companies.A.id) && pipelineIds(r).has(companies.B.id));
  check("gestor recebe isColaborador=false", r.body?.isColaborador === false);
  const agentIds = new Set((r.body?.agents ?? []).map((a) => a.id));
  check("agents inclui comercial + diretoria e exclui cliente/dev", agentIds.has(gestor.id) && agentIds.has(colab.id) && agentIds.has(admin.id) && !agentIds.has(customer.id) && !agentIds.has(dev.id));

  r = await call(tColab, "PATCH", `/comercial/empresas/${companies.B.id}`, { status: "ACTIVE" });
  check("colaborador não edita empresa fora da carteira (403)", r.status === 403 && r.body?.erro === "EMPRESA_FORA_DA_SUA_CARTEIRA", JSON.stringify(r));
  r = await call(tColab, "POST", `/comercial/empresas/${companies.B.id}/lojas`, { codigo: "X1", nome: "Loja X" });
  check("colaborador não cria loja fora da carteira (403)", r.status === 403 && r.body?.erro === "EMPRESA_FORA_DA_SUA_CARTEIRA", JSON.stringify(r));
  r = await call(tColab, "PATCH", `/comercial/empresas/${companies.A.id}`, { responsavel_comercial_id: gestor.id });
  check("colaborador não reatribui responsável (403)", r.status === 403 && r.body?.erro === "SOMENTE_GESTOR_REATRIBUI_RESPONSAVEL", JSON.stringify(r));
  r = await call(tColab, "PATCH", `/comercial/empresas/${companies.A.id}`, { etapa_onboarding: 3 });
  check("colaborador edita a própria empresa (200)", r.status === 200, JSON.stringify(r));

  r = await call(tGestor, "PATCH", `/comercial/empresas/${companies.A.id}`, { responsavel_comercial_id: customer.id });
  check("reatribuir para usuário de farmácia é recusado (400)", r.status === 400 && r.body?.erro === "RESPONSAVEL_INVALIDO", JSON.stringify(r));
  r = await call(tGestor, "PATCH", `/comercial/empresas/${companies.A.id}`, { responsavel_comercial_id: dev.id });
  check("reatribuir para outro departamento é recusado (400)", r.status === 400 && r.body?.erro === "RESPONSAVEL_INVALIDO", JSON.stringify(r));
  r = await call(tGestor, "PATCH", `/comercial/empresas/${companies.A.id}`, { responsavel_comercial_id: randomUUID() });
  check("reatribuir para UUID inexistente dá 400, não 500", r.status === 400 && r.body?.erro === "RESPONSAVEL_INVALIDO", JSON.stringify(r));
  r = await call(tGestor, "PATCH", `/comercial/empresas/${companies.A.id}`, { responsavel_comercial_id: gestor.id });
  check("gestor reatribui A para si (200)", r.status === 200, JSON.stringify(r));
  r = await call(tColab, "GET", "/comercial");
  check("após reatribuição, A some da carteira do colaborador", r.status === 200 && !pipelineIds(r).has(companies.A.id));
  r = await call(tGestor, "PATCH", `/comercial/empresas/${companies.A.id}`, { responsavel_comercial_id: null });
  check("gestor deixa A sem responsável (200)", r.status === 200 && r.body?.commercialOwnerId === null, JSON.stringify(r.body?.commercialOwnerId));
  const history = await prisma.auditLog.findFirst({ where: { companyId: companies.A.id, action: { not: "COMPANY_CREATED" } }, orderBy: { createdAt: "desc" } });
  check("auditoria registra antes/depois do responsável", history?.before?.commercialOwnerId === gestor.id && history?.after?.commercialOwnerId === null, JSON.stringify([history?.before, history?.after]));

  // ---------- Suporte ----------
  console.log("Suporte");
  const ticketIds = (res) => new Set((res.body?.tickets ?? []).map((t) => t.id));
  r = await call(tHelpColab, "GET", "/suporte");
  check("colaborador do suporte vê só os tickets dele", r.status === 200 && ticketIds(r).has(tickets.mine.id) && !ticketIds(r).has(tickets.other.id));
  check("colaborador do suporte recebe isColaborador=true", r.body?.isColaborador === true);
  r = await call(tHelpGestor, "GET", "/suporte");
  check("gestor do suporte vê a fila inteira", r.status === 200 && ticketIds(r).has(tickets.mine.id) && ticketIds(r).has(tickets.other.id));
  r = await call(tHelpColab, "GET", `/suporte/tickets/${tickets.other.id}`);
  check("colaborador não abre ticket alheio (403)", r.status === 403 && r.body?.erro === "TICKET_FORA_DA_SUA_FILA", JSON.stringify(r));
  r = await call(tHelpColab, "POST", `/suporte/tickets/${tickets.other.id}/mensagens`, { mensagem: "mensagem de teste e2e", somente_interno: true });
  check("colaborador não responde ticket alheio (403)", r.status === 403 && r.body?.erro === "TICKET_FORA_DA_SUA_FILA", JSON.stringify(r));
  r = await call(tHelpColab, "PATCH", `/suporte/tickets/${tickets.mine.id}`, { responsavel_id: helpGestor.id });
  check("colaborador não repassa o próprio ticket (403)", r.status === 403 && r.body?.erro === "SOMENTE_GESTOR_REATRIBUI_TICKET", JSON.stringify(r));
  r = await call(tHelpColab, "PATCH", `/suporte/tickets/${tickets.mine.id}`, { prioridade: "HIGH" });
  check("colaborador altera o próprio ticket (200)", r.status === 200, JSON.stringify(r));

  // ---------- Equipe (senioridade/suspensão) ----------
  console.log("Equipe");
  r = await call(tAdminNoMfa, "PATCH", `/equipe/${colab.id}`, { senioridade: "GESTOR" });
  check("admin sem MFA configurado é barrado", r.status === 403 && r.body?.erro === "MFA_CONFIGURACAO_OBRIGATORIA", JSON.stringify(r));
  r = await call(tAdminStale, "PATCH", `/equipe/${colab.id}`, { senioridade: "GESTOR" });
  check("admin sem confirmação recente de MFA é barrado", r.status === 403 && r.body?.erro === "MFA_CONFIRMACAO_RECENTE_OBRIGATORIA", JSON.stringify(r));
  r = await call(tGestor, "PATCH", `/equipe/${colab.id}`, { senioridade: "GESTOR" });
  check("gestor comercial não gerencia equipe (403)", r.status === 403 && r.body?.erro === "PERFIL_NAO_AUTORIZADO", JSON.stringify(r));
  r = await call(tAdmin, "PATCH", `/equipe/${adminNoMfa.id}`, { senioridade: "COLABORADOR" });
  check("diretoria não tem senioridade ajustável (409)", r.status === 409 && r.body?.erro === "DIRETORIA_NAO_TEM_SENIORIDADE_AJUSTAVEL", JSON.stringify(r));
  r = await call(tAdmin, "PATCH", `/equipe/${customer.id}`, { senioridade: "GESTOR" });
  check("usuário de farmácia não é gerenciado por aqui (404)", r.status === 404 && r.body?.erro === "MEMBRO_NAO_ENCONTRADO", JSON.stringify(r));
  r = await call(tAdmin, "PATCH", `/equipe/${colab.id}`, {});
  check("patch vazio é recusado (400)", r.status === 400, JSON.stringify(r));

  r = await call(tAdmin, "PATCH", `/equipe/${colab.id}`, { senioridade: "GESTOR" });
  check("admin promove colaborador a gestor (200)", r.status === 200 && r.body?.seniority === "GESTOR", JSON.stringify(r));
  r = await call(tColab, "GET", "/comercial");
  check("promoção vale na hora, com o MESMO token (vê B)", r.status === 200 && r.body?.isColaborador === false && pipelineIds(r).has(companies.B.id));

  r = await call(tAdmin, "GET", "/equipe");
  const listed = (r.body?.staff ?? []).find((m) => m.id === colab.id);
  check("GET /equipe devolve seniority", r.status === 200 && listed?.seniority === "GESTOR", JSON.stringify(listed));

  r = await call(tAdmin, "PATCH", `/equipe/${colab.id}`, { status: "SUSPENDED" });
  check("admin suspende membro (200)", r.status === 200 && r.body?.status === "SUSPENDED", JSON.stringify(r));
  r = await call(tColab, "GET", "/comercial");
  check("suspensão derruba o acesso no request seguinte (401)", r.status === 401, JSON.stringify(r));
  const staffAudit = await prisma.auditLog.count({ where: { action: "INTERNAL_STAFF_UPDATED", entityId: colab.id } });
  check("auditoria INTERNAL_STAFF_UPDATED gravada (2x)", staffAudit === 2, String(staffAudit));
} catch (error) {
  failed++;
  console.error("ERRO INESPERADO:", error);
} finally {
  const userIds = Object.values(users).map((u) => u.id);
  const companyIds = Object.values(companies).map((c) => c.id);
  await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { companyId: { in: companyIds } }, { entityId: { in: [...userIds, ...companyIds] } }] } });
  await prisma.ticketMessage.deleteMany({ where: { ticket: { createdById: { in: userIds } } } });
  await prisma.supportTicket.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userMfaMethod.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  const leftover = await prisma.user.count({ where: { email: { startsWith: tag } } });
  console.log(`\nlimpeza: ${leftover === 0 ? "ok (nenhuma fixture restante)" : `${leftover} usuários restantes!`}`);
  console.log(`resultado: ${passed} ok, ${failed} falha(s)`);
  await app.close();
  await prisma.$disconnect();
  process.exitCode = failed ? 1 : 0;
}
