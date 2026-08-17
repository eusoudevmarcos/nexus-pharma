import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
