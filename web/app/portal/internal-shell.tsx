"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Brand } from "@/components/brand";
import type { PortalProfile } from "@/lib/portal";

const links = [
  { href: "/portal/interno/monitoramento", label: "Monitoramento", icon: "●", roles: ["INTERNAL_ADMIN", "DEVELOPER"] },
  { href: "/portal/interno/seguranca", label: "Segurança", icon: "◆", roles: ["INTERNAL_ADMIN", "DEVELOPER"] },
  { href: "/portal/interno/privacidade", label: "Privacidade & DR", icon: "◈", roles: ["INTERNAL_ADMIN"] },
  { href: "/portal/interno/suporte", label: "Helpdesk", icon: "?", roles: ["INTERNAL_ADMIN", "HELPDESK"] },
  { href: "/portal/interno/financeiro", label: "Financeiro", icon: "$", roles: ["INTERNAL_ADMIN", "FINANCE"] },
  { href: "/portal/interno/faturamento", label: "Faturamento SaaS", icon: "R$", roles: ["INTERNAL_ADMIN", "FINANCE"] },
  { href: "/portal/interno/comercial", label: "Comercial", icon: "↗", roles: ["INTERNAL_ADMIN", "COMMERCIAL"] },
  { href: "/portal/interno/desenvolvimento", label: "Desenvolvimento", icon: "⌘", roles: ["INTERNAL_ADMIN", "DEVELOPER"] },
];
const roleLabels: Record<string, string> = { INTERNAL_ADMIN: "Administração geral", DEVELOPER: "Desenvolvimento", HELPDESK: "Helpdesk", FINANCE: "Financeiro", COMMERCIAL: "Comercial" };

export function InternalShell({ profile, children }: { profile: PortalProfile; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function logout() { setBusy(true); await fetch("/api/session/logout", { method: "POST" }); router.push("/entrar"); router.refresh(); }
  return <div className="portal-app internal-app"><aside className="portal-sidebar internal-sidebar"><Brand/><div className="portal-company"><span>CENTRAL NEXUS</span><strong>Operação interna</strong><small>{roleLabels[profile.systemRole]}</small></div><nav aria-label="Áreas internas">{links.filter((link) => link.roles.includes(profile.systemRole)).map((link) => <Link aria-current={pathname === link.href ? "page" : undefined} href={link.href} key={link.href}><span>{link.icon}</span>{link.label}</Link>)}</nav><div className="portal-user"><span>{profile.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{profile.name}</strong><small>{profile.email}</small></div></div><div className="portal-sidebar-actions"><button disabled={busy} onClick={logout} type="button">Sair com segurança</button></div></aside><div className="portal-workspace"><header><div><span>Central interna</span><strong>{roleLabels[profile.systemRole]}</strong></div><span className="portal-status"><i/> Acesso corporativo</span></header><div className="portal-content">{children}</div></div></div>;
}
