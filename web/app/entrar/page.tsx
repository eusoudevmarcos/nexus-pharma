import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar", description: "Acesse o portal Nexus Pharma." };

export default function LoginPage() {
  return <section className="login-section shell">
    <div className="login-story"><span className="eyebrow">PORTAL NEXUS</span><h1>O trabalho certo, no contexto certo.</h1><p>O acesso está sendo liberado gradualmente para clientes e equipes internas. Cada perfil recebe somente as ferramentas necessárias para sua rotina.</p><div className="login-points"><span>Farmácias e gestores</span><span>Fiscal e contábil</span><span>Helpdesk e financeiro</span><span>Desenvolvimento e releases</span></div></div>
    <div className="login-card"><Brand /><div><h2>Entrar na sua conta</h2><p>Use as credenciais enviadas no processo de liberação.</p></div><LoginForm /><small>Ao entrar, você concorda com os termos de uso e com a política de privacidade.</small></div>
  </section>;
}
