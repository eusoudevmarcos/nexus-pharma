// E2E do painel da indústria/distribuição (Prime) contra um Postgres REAL.
// Prova isolamento: organização só vê farmácias vinculadas; laboratório só vê
// os próprios produtos (prefixo GS1); farmácia suspende e o dado some na hora;
// painel é só leitura; equipe gerenciada por Responsável/Administrador.
// Fica fora de tests/*.test.mjs (não roda no CI). Uso (em api/): npm run test:e2e:prime
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { randomBytes, randomUUID } from "node:crypto";

const dbHost = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "[::1]"].includes(dbHost) && process.env.E2E_ALLOW_REMOTE_DB !== "1") {
  console.error(`Recusado: DATABASE_URL aponta para "${dbHost || "?"}". Este e2e só roda em banco local (ou com E2E_ALLOW_REMOTE_DB=1).`);
  process.exit(1);
}
// Convites deste teste nunca saem por e-mail, mesmo com relay configurado.
process.env.EMAIL_RELAY_URL = "";

const { config } = await import("../../dist/config.js");
const { prisma } = await import("../../dist/infra/prisma.js");
const { internalRoutes } = await import("../../dist/routes/internal.routes.js");
const { primeRoutes } = await import("../../dist/routes/prime.routes.js");
const { usersRoutes } = await import("../../dist/routes/users.routes.js");

const app = Fastify({ logger: false });
await app.register(jwt, {
  secret: config.JWT_SECRET,
  sign: { expiresIn: "15m", iss: config.JWT_ISSUER, aud: config.JWT_AUDIENCE },
  verify: { allowedIss: config.JWT_ISSUER, allowedAud: config.JWT_AUDIENCE },
});
await app.register(internalRoutes, { prefix: "/api/v1/interno" });
await app.register(primeRoutes, { prefix: "/api/v1/prime" });
await app.register(usersRoutes, { prefix: "/api/v1/usuarios" });
await app.ready();

const tag = `e2e-prime-${randomBytes(4).toString("hex")}`;
const userIds = new Set();
const companyIds = [];
const orgIds = [];
let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ""}`); }
}

async function makeUser(key, systemRole, { mfa = false, seniority = "GESTOR" } = {}) {
  const user = await prisma.user.create({ data: { email: `${tag}-${key}@teste.local`, name: `${tag} ${key}`, systemRole, seniority, status: "ACTIVE" } });
  if (mfa) await prisma.userMfaMethod.create({ data: { userId: user.id, status: "ACTIVE", encryptedSecret: "e2e" } });
  userIds.add(user.id);
  return user;
}
async function enableMfa(user) {
  await prisma.userMfaMethod.upsert({ where: { userId: user.id }, create: { userId: user.id, status: "ACTIVE", encryptedSecret: "e2e" }, update: { status: "ACTIVE" } });
}
async function tokenFor(user, { mfaVerified = false } = {}) {
  const session = await prisma.authSession.create({ data: { userId: user.id, refreshTokenHash: randomBytes(32).toString("hex"), expiresAt: new Date(Date.now() + 3600_000), mfaVerifiedAt: mfaVerified ? new Date() : null } });
  return app.jwt.sign({ sub: user.id, sid: session.id, email: user.email, systemRole: user.systemRole });
}
async function call(token, method, url, payload, headers = {}) {
  const res = await app.inject({ method, url, headers: { authorization: `Bearer ${token}`, ...headers }, ...(payload && { payload }) });
  let body = null;
  try { body = res.json(); } catch {}
  return { status: res.statusCode, body };
}

async function makePharmacy(key, city, state) {
  const company = await prisma.company.create({ data: { legalName: `${tag} ${key}`, tradeName: `${tag} ${key}`, status: "ACTIVE", city, state } });
  companyIds.push(company.id);
  const store = await prisma.store.create({ data: { companyId: company.id, code: "MATRIZ", name: "Matriz", type: "MAIN" } });
  const category = await prisma.fiscalCategory.create({ data: { companyId: company.id, code: "E2E", name: "Medicamentos", ncm: "30049099", classification: "LISTA_POSITIVA", ruleVersion: "e2e", validFrom: new Date("2026-01-01") } });
  return { company, store, category };
}
async function stockAndSell(pharmacy, ean, name, laboratory, stock, soldToday) {
  const product = await prisma.product.create({ data: { companyId: pharmacy.company.id, categoryId: pharmacy.category.id, ean, name, laboratory, minimumStock: 5 } });
  if (stock > 0) {
    const lot = await prisma.inventoryLot.create({ data: { productId: product.id, code: "L1", manufacturedAt: new Date("2026-01-01"), expiresAt: new Date("2028-12-31"), unitCost: 10 } });
    await prisma.storeStockBalance.create({ data: { companyId: pharmacy.company.id, storeId: pharmacy.store.id, productId: product.id, lotId: lot.id, onHand: stock } });
  }
  if (soldToday > 0) {
    const sale = await prisma.sale.create({ data: { companyId: pharmacy.company.id, idempotencyKey: randomUUID(), grossAmount: 10 * soldToday, originalGrossAmount: 10 * soldToday, costAmount: 5 * soldToday, status: "COMPLETED", soldAt: new Date() } });
    await prisma.saleItem.create({ data: { saleId: sale.id, productId: product.id, ean, productName: name, categoryCode: "E2E", categoryName: "Medicamentos", ncm: "30049099", quantity: soldToday, unitPrice: 10, originalUnitPrice: 10, unitCost: 5, cfop: "5102", cstIcms: "00", cstPis: "01", cstCofins: "01", cstIbsCbs: "000", taxClassification: "e2e", ruleVersion: "e2e" } });
  }
  return product;
}
const tokenFromInvite = (inviteUrl) => new URL(inviteUrl).searchParams.get("token");
async function acceptInvite(inviteUrl, name) {
  const res = await app.inject({ method: "POST", url: "/api/v1/usuarios/convites/aceitar", payload: { token: tokenFromInvite(inviteUrl), nome: name, senha: "SenhaForte12345" } });
  const body = res.json();
  if (body?.user?.id) userIds.add(body.user.id);
  return { status: res.statusCode, body };
}

const OWN_1 = "7891234000017";
const OWN_2 = "7891234000024";
const RIVAL = "7899999000013";
const eans = (res) => new Set((res.body?.live?.products ?? []).map((row) => row.ean));
const pharmacyNames = (res) => new Set((res.body?.live?.pharmacyRows ?? []).map((row) => row.tradeName));

try {
  // ---------- fixtures ----------
  const admin = await makeUser("diretoria", "INTERNAL_ADMIN", { mfa: true });
  const comGestor = await makeUser("com-gestor", "COMMERCIAL", { mfa: true });
  const comColab = await makeUser("com-colab", "COMMERCIAL", { seniority: "COLABORADOR" });
  const tAdmin = await tokenFor(admin, { mfaVerified: true });
  const tGestor = await tokenFor(comGestor, { mfaVerified: true });
  const tColab = await tokenFor(comColab);

  const A = await makePharmacy("A", "Campinas", "SP");
  const B = await makePharmacy("B", "Niteroi", "RJ");
  const C = await makePharmacy("C", "Recife", "PE");
  await stockAndSell(A, OWN_1, "Produto Proprio 1", "Lab E2E", 20, 3);
  await stockAndSell(A, OWN_2, "Produto Proprio 2", "Lab E2E", 0, 0);
  await stockAndSell(A, RIVAL, "Produto Concorrente", "Concorrente SA", 50, 7);
  await stockAndSell(B, OWN_1, "Produto Proprio 1", "Lab E2E", 8, 2);
  await stockAndSell(B, RIVAL, "Produto Concorrente", "Concorrente SA", 5, 1);
  await stockAndSell(C, OWN_1, "Produto Proprio 1", "Lab E2E", 100, 10);

  const pharmacyOwner = await makeUser("dono-farmacia-A", "CUSTOMER");
  await prisma.membership.create({ data: { companyId: A.company.id, userId: pharmacyOwner.id, role: "OWNER", active: true } });
  const tPharmacy = await tokenFor(pharmacyOwner);
  const pharmacyHeaders = { "x-company-id": A.company.id };

  // ---------- gestão pela Nexus ----------
  console.log("Gestão (Central Nexus)");
  let r = await call(tColab, "GET", "/api/v1/interno/industria");
  check("colaborador do Comercial não gerencia indústria (403)", r.status === 403 && r.body?.erro === "SOMENTE_GESTOR_GERENCIA_INDUSTRIA", JSON.stringify(r));
  r = await call(tGestor, "POST", "/api/v1/interno/industria/organizacoes", { codigo: `${tag}-X`, razao_social: "Lab X", nome_fantasia: "Lab X", tipo: "LABORATORY", prefixos_gs1: ["789"] });
  check("prefixo GS1 curto demais é recusado (400)", r.status === 400, JSON.stringify(r.body?.erro));
  r = await call(tGestor, "POST", "/api/v1/interno/industria/organizacoes", { codigo: `${tag}-LAB`, razao_social: `${tag} Laboratorio`, nome_fantasia: `${tag} Laboratorio`, tipo: "LABORATORY", prefixos_gs1: ["7891234"] });
  check("gestor comercial cadastra laboratório (201, escopo OWN)", r.status === 201 && r.body?.scope?.mode === "OWN" && r.body.scope.gs1Prefixes?.[0] === "7891234", JSON.stringify(r.body));
  const lab = r.body; orgIds.push(lab?.id);
  r = await call(tGestor, "POST", "/api/v1/interno/industria/organizacoes", { codigo: `${tag}-DIST`, razao_social: `${tag} Distribuidora`, nome_fantasia: `${tag} Distribuidora`, tipo: "DISTRIBUTOR" });
  check("gestor comercial cadastra distribuidora (201, escopo ALL)", r.status === 201 && r.body?.scope?.mode === "ALL", JSON.stringify(r.body));
  const dist = r.body; orgIds.push(dist?.id);
  r = await call(tGestor, "POST", "/api/v1/interno/industria/organizacoes", { codigo: `${tag}-LAB`, razao_social: "dup", nome_fantasia: "dup", tipo: "LABORATORY" });
  check("código duplicado é recusado (409)", r.status === 409 && r.body?.erro === "ORGANIZACAO_PRIME_JA_EXISTE", JSON.stringify(r));

  const tGestorSemMfa = await tokenFor(comGestor, { mfaVerified: false });
  r = await call(tGestorSemMfa, "PUT", `/api/v1/interno/industria/organizacoes/${lab.id}/conexoes`, { empresa_id: A.company.id, status: "ACTIVE" });
  check("vincular farmácia exige MFA recente", r.status === 403 && r.body?.erro === "MFA_CONFIRMACAO_RECENTE_OBRIGATORIA", JSON.stringify(r));
  for (const [org, pharmacy] of [[lab, A], [lab, B], [dist, A]]) {
    r = await call(tGestor, "PUT", `/api/v1/interno/industria/organizacoes/${org.id}/conexoes`, { empresa_id: pharmacy.company.id, status: "ACTIVE" });
    check(`vínculo ${org.tradeName.slice(-12)} ⇄ farmácia ${pharmacy.company.tradeName.slice(-1)} (200)`, r.status === 200 && r.body?.status === "ACTIVE", JSON.stringify(r));
  }

  r = await call(tGestor, "POST", `/api/v1/interno/industria/organizacoes/${lab.id}/convites`, { email: `${tag}-lab-owner@teste.local`, perfil: "OWNER" });
  check("Nexus convida o responsável do laboratório (201 + link)", r.status === 201 && typeof r.body?.inviteUrl === "string", JSON.stringify(r));
  const labOwnerInvite = r.body?.inviteUrl;
  r = await call(tGestor, "POST", `/api/v1/interno/industria/organizacoes/${lab.id}/convites`, { email: `${tag}-lab-owner@teste.local`, perfil: "OWNER" });
  check("convite repetido é recusado (409)", r.status === 409 && r.body?.erro === "CONVITE_JA_ENVIADO", JSON.stringify(r));
  r = await call(tGestor, "POST", `/api/v1/interno/industria/organizacoes/${dist.id}/convites`, { email: `${tag}-dist-owner@teste.local`, perfil: "OWNER" });
  const distOwnerInvite = r.body?.inviteUrl;

  // ---------- aceite ----------
  console.log("Aceite do convite");
  r = await acceptInvite(labOwnerInvite, "Responsavel Lab");
  check("aceite cria a conta do responsável do laboratório", r.status === 200 && r.body?.accepted === true && r.body?.company === `${tag} Laboratorio`, JSON.stringify(r));
  const labOwner = await prisma.user.findUnique({ where: { email: `${tag}-lab-owner@teste.local` } });
  const membership = labOwner && await prisma.primeMembership.findUnique({ where: { organizationId_userId: { organizationId: lab.id, userId: labOwner.id } } });
  check("vínculo Prime criado como Responsável, conta de cliente comum", membership?.role === "OWNER" && membership.active && labOwner.systemRole === "CUSTOMER");
  const pharmacyMemberships = labOwner ? await prisma.membership.count({ where: { userId: labOwner.id } }) : -1;
  check("usuário da indústria NÃO vira membro de farmácia", pharmacyMemberships === 0, String(pharmacyMemberships));
  r = await acceptInvite(labOwnerInvite, "De novo");
  check("link de convite só funciona uma vez (410)", r.status === 410);
  await acceptInvite(distOwnerInvite, "Responsavel Dist");
  const distOwner = await prisma.user.findUnique({ where: { email: `${tag}-dist-owner@teste.local` } });

  // ---------- painel: isolamento e escopo ----------
  console.log("Painel da indústria (isolamento e escopo)");
  const tLabNoMfa = await tokenFor(labOwner);
  r = await call(tLabNoMfa, "GET", "/api/v1/prime/dashboard");
  check("painel exige MFA configurado", r.status === 403 && r.body?.erro === "MFA_CONFIGURACAO_OBRIGATORIA", JSON.stringify(r));
  await enableMfa(labOwner); await enableMfa(distOwner);
  const tLab = await tokenFor(labOwner, { mfaVerified: true });
  const tDist = await tokenFor(distOwner, { mfaVerified: true });

  r = await call(tLab, "GET", "/api/v1/prime/dashboard");
  check("laboratório vê só os próprios produtos (sem o concorrente)", r.status === 200 && eans(r).has(OWN_1) && eans(r).has(OWN_2) && !eans(r).has(RIVAL), JSON.stringify([...eans(r)]));
  check("laboratório vê só as farmácias vinculadas (A e B, não C)", pharmacyNames(r).has(`${tag} A`) && pharmacyNames(r).has(`${tag} B`) && !pharmacyNames(r).has(`${tag} C`), JSON.stringify([...pharmacyNames(r)]));
  check("sell-out de hoje soma só produto próprio em farmácia vinculada (3+2)", r.body?.live?.sellOut?.today === 5, JSON.stringify(r.body?.live?.sellOut));
  check("estoque na rede soma só o escopo (20+0+8)", r.body?.live?.stockUnits === 28, String(r.body?.live?.stockUnits));
  check("ruptura detectada (produto 2 zerado na farmácia A)", r.body?.live?.ruptures === 1, String(r.body?.live?.ruptures));
  check("sinais do radar também respeitam o escopo", (r.body?.opportunities ?? []).length > 0 && r.body.opportunities.every((item) => item.product.ean.startsWith("7891234")), JSON.stringify((r.body?.opportunities ?? []).map((o) => o.product.ean)));
  check("painel informa escopo e perfil do usuário", r.body?.scope?.mode === "OWN" && r.body?.viewer?.canManage === true, JSON.stringify([r.body?.scope, r.body?.viewer]));
  check("nada de preço ou custo no painel", !JSON.stringify(r.body).match(/unitPrice|unitCost|grossAmount|costAmount|margin/i));

  r = await call(tDist, "GET", "/api/v1/prime/dashboard");
  check("distribuidora vê todas as marcas (inclui o concorrente)", r.status === 200 && eans(r).has(RIVAL) && eans(r).has(OWN_1), JSON.stringify([...eans(r)]));
  check("distribuidora só vê a farmácia vinculada (A)", pharmacyNames(r).size === 1 && pharmacyNames(r).has(`${tag} A`), JSON.stringify([...pharmacyNames(r)]));
  check("sell-out da distribuidora (3+7) e estoque (20+0+50)", r.body?.live?.sellOut?.today === 10 && r.body?.live?.stockUnits === 70, JSON.stringify([r.body?.live?.sellOut, r.body?.live?.stockUnits]));
  r = await call(tDist, "GET", "/api/v1/prime/dashboard", undefined, { "x-prime-organization-id": lab.id });
  check("distribuidora NÃO abre o painel do laboratório (403)", r.status === 403 && r.body?.erro === "SEM_ACESSO_AO_PAINEL_PRIME", JSON.stringify(r));
  await enableMfa(pharmacyOwner);
  const tPharmacyPrime = await tokenFor(pharmacyOwner);
  r = await call(tPharmacyPrime, "GET", "/api/v1/prime/dashboard");
  check("usuário de farmácia não entra no painel da indústria (403)", r.status === 403 && r.body?.erro === "SEM_ACESSO_AO_PAINEL_PRIME", JSON.stringify(r));

  // ---------- só leitura ----------
  console.log("Só leitura");
  r = await call(tLab, "PATCH", `/api/v1/prime/oportunidades/${randomUUID()}`, { status: "WON" });
  check("fila comercial removida (404)", r.status === 404);
  r = await call(tLab, "POST", "/api/v1/prime/sincronizar", {});
  check("sincronização manual removida (404)", r.status === 404);

  // ---------- farmácia no controle ----------
  console.log("Farmácia no controle do compartilhamento");
  r = await call(tPharmacy, "GET", "/api/v1/usuarios/compartilhamentos", undefined, pharmacyHeaders);
  const labConnection = (r.body ?? []).find((item) => item.organization?.tradeName === `${tag} Laboratorio`);
  check("farmácia vê quem acessa os dados dela (2 organizações)", r.status === 200 && r.body.length === 2 && !!labConnection, JSON.stringify(r));
  r = await call(tPharmacy, "PATCH", `/api/v1/usuarios/compartilhamentos/${labConnection.id}`, { status: "SUSPENDED" }, pharmacyHeaders);
  check("farmácia suspende o laboratório (200, sem exigir MFA)", r.status === 200 && r.body?.status === "SUSPENDED" && r.body?.suspendedBy === "PHARMACY", JSON.stringify(r));
  r = await call(tLab, "GET", "/api/v1/prime/dashboard");
  check("dados da farmácia A somem na hora do painel do laboratório", r.status === 200 && !pharmacyNames(r).has(`${tag} A`) && r.body?.live?.sellOut?.today === 2, JSON.stringify([[...pharmacyNames(r)], r.body?.live?.sellOut]));
  check("sinais da farmácia A também somem", (r.body?.opportunities ?? []).every((item) => item.company.id !== A.company.id));
  r = await call(tGestor, "PUT", `/api/v1/interno/industria/organizacoes/${lab.id}/conexoes`, { empresa_id: A.company.id, status: "ACTIVE" });
  check("Nexus não religa o que a farmácia suspendeu (409)", r.status === 409 && r.body?.erro === "COMPARTILHAMENTO_SUSPENSO_PELA_FARMACIA", JSON.stringify(r));
  r = await call(tPharmacy, "PATCH", `/api/v1/usuarios/compartilhamentos/${labConnection.id}`, { status: "ACTIVE" }, pharmacyHeaders);
  check("religar exige identidade confirmada (MFA)", r.status === 403 && String(r.body?.erro).startsWith("MFA_"), JSON.stringify(r));
  const tPharmacyMfa = await tokenFor(pharmacyOwner, { mfaVerified: true });
  r = await call(tPharmacyMfa, "PATCH", `/api/v1/usuarios/compartilhamentos/${labConnection.id}`, { status: "ACTIVE" }, pharmacyHeaders);
  check("farmácia religa com MFA (200)", r.status === 200 && r.body?.status === "ACTIVE", JSON.stringify(r));
  r = await call(tLab, "GET", "/api/v1/prime/dashboard");
  check("farmácia A volta ao painel do laboratório", pharmacyNames(r).has(`${tag} A`));

  // ---------- escopo total para laboratório ----------
  console.log("Escopo de produtos");
  r = await call(tGestor, "PATCH", `/api/v1/interno/industria/organizacoes/${lab.id}`, { escopo_produtos: "ALL" });
  check("gestor comercial NÃO libera todos os produtos a um laboratório (403)", r.status === 403 && r.body?.erro === "SOMENTE_DIRETORIA_LIBERA_TODOS_OS_PRODUTOS", JSON.stringify(r));
  r = await call(tAdmin, "PATCH", `/api/v1/interno/industria/organizacoes/${lab.id}`, { escopo_produtos: "ALL" });
  check("Diretoria com MFA libera (200)", r.status === 200 && r.body?.scope?.mode === "ALL", JSON.stringify(r));
  r = await call(tLab, "GET", "/api/v1/prime/dashboard");
  check("laboratório passa a ver o concorrente", eans(r).has(RIVAL));
  r = await call(tGestor, "PATCH", `/api/v1/interno/industria/organizacoes/${lab.id}`, { escopo_produtos: "OWN" });
  check("gestor pode restringir de volta (200)", r.status === 200 && r.body?.scope?.mode === "OWN", JSON.stringify(r));
  r = await call(tLab, "GET", "/api/v1/prime/dashboard");
  check("concorrente some na hora após restringir", !eans(r).has(RIVAL) && (r.body?.opportunities ?? []).every((item) => item.product.ean !== RIVAL));

  // ---------- equipe da indústria ----------
  console.log("Equipe da indústria");
  r = await call(tLab, "POST", "/api/v1/prime/equipe/convites", { email: `${tag}-analista@teste.local`, perfil: "OWNER" });
  check("indústria não cria outro Responsável (400)", r.status === 400);
  r = await call(tLab, "POST", "/api/v1/prime/equipe/convites", { email: `${tag}-analista@teste.local`, perfil: "ANALYST" });
  check("Responsável convida Visualizador (201)", r.status === 201 && typeof r.body?.inviteUrl === "string", JSON.stringify(r));
  await acceptInvite(r.body?.inviteUrl, "Analista Lab");
  const analyst = await prisma.user.findUnique({ where: { email: `${tag}-analista@teste.local` } });
  await enableMfa(analyst);
  const tAnalyst = await tokenFor(analyst, { mfaVerified: true });
  r = await call(tAnalyst, "GET", "/api/v1/prime/dashboard");
  check("Visualizador vê o painel com o mesmo escopo", r.status === 200 && !eans(r).has(RIVAL) && r.body?.viewer?.canManage === false, JSON.stringify(r.body?.viewer));
  r = await call(tAnalyst, "GET", "/api/v1/prime/equipe");
  check("Visualizador não gerencia equipe (403)", r.status === 403 && r.body?.erro === "PERFIL_PRIME_NAO_AUTORIZADO", JSON.stringify(r));
  r = await call(tLab, "GET", "/api/v1/prime/equipe");
  check("Responsável lista a equipe (2 membros)", r.status === 200 && r.body?.members?.length === 2, JSON.stringify(r.body?.members?.map((m) => m.role)));
  r = await call(tLab, "PATCH", `/api/v1/prime/equipe/membros/${labOwner.id}`, { ativo: false });
  check("ninguém suspende a si mesmo (409)", r.status === 409 && r.body?.erro === "AUTO_ALTERACAO_NAO_PERMITIDA", JSON.stringify(r));
  r = await call(tLab, "PATCH", `/api/v1/prime/equipe/membros/${analyst.id}`, { ativo: false });
  check("Responsável suspende o Visualizador (200)", r.status === 200 && r.body?.active === false, JSON.stringify(r));
  r = await call(tAnalyst, "GET", "/api/v1/prime/dashboard");
  check("Visualizador suspenso perde o painel na hora (403)", r.status === 403 && r.body?.erro === "SEM_ACESSO_AO_PAINEL_PRIME", JSON.stringify(r));

  // ---------- auditoria ----------
  const audits = await prisma.auditLog.groupBy({ by: ["action"], where: { action: { startsWith: "PRIME_" }, userId: { in: [...userIds] } }, _count: true });
  const count = Object.fromEntries(audits.map((row) => [row.action, row._count]));
  check("auditoria registra criação, vínculo, convite, aceite, escopo e equipe", count.PRIME_ORGANIZATION_CREATED === 2 && count.PRIME_CONNECTION_UPDATED >= 5 && count.PRIME_INVITATION_CREATED >= 3 && count.PRIME_INVITATION_ACCEPTED >= 3 && count.PRIME_ORGANIZATION_UPDATED >= 2 && count.PRIME_MEMBER_UPDATED >= 1, JSON.stringify(count));
} catch (error) {
  failed++;
  console.error("ERRO INESPERADO:", error);
} finally {
  const accepted = await prisma.user.findMany({ where: { email: { startsWith: tag } }, select: { id: true } });
  accepted.forEach((user) => userIds.add(user.id));
  const users = [...userIds];
  const orgs = orgIds.filter(Boolean);
  const invitations = await prisma.invitation.findMany({ where: { OR: [{ primeOrganizationId: { in: orgs } }, { email: { startsWith: tag } }] }, select: { id: true } });
  const invitationIds = invitations.map((item) => item.id);
  await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: users } }, { companyId: { in: companyIds } }, { entityId: { in: [...orgs, ...invitationIds] } }] } });
  await prisma.emailDelivery.deleteMany({ where: { invitationId: { in: invitationIds } } });
  await prisma.invitation.deleteMany({ where: { id: { in: invitationIds } } });
  await prisma.primeOpportunity.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.primeMembership.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.primeConnection.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.primeOrganization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.saleItem.deleteMany({ where: { sale: { companyId: { in: companyIds } } } });
  await prisma.sale.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.storeStockBalance.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.inventoryLot.deleteMany({ where: { product: { companyId: { in: companyIds } } } });
  await prisma.product.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.fiscalCategory.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.store.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.membership.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: users } } });
  await prisma.userMfaMethod.deleteMany({ where: { userId: { in: users } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  const leftover = await prisma.user.count({ where: { email: { startsWith: tag } } }) + await prisma.primeOrganization.count({ where: { code: { startsWith: tag.toUpperCase() } } }) + await prisma.company.count({ where: { tradeName: { startsWith: tag } } });
  console.log(`\nlimpeza: ${leftover === 0 ? "ok (nenhuma fixture restante)" : `${leftover} registros restantes!`}`);
  console.log(`resultado: ${passed} ok, ${failed} falha(s)`);
  await app.close();
  await prisma.$disconnect();
  process.exitCode = failed ? 1 : 0;
}
