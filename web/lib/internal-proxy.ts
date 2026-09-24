import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "./api";
import { sessionCookieNames } from "./session-cookies";

// Traduz os códigos das rotas /interno para mensagens acionáveis. O `erro`
// continua indo junto na resposta — telas que mapeiam códigos por conta
// própria seguem funcionando; as demais usam `message` como fallback.
const internalMessages: Record<string, string> = {
  PERFIL_NAO_AUTORIZADO: "Seu perfil não pode executar esta ação.",
  SESSAO_INVALIDA: "Sua sessão expirou. Entre novamente.",
  TOKEN_INVALIDO_OU_EXPIRADO: "Sua sessão expirou. Entre novamente.",
  MFA_CONFIGURACAO_OBRIGATORIA: "Ative a autenticação em duas etapas em Minha segurança antes de executar esta ação.",
  MFA_CONFIRMACAO_RECENTE_OBRIGATORIA: "Confirme sua identidade em Minha segurança para liberar ações críticas por dez minutos.",
  MEMBRO_NAO_ENCONTRADO: "Este usuário não faz parte da equipe interna.",
  DIRETORIA_NAO_TEM_SENIORIDADE_AJUSTAVEL: "A Diretoria tem sempre acesso total — senioridade e suspensão não se aplicam.",
  USUARIO_JA_E_EQUIPE_INTERNA: "Este e-mail já pertence à equipe interna Nexus.",
  CONVITE_JA_ENVIADO: "Já existe um convite pendente para este e-mail.",
  EMPRESA_FORA_DA_SUA_CARTEIRA: "Este cliente não está na sua carteira.",
  SOMENTE_GESTOR_REATRIBUI_RESPONSAVEL: "Só Gestor ou Diretoria pode reatribuir o responsável comercial.",
  RESPONSAVEL_INVALIDO: "O responsável escolhido não é um membro ativo da equipe desta área.",
  CNPJ_JA_CADASTRADO: "Este CNPJ já está cadastrado.",
  EMPRESA_INATIVA: "Empresa suspensa ou cancelada.",
  USUARIO_JA_VINCULADO: "Este e-mail já está vinculado a esta empresa.",
  PLANO_COM_FATURAS_NAO_PODE_SER_SUBSTITUIDO: "Este plano já tem faturas e não pode ser trocado por aqui.",
  ONBOARDING_INICIADO_NAO_PODE_SER_RECALCULADO: "O onboarding já começou — plano e início do contrato não podem mais ser alterados.",
  TICKET_FORA_DA_SUA_FILA: "Este ticket não está atribuído a você.",
  SOMENTE_GESTOR_REATRIBUI_TICKET: "Só Gestor ou Diretoria pode reatribuir o ticket.",
};

export async function proxyInternal(path: string, init: RequestInit) {
  const token = (await cookies()).get(sessionCookieNames.access)?.value;
  if (!token) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
  if (!apiUrl()) return NextResponse.json({ message: "API não configurada." }, { status: 503 });
  const upstream = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: { ...(init.body && { "content-type": "application/json" }), authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: "API indisponível." }, { status: 503 });
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  const body = await upstream.json().catch(() => ({})) as { erro?: string };
  if (!upstream.ok) return NextResponse.json({ erro: body.erro, message: internalMessages[body.erro ?? ""] ?? "Não foi possível concluir a operação." }, { status: upstream.status });
  return NextResponse.json(body, { status: upstream.status });
}
