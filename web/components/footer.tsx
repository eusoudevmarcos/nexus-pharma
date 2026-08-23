import Link from "next/link";
import { Brand } from "./brand";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-grid shell">
        <div className="footer-brand"><Brand /><p>Decisões fiscais e comerciais mais claras para quem cuida de uma farmácia.</p></div>
        <div><strong>Produto</strong><Link href="/recursos">Recursos</Link><Link href="/seguranca">Segurança</Link><Link href="/planos">Planos</Link></div>
        <div><strong>Acesso</strong><Link href="/entrar">Entrar</Link><Link href="/portal">Portal</Link><a href="mailto:contato@nexuspharma.com.br">Fale conosco</a></div>
        <div><strong>Princípio</strong><p>IA para apoiar análise. Aprovação humana para aplicar regras.</p></div>
      </div>
      <div className="footer-bottom shell"><span>© {new Date().getFullYear()} Nexus Pharma</span><span>Construído para evoluir com a legislação e com o negócio.</span></div>
    </footer>
  );
}
