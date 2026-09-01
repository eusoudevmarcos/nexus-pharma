import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { CustomerHelpdesk, type CustomerTicket } from "./customer-helpdesk";

export const metadata: Metadata = { title: "Helpdesk" };
export default async function CustomerSupportPage() { const session = await requireCompany(); const tickets = await portalFetch<CustomerTicket[]>("/api/v1/suporte/tickets"); return <section className="report-page"><div className="report-heading"><div><span>ATENDIMENTO NEXUS</span><h1>Helpdesk</h1><p>Abra chamados, acompanhe o SLA, converse com a equipe e controle qualquer sessão temporária de suporte.</p></div><div className="report-period">{session.membership.company.tradeName}</div></div><CustomerHelpdesk initial={tickets ?? []} role={session.membership.role}/></section>; }
