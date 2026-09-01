import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { PasswordRecoveryForm } from "./password-recovery-form";

export const metadata: Metadata = { title: "Recuperar senha" };
export default function ForgotPasswordPage() { return <section className="login-section shell"><div className="login-story"><span className="eyebrow">RECUPERAÇÃO SEGURA</span><h1>Volte ao trabalho sem abrir brechas.</h1><p>O link funciona uma única vez, expira em 30 minutos e não revela se um e-mail está cadastrado.</p></div><div className="login-card"><Brand/><div><h2>Recuperar senha</h2><p>Informe o e-mail utilizado no Nexus Pharma.</p></div><PasswordRecoveryForm/><small>Se não encontrar a mensagem, confira o spam ou fale com o helpdesk.</small></div></section>; }
