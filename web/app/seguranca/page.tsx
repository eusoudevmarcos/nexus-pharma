import type { Metadata } from "next";
import Link from "next/link";
import { securityItems } from "@/lib/content";

export const metadata: Metadata = { title: "Segurança", description: "Controles de segurança e governança da Nexus Pharma." };

export default function SecurityPage() {
  return <>
    <section className="page-hero shell"><span className="eyebrow">SEGURANÇA E GOVERNANÇA</span><h1>Decisões explicáveis. Acessos controlados. Histórico preservado.</h1><p>A segurança começa na arquitetura e continua na forma como cada recomendação fiscal é analisada e aprovada.</p></section>
    <section className="section shell"><div className="security-card-grid">{securityItems.map((item, index) => <article key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></article>)}</div></section>
    <section className="section navy-section"><div className="shell governance"><div><span className="eyebrow light-eyebrow">GOVERNANÇA DA IA</span><h2>A IA ajuda a investigar. A responsabilidade continua humana.</h2></div><div><p>A análise registra origem, destino, composição, enquadramentos possíveis e fontes utilizadas. O resultado é uma hipótese acompanhada de confiança e pendências.</p><p>Somente uma pessoa autorizada pode aprovar a regra e aplicá-la aos produtos. Alterações permanecem versionadas para revisão posterior.</p><Link className="button button-light" href="/entrar">Conversar sobre segurança</Link></div></div></section>
  </>;
}
