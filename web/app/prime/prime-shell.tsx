"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Brand } from "@/components/brand";
import type { PortalProfile } from "@/lib/portal";

export function PrimeShell({ profile, governance, children }: { profile: PortalProfile; governance: boolean; children: React.ReactNode }) {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  const organization = profile.primeMemberships?.[0]?.organization;
  async function logout() { setBusy(true); await fetch("/api/session/logout", { method: "POST" }); router.push("/entrar"); router.refresh(); }
  return <div className="prime-app"><aside className="prime-sidebar"><Brand variant="horizontal"/><div className="prime-product-badge"><span>REDE INTELIGENTE</span><strong>Painel Prime</strong><small>{governance ? "Governança Nexus" : organization?.tradeName ?? "Operação B2B"}</small></div><nav><Link className="active" href="/prime"><span>⌁</span>Radar de abastecimento</Link><a href="#regioes"><span>⌖</span>Mapa regional</a><a href="#oportunidades"><span>↗</span>Oportunidades</a><a href="#configuracoes"><span>⚙</span>Configurações</a><Link href="/portal/minha-seguranca"><span>◇</span>Minha segurança</Link></nav><div className="prime-network-note"><i/><div><strong>Rede ativa</strong><small>Leitura operacional protegida</small></div></div><div className="prime-user"><span>{profile.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{profile.name}</strong><small>{governance ? "Proprietário da rede" : profile.primeMemberships?.[0]?.role ?? "Prime"}</small></div></div><button className="prime-logout" disabled={busy} onClick={logout} type="button">Sair com segurança</button></aside><main className="prime-workspace"><header><div><span>Inteligência de abastecimento</span><strong>Antecipe a demanda. Prepare a entrega.</strong></div><div className="prime-live"><i/> Atualização contínua</div></header>{children}</main></div>;
}
