import type { Metadata } from "next";
import { PlanGrid } from "@/components/plan-grid";

export const metadata: Metadata = { title: "Planos", description: "Planos Nexus Pharma para farmácias e redes." };

export default function PlansPage() {
  return <>
    <section className="page-hero shell centered"><span className="eyebrow">PLANOS</span><h1>Estrutura para começar. Liberdade para crescer.</h1><p>Escolha o nível de operação adequado hoje e evolua mantendo os dados, regras e históricos no mesmo lugar.</p></section>
    <section className="section shell plans-page"><PlanGrid /><div className="plan-note"><strong>Cresce junto com a sua operação.</strong><p>Todos os planos incluem 1 loja e 1 PDV. Cada filial adicional custa R$ 1.000,00/mês e cada PDV extra por loja, R$ 280,00/mês.</p><p>Nos planos com Success Fee, os 10% só incidem sobre economia real, comprovada e homologada no mês.</p><a className="text-link" href="mailto:contato@nexuspharma.com.br">Falar com o comercial <span>→</span></a></div></section>
  </>;
}
