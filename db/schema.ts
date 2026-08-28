import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const usuarios = sqliteTable("usuarios", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  nome: text("nome").notNull(),
  criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const empresas = sqliteTable("empresas", {
  id: text("id").primaryKey(),
  nomeFantasia: text("nome_fantasia").notNull(),
  filial: text("filial").notNull().default("Matriz"),
  cnpj: text("cnpj").unique(),
  regimeTributario: text("regime_tributario").notNull().default("SIMPLES_NACIONAL"),
  uf: text("uf"),
  municipio: text("municipio"),
  ativa: integer("ativa", { mode: "boolean" }).notNull().default(true),
  criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const empresaMembros = sqliteTable("empresa_membros", {
  empresaId: text("empresa_id").notNull().references(() => empresas.id, { onDelete: "cascade" }),
  usuarioId: text("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" }),
  papel: text("papel").notNull().default("OPERADOR"),
  ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
  criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.empresaId, table.usuarioId] }),
  index("empresa_membros_usuario_idx").on(table.usuarioId),
]);

export const auditoria = sqliteTable("auditoria", {
  id: text("id").primaryKey(),
  empresaId: text("empresa_id").notNull().references(() => empresas.id, { onDelete: "cascade" }),
  usuarioId: text("usuario_id").notNull().references(() => usuarios.id),
  acao: text("acao").notNull(),
  entidade: text("entidade").notNull(),
  entidadeId: text("entidade_id").notNull(),
  detalhesJson: text("detalhes_json").notNull().default("{}"),
  criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("auditoria_empresa_data_idx").on(table.empresaId, table.criadoEm),
]);

export const categorias = sqliteTable("categorias", {
  empresaId: text("empresa_id").notNull().references(() => empresas.id, { onDelete: "cascade" }),
  id: text("id").notNull(),
  nome: text("nome").notNull(),
  codigo: text("codigo").notNull(),
  ncm: text("ncm").notNull(),
  cest: text("cest").notNull().default(""),
  classe: text("classe").notNull(),
  descricao: text("descricao").notNull().default(""),
  versao: text("versao").notNull(),
  vigencia: text("vigencia").notNull(),
  criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.empresaId, table.id] }),
  uniqueIndex("categorias_empresa_codigo_uidx").on(table.empresaId, table.codigo),
  index("categorias_empresa_nome_idx").on(table.empresaId, table.nome),
]);

export const regrasFiscais = sqliteTable("regras_fiscais", {
  empresaId: text("empresa_id").notNull().references(() => empresas.id, { onDelete: "cascade" }),
  categoriaId: text("categoria_id").notNull(),
  regime: text("regime").notNull(),
  cfop: text("cfop").notNull(),
  cstIcms: text("cst_icms").notNull(),
  csosn: text("csosn").notNull(),
  icms: real("icms").notNull().default(0),
  mva: real("mva").notNull().default(0),
  cstPis: text("cst_pis").notNull(),
  cstCofins: text("cst_cofins").notNull(),
  cstPisCofins: text("cst_pis_cofins").notNull().default("01"),
  natureza: text("natureza_receita").notNull().default(""),
  pis: real("pis").notNull().default(0),
  cofins: real("cofins").notNull().default(0),
  cstReforma: text("cst_reforma").notNull(),
  classificacao: text("classificacao").notNull(),
  cClassTrib: text("cclass_trib").notNull().default("000001"),
  cbs: real("cbs").notNull().default(0),
  ibs: real("ibs").notNull().default(0),
  reducao: real("reducao").notNull().default(0),
  compensarCbs: integer("compensar_cbs", { mode: "boolean" }).notNull().default(false),
  atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.empresaId, table.categoriaId, table.regime] }),
  index("regras_fiscais_empresa_categoria_idx").on(table.empresaId, table.categoriaId),
]);

export const referenciasFiscais = sqliteTable("referencias_fiscais", {
  catalogo: text("catalogo").notNull(),
  codigo: text("codigo").notNull(),
  codigoPai: text("codigo_pai"),
  descricao: text("descricao").notNull(),
  ncmPadroesJson: text("ncm_padroes_json").notNull().default("[]"),
  parametrosJson: text("parametros_json").notNull().default("{}"),
  fonteUrl: text("fonte_url").notNull(),
  versaoFonte: text("versao_fonte").notNull(),
  vigenciaInicio: text("vigencia_inicio"),
  ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
  atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.catalogo, table.codigo, table.versaoFonte] }),
  index("referencias_fiscais_catalogo_ativo_idx").on(table.catalogo, table.ativo),
]);

export const produtos = sqliteTable("produtos", {
  empresaId: text("empresa_id").notNull().references(() => empresas.id, { onDelete: "cascade" }),
  ean: text("ean").notNull(),
  nome: text("nome").notNull(),
  laboratorio: text("laboratorio").notNull().default(""),
  principioAtivo: text("principio_ativo").notNull().default(""),
  categoriaId: text("categoria_id").notNull(),
  lote: text("lote").notNull().default(""),
  quantidadeEntrada: integer("quantidade_entrada").notNull().default(0),
  custoCentavos: integer("custo_centavos").notNull().default(0),
  estoque: integer("estoque").notNull().default(0),
  minimo: integer("minimo").notNull().default(0),
  fabricacao: text("fabricacao").notNull(),
  vencimento: text("vencimento").notNull(),
  precoCentavos: integer("preco_centavos").notNull().default(0),
  vendas30d: integer("vendas_30d").notNull().default(0),
  criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.empresaId, table.ean] }),
  index("produtos_empresa_nome_idx").on(table.empresaId, table.nome),
  index("produtos_empresa_categoria_idx").on(table.empresaId, table.categoriaId),
]);
