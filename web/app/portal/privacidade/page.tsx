import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { PrivacyCenter, type PrivacyRequest } from "./privacy-center";

export const metadata: Metadata = { title: "Privacidade" };

export default async function PrivacyPage() {
  await requireCompany();
  const requests = await portalFetch<PrivacyRequest[]>("/api/v1/privacidade/solicitacoes");
  return <section className="report-page privacy-page"><div className="report-heading"><div><span>SEUS DADOS</span><h1>Privacidade</h1><p>Solicite acesso, correção, portabilidade ou revisão do uso dos seus dados com protocolo e acompanhamento.</p></div><div className="report-period">Canal do titular</div></div><PrivacyCenter requests={requests ?? []}/></section>;
}
