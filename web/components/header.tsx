import Link from "next/link";
import { Brand } from "./brand";

export function Header() {
  return (
    <header className="site-header">
      <div className="header-inner shell">
        <Brand />
        <nav aria-label="Navegação principal">
          <Link href="/recursos">Recursos</Link>
          <Link href="/seguranca">Segurança</Link>
          <Link href="/planos">Planos</Link>
        </nav>
        <div className="header-actions">
          <Link className="link-button" href="/entrar">Entrar</Link>
          <Link className="button button-small" href="/planos">Quero conhecer</Link>
        </div>
      </div>
    </header>
  );
}
