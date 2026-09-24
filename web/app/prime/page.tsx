import Link from "next/link";
import { primeFetch, requirePrime } from "@/lib/portal";
import { PrimeDashboard, type PrimeDashboardData } from "./prime-dashboard";
import type { PrimeTeamData } from "./prime-team";

export default async function PrimePage() {
  const session = await requirePrime();
  const dashboard = await primeFetch<PrimeDashboardData>("/api/v1/prime/dashboard");
  if (!dashboard) return <section className="prime-unavailable"><span>ACESSO PROTEGIDO</span><h1>Confirme seu acesso ao painel</h1><p>Ative a autenticação em duas etapas em Minha segurança. Se você já ativou, seu acesso pode ter sido suspenso pelo administrador da sua empresa.</p><Link href="/portal/minha-seguranca">Abrir Minha segurança</Link></section>;
  const team = dashboard.viewer.canManage && !dashboard.viewer.governance ? await primeFetch<PrimeTeamData>("/api/v1/prime/equipe") : null;
  return <PrimeDashboard currentUserId={session.profile.id} initial={dashboard} team={team} />;
}
