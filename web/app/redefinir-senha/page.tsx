import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Criar nova senha" };
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) { const { token = "" } = await searchParams; return <section className="login-section shell"><div className="login-story"><span className="eyebrow">NOVA CREDENCIAL</span><h1>Uma senha forte encerra as sessões antigas.</h1><p>Use uma combinação exclusiva com pelo menos 12 caracteres.</p></div><div className="login-card"><Brand/><div><h2>Criar nova senha</h2><p>Maiúscula, minúscula, número e símbolo são obrigatórios.</p></div><ResetPasswordForm token={token}/></div></section>; }
