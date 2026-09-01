import type { Metadata } from "next";
import { identityFetch, requireIdentity } from "@/lib/portal";
import { MfaCenter, type MfaStatus } from "./mfa-center";
import { EmptyReport } from "../report-ui";

export const metadata: Metadata = { title: "Minha segurança" };

export default async function MySecurityPage() {
  await requireIdentity();
  const status = await identityFetch<MfaStatus>("/api/v1/auth/mfa/status");
  return <section className="report-page my-security-page"><div className="report-heading"><div><span>PROTEÇÃO DA CONTA</span><h1>Minha segurança</h1><p>Autenticação em duas etapas, códigos de recuperação e confirmação de ações críticas.</p></div><div className={`report-period ${status?.enabled ? "ready" : "blocked"}`}>{status?.enabled ? "MFA ativo" : "Proteção básica"}</div></div>{status ? <MfaCenter initialStatus={status} /> : <EmptyReport text="Conecte a API para carregar as configurações de segurança." />}</section>;
}
