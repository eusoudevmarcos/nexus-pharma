import type { Metadata } from "next";
import { PlanGrid } from "@/components/plan-grid";

export const metadata: Metadata = { title: "Planos", description: "Planos Nexus Pharma para farmácias e redes." };

export default function PlansPage() {
  return <>
    <section className="page-hero shell centered"><span className="eyebrow">PLANOS</span><h1>Estrutura para começar. Liberdade para crescer.</h1><p>Escolha o nível de operação adequado hoje e evolua mantendo os dados, regras e históricos no mesmo lugar.</p></section>
    <section className="section shell plans-page"><PlanGrid /><div className="plan-note"><strong>Precisa de uma configuração específica?</strong><p>Integrações, múltiplas empresas e implantação assistida podem ser compostas em um plano dedicado.</p><a className="text-link" href="mailto:contato@nexuspharma.com.br">Falar com o comercial <span>→</span></a></div></section>
  </>;
}
