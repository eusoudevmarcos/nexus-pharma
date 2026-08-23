import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../chatgpt-auth";
import { getDb } from "../../db";
import { empresaMembros, empresas } from "../../db/schema";

export async function getTenantContext() {
  const identity = await getChatGPTUser();
  if (!identity) {
    return { error: Response.json({ error: "Autenticação necessária." }, { status: 401 }) } as const;
  }

  const db = await getDb();
  const [membership] = await db
    .select({ empresaId: empresas.id, papel: empresaMembros.papel })
    .from(empresaMembros)
    .innerJoin(empresas, eq(empresas.id, empresaMembros.empresaId))
    .where(and(
      eq(empresaMembros.usuarioId, identity.id),
      eq(empresaMembros.ativo, true),
      eq(empresas.ativa, true),
    ))
    .limit(1);

  if (!membership) {
    return { error: Response.json({ error: "Empresa ativa não encontrada." }, { status: 403 }) } as const;
  }

  return { db, identity, ...membership } as const;
}
