"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Brand } from "@/components/brand";
import type { CompanyMembership, PortalProfile } from "@/lib/portal";

const links = [
  { href: "/portal/alertas", label: "Alertas", icon: "!", roles: ["OWNER", "ADMIN", "MANAGER", "FINANCE", "PHARMACIST", "OPERATOR", "VIEWER"] },
  { href: "/portal/gestao", label: "Gestão", icon: "▦", roles: ["OWNER", "ADMIN", "MANAGER", "FINANCE", "VIEWER"] },
  { href: "/portal/operacao", label: "Operação", icon: "◎", roles: ["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "OPERATOR", "VIEWER"] },
  { href: "/portal/fiscal", label: "Motor fiscal", icon: "◇", roles: ["OWNER", "ADMIN", "MANAGER", "FINANCE", "PHARMACIST", "VIEWER"] },
  { href: "/portal/usuarios", label: "Usuários", icon: "◌", roles: ["OWNER", "ADMIN", "MANAGER"] },
];

export function PortalShell({ profile, membership, children }: { profile: PortalProfile; membership: CompanyMembership; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function leave(mode: "switch" | "logout") {
    setBusy(true);
    await fetch(mode === "logout" ? "/api/session/logout" : "/api/session/company", { method: mode === "logout" ? "POST" : "DELETE" });
    router.push(mode === "logout" ? "/entrar" : "/portal");
    router.refresh();
  }
  return <div className="portal-app">
    <aside className="portal-sidebar">
      <Brand />
      <div className="portal-company"><span>EMPRESA ATIVA</span><strong>{membership.company.tradeName}</strong><small>{membership.role}</small></div>
      <nav aria-label="Módulos do portal">
        {links.filter((link) => link.roles.includes(membership.role)).map((link) => <Link aria-current={pathname === link.href ? "page" : undefined} href={link.href} key={link.href}><span>{link.icon}</span>{link.label}</Link>)}
      </nav>
      <div className="portal-user"><span>{profile.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{profile.name}</strong><small>{profile.email}</small></div></div>
      <div className="portal-sidebar-actions"><button disabled={busy} onClick={() => leave("switch")} type="button">Trocar empresa</button><button disabled={busy} onClick={() => leave("logout")} type="button">Sair</button></div>
    </aside>
    <div className="portal-workspace"><header><div><span>Empresa</span><strong>{membership.company.tradeName}</strong></div><span className="portal-status"><i /> Dados protegidos</span></header><div className="portal-content">{children}</div></div>
  </div>;
}
