import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { auditoria, empresaMembros, empresas, usuarios } from "../../../db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await getChatGPTUser();
  if (!identity) {
    return Response.json({ error: "Autenticação necessária." }, { status: 401 });
  }

  try {
    const db = await getDb();
    const empresaIdInicial = `empresa:${identity.id}`;

    await db.insert(usuarios).values({
      id: identity.id,
      email: identity.email,
      nome: identity.displayName,
    }).onConflictDoUpdate({
      target: usuarios.id,
      set: {
        email: identity.email,
        nome: identity.displayName,
        atualizadoEm: new Date().toISOString(),
      },
    });

    let [contexto] = await db
      .select({
        empresaId: empresas.id,
        nomeFantasia: empresas.nomeFantasia,
        filial: empresas.filial,
        regimeTributario: empresas.regimeTributario,
        uf: empresas.uf,
        municipio: empresas.municipio,
        papel: empresaMembros.papel,
      })
      .from(empresaMembros)
      .innerJoin(empresas, eq(empresas.id, empresaMembros.empresaId))
      .where(and(eq(empresaMembros.usuarioId, identity.id), eq(empresaMembros.ativo, true), eq(empresas.ativa, true)))
      .limit(1);

    if (!contexto) {
      await db.batch([
        db.insert(empresas).values({
          id: empresaIdInicial,
          nomeFantasia: "Farmácia Modelo",
          filial: "Matriz",
        }).onConflictDoNothing(),
        db.insert(empresaMembros).values({
          empresaId: empresaIdInicial,
          usuarioId: identity.id,
          papel: "PROPRIETARIO",
        }).onConflictDoNothing(),
        db.insert(auditoria).values({
          id: crypto.randomUUID(),
          empresaId: empresaIdInicial,
          usuarioId: identity.id,
          acao: "EMPRESA_CRIADA",
          entidade: "empresa",
          entidadeId: empresaIdInicial,
          detalhesJson: JSON.stringify({ origem: "primeiro_acesso" }),
        }),
      ]);

      [contexto] = await db
        .select({
          empresaId: empresas.id,
          nomeFantasia: empresas.nomeFantasia,
          filial: empresas.filial,
          regimeTributario: empresas.regimeTributario,
          uf: empresas.uf,
          municipio: empresas.municipio,
          papel: empresaMembros.papel,
        })
        .from(empresaMembros)
        .innerJoin(empresas, eq(empresas.id, empresaMembros.empresaId))
        .where(and(eq(empresaMembros.usuarioId, identity.id), eq(empresaMembros.empresaId, empresaIdInicial)))
        .limit(1);
    }

    if (!contexto) {
      return Response.json({ error: "Não foi possível preparar a empresa." }, { status: 500 });
    }

    return Response.json({
      usuario: { id: identity.id, nome: identity.displayName, email: identity.email },
      empresa: contexto,
      seguranca: { isolamentoPorEmpresa: true, auditoriaAtiva: true },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada";
    return Response.json({ error: message }, { status: 500 });
  }
}
