import { and, asc, eq } from "drizzle-orm";
import { initialCategories, initialProducts, type Category, type Product, type Regime, type Rule } from "../../catalog-data";
import { auditoria, categorias, produtos, regrasFiscais } from "../../../db/schema";
import { getTenantContext } from "../tenant-context";

export const dynamic = "force-dynamic";

const regimes: Regime[] = ["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"];

function categoryValues(empresaId: string, category: Category) {
  return {
    empresaId,
    id: category.id,
    nome: category.nome,
    codigo: category.codigo,
    ncm: category.ncm,
    cest: category.cest,
    classe: category.classe,
    descricao: category.descricao,
    versao: category.versao,
    vigencia: category.vigencia,
  };
}

function ruleValues(empresaId: string, categoriaId: string, regime: Regime, rule: Rule) {
  return { empresaId, categoriaId, regime, ...rule };
}

function productValues(empresaId: string, product: Product) {
  return {
    empresaId,
    ean: product.ean,
    nome: product.nome,
    laboratorio: product.laboratorio,
    principioAtivo: product.principioAtivo,
    categoriaId: product.categoriaId,
    lote: product.lote,
    quantidadeEntrada: product.quantidadeEntrada,
    custoCentavos: Math.round(product.custo * 100),
    estoque: product.estoque,
    minimo: product.minimo,
    fabricacao: product.fabricacao,
    vencimento: product.vencimento,
    precoCentavos: Math.round(product.preco * 100),
    vendas30d: product.vendas30d,
  };
}

async function seedCatalog(tenant: Awaited<ReturnType<typeof getTenantContext>> & { empresaId: string }) {
  const [existing] = await tenant.db.select({ id: categorias.id }).from(categorias).where(eq(categorias.empresaId, tenant.empresaId)).limit(1);
  if (existing) return;

  const categoryStatements = initialCategories.map((category) =>
    tenant.db.insert(categorias).values(categoryValues(tenant.empresaId, category)).onConflictDoNothing(),
  );
  const ruleStatements = initialCategories.flatMap((category) => regimes.map((regime) =>
    tenant.db.insert(regrasFiscais).values(ruleValues(tenant.empresaId, category.id, regime, category.rules[regime])).onConflictDoNothing(),
  ));
  const productStatements = initialProducts.map((product) =>
    tenant.db.insert(produtos).values(productValues(tenant.empresaId, product)).onConflictDoNothing(),
  );

  await tenant.db.batch(categoryStatements as [typeof categoryStatements[number], ...typeof categoryStatements]);
  await tenant.db.batch(ruleStatements as [typeof ruleStatements[number], ...typeof ruleStatements]);
  await tenant.db.batch(productStatements as [typeof productStatements[number], ...typeof productStatements]);
  await tenant.db.insert(auditoria).values({
    id: crypto.randomUUID(),
    empresaId: tenant.empresaId,
    usuarioId: tenant.identity.id,
    acao: "CATALOGO_INICIAL_CRIADO",
    entidade: "catalogo",
    entidadeId: tenant.empresaId,
    detalhesJson: JSON.stringify({ categorias: initialCategories.length, produtos: initialProducts.length }),
  });
}

export async function GET() {
  try {
    const tenant = await getTenantContext();
    if ("error" in tenant) return tenant.error;
    await seedCatalog(tenant);

    const [categoryRows, ruleRows, productRows] = await Promise.all([
      tenant.db.select().from(categorias).where(eq(categorias.empresaId, tenant.empresaId)).orderBy(asc(categorias.nome)),
      tenant.db.select().from(regrasFiscais).where(eq(regrasFiscais.empresaId, tenant.empresaId)),
      tenant.db.select().from(produtos).where(eq(produtos.empresaId, tenant.empresaId)).orderBy(asc(produtos.nome)),
    ]);

    const rulesByCategory = new Map<string, Partial<Record<Regime, Rule>>>();
    for (const row of ruleRows) {
      const current = rulesByCategory.get(row.categoriaId) ?? {};
      current[row.regime as Regime] = {
        cfop: row.cfop, cstIcms: row.cstIcms, csosn: row.csosn, icms: row.icms, mva: row.mva,
        cstPis: row.cstPis, cstCofins: row.cstCofins, natureza: row.natureza, pis: row.pis, cofins: row.cofins,
        cstReforma: row.cstReforma, classificacao: row.classificacao, cbs: row.cbs, ibs: row.ibs,
        reducao: row.reducao, compensarCbs: row.compensarCbs,
      };
      rulesByCategory.set(row.categoriaId, current);
    }

    const categoryResult: Category[] = categoryRows.map((row) => ({
      id: row.id, nome: row.nome, codigo: row.codigo, ncm: row.ncm, cest: row.cest,
      classe: row.classe, descricao: row.descricao, versao: row.versao, vigencia: row.vigencia,
      rules: rulesByCategory.get(row.id) as Record<Regime, Rule>,
    }));
    const productResult: Product[] = productRows.map((row) => ({
      ean: row.ean, nome: row.nome, laboratorio: row.laboratorio, principioAtivo: row.principioAtivo,
      categoriaId: row.categoriaId, lote: row.lote, quantidadeEntrada: row.quantidadeEntrada,
      custo: row.custoCentavos / 100, estoque: row.estoque, minimo: row.minimo,
      fabricacao: row.fabricacao, vencimento: row.vencimento, preco: row.precoCentavos / 100, vendas30d: row.vendas30d,
    }));

    return Response.json({ categories: categoryResult, products: productResult });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const tenant = await getTenantContext();
    if ("error" in tenant) return tenant.error;
    const payload = await request.json() as { tipo?: string; registro?: unknown };

    if (payload.tipo === "categoria") {
      if (!canManageFiscal(tenant.papel)) return Response.json({ error: "Seu perfil não pode alterar regras fiscais." }, { status: 403 });
      if (!isCategory(payload.registro)) return Response.json({ error: "Categoria fiscal inválida. Revise NCM, códigos e alíquotas." }, { status: 400 });
      const category = payload.registro;
      const updatedAt = new Date().toISOString();

      await tenant.db.batch([
        tenant.db.insert(categorias).values(categoryValues(tenant.empresaId, category)).onConflictDoUpdate({
          target: [categorias.empresaId, categorias.id],
          set: { ...categoryValues(tenant.empresaId, category), atualizadoEm: updatedAt },
        }),
        ...regimes.map((regime) => tenant.db.insert(regrasFiscais).values(ruleValues(tenant.empresaId, category.id, regime, category.rules[regime])).onConflictDoUpdate({
          target: [regrasFiscais.empresaId, regrasFiscais.categoriaId, regrasFiscais.regime],
          set: { ...ruleValues(tenant.empresaId, category.id, regime, category.rules[regime]), atualizadoEm: updatedAt },
        })),
        tenant.db.insert(auditoria).values({
          id: crypto.randomUUID(), empresaId: tenant.empresaId, usuarioId: tenant.identity.id,
          acao: "CATEGORIA_FISCAL_SALVA", entidade: "categoria", entidadeId: category.id,
          detalhesJson: JSON.stringify({ codigo: category.codigo, ncm: category.ncm, versao: category.versao }),
        }),
      ]);
      return Response.json({ saved: true, category });
    }

    if (payload.tipo === "produto") {
      if (!isProduct(payload.registro)) return Response.json({ error: "Produto inválido. Revise EAN, valores, estoque e datas." }, { status: 400 });
      const product = payload.registro;
      const [category] = await tenant.db.select({ id: categorias.id }).from(categorias)
        .where(and(eq(categorias.empresaId, tenant.empresaId), eq(categorias.id, product.categoriaId)))
        .limit(1);
      if (!category) return Response.json({ error: "A categoria fiscal do produto não existe nesta empresa." }, { status: 400 });

      await tenant.db.batch([
        tenant.db.insert(produtos).values(productValues(tenant.empresaId, product)).onConflictDoUpdate({
          target: [produtos.empresaId, produtos.ean],
          set: { ...productValues(tenant.empresaId, product), atualizadoEm: new Date().toISOString() },
        }),
        tenant.db.insert(auditoria).values({
          id: crypto.randomUUID(), empresaId: tenant.empresaId, usuarioId: tenant.identity.id,
          acao: "PRODUTO_SALVO", entidade: "produto", entidadeId: product.ean,
          detalhesJson: JSON.stringify({ categoriaId: product.categoriaId, estoque: product.estoque, preco: product.preco }),
        }),
      ]);
      return Response.json({ saved: true, product });
    }

    return Response.json({ error: "Tipo de registro inválido." }, { status: 400 });
  } catch (error) {
    return routeError(error);
  }
}

function canManageFiscal(role: string) {
  return role === "PROPRIETARIO" || role === "ADMINISTRADOR";
}

function isCategory(value: unknown): value is Category {
  if (!value || typeof value !== "object") return false;
  const item = value as Category;
  if (!/^[a-z0-9_-]{1,40}$/i.test(item.id) || !item.nome?.trim() || !/^[A-Z0-9_-]{1,40}$/i.test(item.codigo) || !/^\d{8}$/.test(item.ncm)) return false;
  if (!item.classe?.trim() || !item.versao?.trim() || !item.vigencia?.trim() || !item.rules) return false;
  return regimes.every((regime) => isRule(item.rules[regime]));
}

function isRule(value: unknown): value is Rule {
  if (!value || typeof value !== "object") return false;
  const item = value as Rule;
  const rates = [item.icms, item.mva, item.pis, item.cofins, item.cbs, item.ibs, item.reducao];
  return Boolean(item.cfop?.trim() && item.cstIcms?.trim() && item.csosn?.trim() && item.cstPis?.trim() && item.cstCofins?.trim() && item.cstReforma?.trim() && item.classificacao?.trim())
    && rates.every((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 10)
    && typeof item.compensarCbs === "boolean";
}

function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== "object") return false;
  const item = value as Product;
  const quantities = [item.quantidadeEntrada, item.estoque, item.minimo, item.vendas30d];
  return /^\d{8,14}$/.test(item.ean) && Boolean(item.nome?.trim() && item.categoriaId?.trim() && item.fabricacao && item.vencimento)
    && quantities.every((quantity) => Number.isInteger(quantity) && quantity >= 0)
    && [item.custo, item.preco].every((amount) => Number.isFinite(amount) && amount >= 0);
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Falha inesperada";
  return Response.json({ error: message }, { status: 500 });
}
