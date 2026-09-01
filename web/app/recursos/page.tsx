import type { Metadata } from "next";
import Link from "next/link";
import { departments, features, storeJourney } from "@/lib/content";

export const metadata: Metadata = { title: "Recursos", description: "Conheça os recursos fiscais, comerciais e operacionais da Nexus Pharma." };

const operational = [
  ["Balcão e pré-venda", "Atendentes e farmacêuticos consultam, montam, identificam o consumidor e enviam o pedido confirmado ao caixa."],
  ["Caixa e conciliação", "Receba a pré-venda sem redigitação ou faça a venda direta, registre pagamentos, sangrias, suprimentos e fechamento."],
  ["Categorias fiscais", "Centralize NCM, CEST, ICMS, PIS/COFINS e IBS/CBS com vigência e versão."],
  ["Produtos e lotes", "Controle entrada, estoque, fabricação, vencimento, custo e preço sem perder o histórico."],
  ["Alertas gerenciais", "Encontre baixo estoque, alto giro, boa margem e lotes próximos do vencimento."],
  ["Venda rastreável", "Preserve a memória da regra tributária utilizada em cada item da saída."],
  ["Assistente fiscal", "Receba hipóteses de classificação, justificativas e evidências para revisão."],
  ["Operação SaaS", "Administre clientes, planos, suporte, releases, permissões e cobrança."],
];

export default function ResourcesPage() {
  return <>
    <section className="page-hero shell"><span className="eyebrow">RECURSOS</span><h1>Do balcão à gestão, tudo conversa com o produto e sua regra fiscal.</h1><p>A Nexus Pharma une a operação completa da farmácia a decisões verificáveis de estoque, compras, margem e tributação.</p></section>
    <section className="section shell"><div className="feature-grid">{features.map((feature) => <article className="feature-card" key={feature.number}><div><span className="feature-number">{feature.number}</span><span className="feature-tag">{feature.tag}</span></div><h2>{feature.title}</h2><p>{feature.description}</p></article>)}</div></section>
    <section className="section soft-section"><div className="shell"><div className="section-heading centered"><span className="eyebrow">NO DIA A DIA</span><h2>Uma base pronta para operar e evoluir.</h2></div><div className="detail-grid">{operational.map(([title, copy], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></div></section>
    <section className="section shell"><div className="section-heading centered"><span className="eyebrow">JORNADA DE VENDA</span><h2>O atendimento começa no balcão e termina no caixa.</h2></div><div className="store-journey">{storeJourney.map((step) => <article key={step.number}><span>{step.number}</span><h3>{step.title}</h3><p>{step.copy}</p></article>)}</div></section>
    <section className="section soft-section"><div className="shell"><div className="section-heading centered"><span className="eyebrow">ÁREAS FUNCIONAIS</span><h2>Cada setor com sua responsabilidade.</h2></div><div className="department-grid">{departments.map((department, index) => <article key={department.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{department.title}</h3><p>{department.copy}</p></article>)}</div></div></section>
    <section className="section final-cta shell"><div><span className="eyebrow light-eyebrow">CONHEÇA O PRODUTO</span><h2>Veja qual plano acompanha a sua operação.</h2></div><Link className="button button-yellow" href="/planos">Ver planos</Link></section>
  </>;
}
