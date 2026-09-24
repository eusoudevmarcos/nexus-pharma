// Fronteiras dos perfis da farmácia (docs/crm-interno-departamentos.md, mapa
// "Perfis do cliente") verificadas contra as rotas reais. Lê as guardas
// requireTenantRoles de src/routes/*.ts e resolve os perfis via a matriz de
// access-control — sem banco. Se o formato de alguma rota mudar a ponto de o
// extrator não entendê-la, o primeiro teste falha em vez de passar em silêncio.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { tenantRoles, tenantRolesAtLeast } from "../dist/security/access-control.js";

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routesDir = path.join(apiDir, "src", "routes");
const serverSrc = fs.readFileSync(path.join(apiDir, "src", "server.ts"), "utf8");
const moduleByImport = new Map([...serverSrc.matchAll(/import \{ (\w+) \} from "\.\/routes\/([\w.-]+)\.js"/g)].map((m) => [m[1], m[2]]));
const prefixByModule = new Map([...serverSrc.matchAll(/app\.register\((\w+), \{\s*prefix: "([^"]+)"/g)].map((m) => [moduleByImport.get(m[1]), m[2]]));
const internalOnly = (prefix) => prefix.startsWith("/api/v1/interno") || prefix.startsWith("/api/v1/auth");

function splitTopLevel(text) {
  const parts = [];
  let depth = 0, start = 0, quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function resolveRoles(expr, src, depth = 0) {
  if (depth > 5) return null;
  expr = expr.trim().replace(/\s+as const$/, "").trim();
  let m = expr.match(/^tenantRolesAtLeast\(\s*"(\w+)"\s*,\s*"(\w+)"\s*\)$/);
  if (m) return tenantRolesAtLeast(m[1], m[2]);
  m = expr.match(/^\[\s*\.\.\.new Set\(([\s\S]*)\)\s*\]$/);
  if (m) return resolveRoles(m[1], src, depth + 1);
  if (expr.startsWith("[") && expr.endsWith("]")) {
    const roles = new Set();
    for (const part of splitTopLevel(expr.slice(1, -1))) {
      if (part.startsWith("...")) {
        const spread = resolveRoles(part.slice(3), src, depth + 1);
        if (!spread) return null;
        spread.forEach((role) => roles.add(role));
      } else {
        const literal = part.match(/^"(\w+)"$/);
        if (!literal) return null;
        roles.add(literal[1]);
      }
    }
    return [...roles];
  }
  m = expr.match(/^(\w+)$/);
  if (m) {
    const def = src.match(new RegExp(`const ${m[1]}(?:\\s*:[^=]+)?\\s*=\\s*([\\s\\S]*?);\\r?\\n`));
    return def ? resolveRoles(def[1], src, depth + 1) : null;
  }
  return null;
}

function guardArgs(text) {
  const out = [];
  let index = 0;
  while ((index = text.indexOf("requireTenantRoles(", index)) !== -1) {
    let i = index + "requireTenantRoles(".length, depth = 1;
    const start = i;
    while (i < text.length && depth > 0) { if (text[i] === "(") depth++; else if (text[i] === ")") depth--; i++; }
    out.push(text.slice(start, i - 1));
    index = i;
  }
  return out;
}

const routes = [];
const extraction = [];
for (const file of fs.readdirSync(routesDir).filter((name) => name.endsWith(".routes.ts"))) {
  const prefix = prefixByModule.get(file.replace(/\.ts$/, ""));
  if (!prefix || internalOnly(prefix)) continue;
  const src = fs.readFileSync(path.join(routesDir, file), "utf8");
  const registrations = (src.match(/app\.(get|post|put|patch|delete)(<[^>]*>)?\(/g) ?? []).length;
  const matches = [...src.matchAll(/app\.(get|post|put|patch|delete)(?:<[^>]*>)?\(\s*"([^"]+)",\s*([\s\S]*?)(?=async \(|async function)/g)];
  extraction.push({ file, registrations, extracted: matches.length });
  for (const [, method, routePath, options] of matches) {
    let guardText = options;
    const ref = options.match(/preHandler:\s*(\w+)/);
    if (ref) guardText += src.match(new RegExp(`const ${ref[1]}\\s*=\\s*([\\s\\S]*?\\]);`))?.[1] ?? "";
    if (!/tenantContext/.test(guardText)) continue;
    const args = guardArgs(guardText);
    let roles = [...tenantRoles];
    let unresolved = null;
    for (const arg of args) {
      const resolved = resolveRoles(arg, src);
      if (!resolved) { unresolved = arg; break; }
      roles = roles.filter((role) => resolved.includes(role));
    }
    routes.push({ method: method.toUpperCase(), url: `${prefix}${routePath}`, roles, unresolved, file });
  }
}

// POSTs que só consultam (o corpo carrega a pergunta), não alteram dado.
const readOnlyPosts = new Set(["POST /api/v1/estoque/codigo/resolver", "POST /api/v1/relatorios/gerencial/exportar"]);
const mutates = (route) => route.method !== "GET" && !readOnlyPosts.has(`${route.method} ${route.url}`);
const under = (...prefixes) => (route) => prefixes.some((prefix) => route.url.startsWith(`/api/v1${prefix}`));
const describe = (list) => list.map((route) => `${route.method} ${route.url} [${route.roles.join(",")}]`).join("\n");

test("extrator cobre todas as rotas de tenant e resolve todas as guardas", () => {
  for (const item of extraction) assert.equal(item.extracted, item.registrations, `${item.file}: rota em formato não reconhecido pelo extrator`);
  assert.ok(routes.length > 100, `poucas rotas de tenant encontradas (${routes.length})`);
  const unresolved = routes.filter((route) => route.unresolved);
  assert.deepEqual(unresolved.map((route) => `${route.url} :: ${route.unresolved}`), []);
  assert.ok(readOnlyPosts.size && [...readOnlyPosts].every((key) => routes.some((route) => `${route.method} ${route.url}` === key)), "rota da lista de POSTs só-leitura não existe mais");
});

const boundaries = [
  ["VIEWER", "nenhuma criação, edição, aprovação ou transmissão (exceto chamados e privacidade pessoais)", (r) => mutates(r) && !under("/suporte", "/privacidade")(r)],
  ["ATTENDANT", "não recebe pagamentos nem abre ou fecha caixa", (r) => mutates(r) && under("/caixa", "/vendas", "/pos-venda")(r)],
  ["ATTENDANT", "não altera estoque, fiscal ou financeiro", (r) => mutates(r) && under("/estoque", "/fiscal", "/contas-pagar", "/compras", "/cotacoes", "/cadastros")(r)],
  ["OPERATOR", "sem painéis gerenciais", under("/relatorios/gerencial", "/relatorios/gestao", "/relatorios/usuarios")],
  ["OPERATOR", "sem cadastros fiscais, estoque administrativo ou usuários", (r) => mutates(r) && under("/cadastros", "/estoque", "/usuarios", "/fiscal/matriz", "/fiscal/rastreabilidade", "/compras", "/cotacoes", "/contas-pagar")(r)],
  ["BUYER", "não opera caixa, usuários ou contas a pagar", (r) => mutates(r) && under("/caixa", "/vendas", "/pos-venda", "/usuarios", "/contas-pagar")(r)],
  ["FINANCE", "não movimenta estoque, não opera caixa nem configura tributação", (r) => mutates(r) && under("/estoque", "/caixa", "/vendas", "/fiscal", "/cadastros")(r)],
  ["PHARMACIST", "não administra usuários, não opera contas a pagar ou compras comerciais", (r) => mutates(r) && under("/usuarios", "/contas-pagar", "/compras", "/cotacoes")(r)],
  ["MANAGER", "consulta usuários, mas não concede acesso", (r) => mutates(r) && under("/usuarios")(r)],
];

for (const [role, rule, violates] of boundaries) {
  test(`${role}: ${rule}`, () => {
    const hits = routes.filter((route) => route.roles.includes(role) && violates(route));
    assert.equal(hits.length, 0, `rotas que quebram a fronteira:\n${describe(hits)}`);
  });
}

test("Auditoria consulta a lista de produtos controlados (só leitura)", () => {
  const route = routes.find((item) => item.method === "GET" && item.url === "/api/v1/controle-venda/produtos");
  assert.ok(route, "rota GET /controle-venda/produtos não encontrada");
  assert.ok(route.roles.includes("VIEWER"));
  assert.ok(route.roles.includes("OPERATOR"), "o caixa precisa das exigências de controlados no ato da venda");
  assert.ok(!route.roles.includes("ATTENDANT") && !route.roles.includes("BUYER") && !route.roles.includes("FINANCE"));
});
