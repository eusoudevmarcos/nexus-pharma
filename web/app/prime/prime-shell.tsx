"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Brand } from "@/components/brand";
import type { PortalProfile } from "@/lib/portal";

const roleLabels: Record<string, string> = { OWNER: "Responsável", ADMIN: "Administrador", ANALYST: "Visualizador", MANAGER: "Gerente", SALES: "Comercial", LOGISTICS: "Logística" };

export function PrimeShell({ profile, governance, children }: { profile: PortalProfile; governance: boolean; children: React.ReactNode }) {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  const membership = profile.primeMemberships?.[0];
  const canManage = !governance && ["OWNER", "ADMIN"].includes(membership?.role ?? "");
  async function logout() { setBusy(true); await fetch("/api/session/logout", { method: "POST" }); router.push("/entrar"); router.refresh(); }
  return <div className="prime-app"><aside className="prime-sidebar"><Brand variant="horizontal"/><div className="prime-product-badge"><span>PAINEL DA INDÚSTRIA</span><strong>{governance ? "Visão da Nexus" : membership?.organization.tradeName ?? "Painel"}</strong><small>Só consulta, em tempo real</small></div><nav><Link className="active" href="/prime"><span>⌁</span>Ao vivo</Link><a href="#produtos"><span>▤</span>Produtos</a><a href="#farmacias"><span>⌖</span>Farmácias</a><a href="#sinais"><span>!</span>Sinais</a>{canManage && <a href="#equipe"><span>◎</span>Equipe</a>}<Link href="/portal/minha-seguranca"><span>◇</span>Minha segurança</Link></nav><div className="prime-network-note"><i/><div><strong>Dados protegidos</strong><small>Sem preço, margem ou clientes</small></div></div><div className="prime-user"><span>{profile.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{profile.name}</strong><small>{governance ? "Governança Nexus" : roleLabels[membership?.role ?? ""] ?? "Painel"}</small></div></div><button className="prime-logout" disabled={busy} onClick={logout} type="button">Sair com segurança</button></aside><main className="prime-workspace"><header><div><span>Estoque e vendas nas farmácias parceiras</span><strong>Veja a demanda se formando, loja por loja.</strong></div><div className="prime-live"><i/> Ao vivo · só consulta</div></header>{children}</main></div>;
}
