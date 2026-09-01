import Link from "next/link";
import { primeFetch, requirePrime } from "@/lib/portal";
import { PrimeDashboard, type PrimeDashboardData } from "./prime-dashboard";

export default async function PrimePage() {
  await requirePrime();
  const dashboard = await primeFetch<PrimeDashboardData>("/api/v1/prime/dashboard");
  if (!dashboard) return <section className="prime-unavailable"><span>ACESSO PROTEGIDO</span><h1>Prepare sua identidade Prime</h1><p>Ative a autenticação em duas etapas para consultar sinais operacionais da rede de abastecimento.</p><Link href="/portal/minha-seguranca">Abrir Minha segurança</Link></section>;
  return <PrimeDashboard initial={dashboard}/>;
}
