import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { InvitationForm } from "./invitation-form";

export const metadata: Metadata = { title: "Aceitar convite", robots: { index: false, follow: false } };

export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <section className="invitation-page shell"><div className="invitation-card"><Brand/><span className="eyebrow">CONVITE SEGURO</span><h1>Entre para a equipe</h1><p>Confirme seus dados para ativar o perfil atribuído pelo administrador da farmácia.</p>{token ? <InvitationForm token={token} /> : <div className="form-error">O link do convite está incompleto.</div>}</div></section>;
}
