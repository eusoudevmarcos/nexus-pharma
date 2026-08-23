import type { Metadata } from "next";
import Link from "next/link";
import { features } from "@/lib/content";

export const metadata: Metadata = { title: "Recursos", description: "Conheça os recursos fiscais, comerciais e operacionais da Nexus Pharma." };

const operational = [
  ["Categorias fiscais", "Centralize NCM, CEST, ICMS, PIS/COFINS e IBS/CBS com vigência e versão."],
  ["Produtos e lotes", "Controle entrada, estoque, fabricação, vencimento, custo e preço sem perder o histórico."],
  ["Alertas gerenciais", "Encontre baixo estoque, alto giro, boa margem e lotes próximos do vencimento."],
  ["Venda rastreável", "Preserve a memória da regra tributária utilizada em cada item da saída."],
  ["Assistente fiscal", "Receba hipóteses de classificação, justificativas e evidências para revisão."],
  ["Operação SaaS", "Administre clientes, planos, suporte, releases, permissões e cobrança."],
];

export default function ResourcesPage() {
  return <>
    <section className="page-hero shell"><span className="eyebrow">RECURSOS</span><h1>O produto, o imposto e o resultado no mesmo raciocínio.</h1><p>A Nexus Pharma foi desenhada para reduzir retrabalho e transformar dados dispersos em decisões verificáveis.</p></section>
    <section className="section shell"><div className="feature-grid">{features.map((feature) => <article className="feature-card" key={feature.number}><div><span className="feature-number">{feature.number}</span><span className="feature-tag">{feature.tag}</span></div><h2>{feature.title}</h2><p>{feature.description}</p></article>)}</div></section>
    <section className="section soft-section"><div className="shell"><div className="section-heading centered"><span className="eyebrow">NO DIA A DIA</span><h2>Uma base pronta para operar e evoluir.</h2></div><div className="detail-grid">{operational.map(([title, copy], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></div></section>
    <section className="section final-cta shell"><div><span className="eyebrow light-eyebrow">CONHEÇA O PRODUTO</span><h2>Veja qual plano acompanha a sua operação.</h2></div><Link className="button button-yellow" href="/planos">Ver planos</Link></section>
  </>;
}
