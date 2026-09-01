"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Brand } from "@/components/brand";
import type { CompanyMembership, PortalProfile } from "@/lib/portal";

type PortalLink = { href: string; label: string; icon: string; roles: string[]; externalFiscalDocument?: boolean };

const links: PortalLink[] = [
  { href: "/portal/alertas", label: "Alertas", icon: "!", roles: ["OWNER", "ADMIN", "MANAGER", "BUYER", "FINANCE", "PHARMACIST", "VIEWER"] },
  { href: "/portal/gestao", label: "Gestão", icon: "▦", roles: ["OWNER", "ADMIN", "MANAGER", "FINANCE", "VIEWER"] },
  { href: "/portal/operacao", label: "Painel de controle", icon: "◎", roles: ["OWNER", "ADMIN", "MANAGER", "BUYER", "FINANCE", "PHARMACIST", "VIEWER"] },
  { href: "/portal/estoque", label: "Estoque", icon: "≋", roles: ["OWNER", "ADMIN", "MANAGER", "BUYER", "PHARMACIST", "VIEWER"] },
  { href: "/portal/produtos", label: "Produtos", icon: "▤", roles: ["OWNER", "ADMIN", "MANAGER", "BUYER", "PHARMACIST", "OPERATOR", "VIEWER"] },
  { href: "/portal/categorias", label: "Categorias", icon: "◉", roles: ["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "VIEWER"] },
  { href: "/portal/compras", label: "Compras", icon: "◆", roles: ["OWNER", "ADMIN", "MANAGER", "BUYER", "FINANCE", "VIEWER"] },
  { href: "/portal/cotacoes", label: "Cotações", icon: "⇄", roles: ["OWNER", "ADMIN", "MANAGER", "BUYER", "FINANCE", "VIEWER"] },
  { href: "/portal/financeiro", label: "Contas a pagar", icon: "$", roles: ["OWNER", "ADMIN", "MANAGER", "FINANCE", "VIEWER"] },
  { href: "/portal/caixa", label: "Frente de caixa", icon: "▣", roles: ["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "OPERATOR", "VIEWER"] },
  { href: "/portal/pos-venda", label: "Pós-venda", icon: "↶", roles: ["OWNER", "ADMIN", "MANAGER", "FINANCE", "PHARMACIST", "OPERATOR", "VIEWER"] },
  { href: "/portal/controle-medicamentos", label: "Medicamentos", icon: "✚", roles: ["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "VIEWER"] },
  { href: "/portal/fiscal", label: "Motor fiscal", icon: "◇", roles: ["OWNER", "ADMIN", "MANAGER", "FINANCE", "PHARMACIST", "VIEWER"] },
  { href: "/portal/recebimento", label: "Recebimento NF-e", icon: "⇣", roles: ["OWNER", "ADMIN", "MANAGER", "BUYER", "PHARMACIST", "VIEWER"], externalFiscalDocument: true },
  { href: "/portal/nfce", label: "Emissão NFC-e", icon: "▤", roles: ["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "OPERATOR", "VIEWER"], externalFiscalDocument: true },
  { href: "/portal/usuarios", label: "Usuários", icon: "◌", roles: ["OWNER", "ADMIN", "MANAGER"] },
  { href: "/portal/minha-seguranca", label: "Minha segurança", icon: "◆", roles: ["OWNER", "ADMIN", "MANAGER", "BUYER", "FINANCE", "PHARMACIST", "OPERATOR", "VIEWER"] },
  { href: "/portal/privacidade", label: "Privacidade", icon: "◈", roles: ["OWNER", "ADMIN", "MANAGER", "BUYER", "FINANCE", "PHARMACIST", "OPERATOR", "VIEWER"] },
  { href: "/portal/suporte", label: "Helpdesk", icon: "?", roles: ["OWNER", "ADMIN", "MANAGER", "BUYER", "FINANCE", "PHARMACIST", "OPERATOR", "VIEWER"] },
];

const roleLabels: Record<string, string> = {
  OWNER: "Proprietário", ADMIN: "Administrador", MANAGER: "Gerente", BUYER: "Compras",
  FINANCE: "Financeiro da farmácia", PHARMACIST: "Farmacêutico", OPERATOR: "Caixa", VIEWER: "Auditoria / consulta",
};

export function PortalShell({ profile, membership, children }: { profile: PortalProfile; membership: CompanyMembership; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const fiscalDocumentsEnabled = process.env.NEXT_PUBLIC_FISCAL_DOCUMENTS_ENABLED === "true";
  async function leave(mode: "switch" | "logout") {
    setBusy(true);
    await fetch(mode === "logout" ? "/api/session/logout" : "/api/session/company", { method: mode === "logout" ? "POST" : "DELETE" });
    router.push(mode === "logout" ? "/entrar" : "/portal");
    router.refresh();
  }
  return <div className="portal-app">
    <aside className="portal-sidebar">
      <Brand variant="stacked" />
      <div className="portal-company"><span>EMPRESA ATIVA</span><strong>{membership.company.tradeName}</strong><small>{roleLabels[membership.role] ?? membership.role}</small></div>
      <nav aria-label="Módulos do portal">
        {links.filter((link) => link.roles.includes(membership.role) && (!link.externalFiscalDocument || fiscalDocumentsEnabled)).map((link) => <Link aria-current={pathname === link.href ? "page" : undefined} href={link.href} key={link.href}><span>{link.icon}</span>{link.label}</Link>)}
      </nav>
      <div className="portal-user"><span>{profile.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{profile.name}</strong><small>{profile.email}</small></div></div>
      <div className="portal-sidebar-actions"><button disabled={busy} onClick={() => leave("switch")} type="button">Trocar empresa</button><button disabled={busy} onClick={() => leave("logout")} type="button">Sair</button></div>
    </aside>
    <div className="portal-workspace"><header><div><span>Empresa</span><strong>{membership.company.tradeName}</strong></div><span className="portal-status"><i /> Dados protegidos</span></header><div className="portal-content">{children}</div></div>
  </div>;
}
