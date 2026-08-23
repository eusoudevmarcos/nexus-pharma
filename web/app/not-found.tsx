import Link from "next/link";

export default function NotFound() {
  return <section className="page-hero shell centered"><span className="eyebrow">PÁGINA NÃO ENCONTRADA</span><h1>Este caminho ainda não faz parte da Nexus.</h1><p>Volte ao início para conhecer a plataforma.</p><Link className="button" href="/">Ir para o início</Link></section>;
}
