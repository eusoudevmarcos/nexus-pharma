"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type UserEntry = {
  membershipId: string;
  role: string;
  active: boolean;
  createdAt: string;
  activityCount: number;
  lastActivityAt: string | null;
  user: { id: string; name: string; email: string; status: string; lastLoginAt: string | null };
};
export type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: { name: string };
};

const roles = ["ADMIN", "MANAGER", "BUYER", "FINANCE", "PHARMACIST", "OPERATOR", "VIEWER"];
const labels: Record<string, string> = {
  OWNER: "Proprietário", ADMIN: "Administrador", MANAGER: "Gestor", BUYER: "Compras",
  FINANCE: "Financeiro da farmácia", PHARMACIST: "Farmacêutico", OPERATOR: "Caixa / operador", VIEWER: "Auditoria / consulta",
};
const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR").format(new Date(value));

function MemberRow({ entry, currentRole }: { entry: UserEntry; currentRole: string }) {
  const router = useRouter();
  const [role, setRole] = useState(entry.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canManage = ["OWNER", "ADMIN"].includes(currentRole);
  const protectedOwner = currentRole !== "OWNER" && entry.role === "OWNER";
  async function update(payload: { perfil?: string; ativo?: boolean }) {
    setBusy(true); setError("");
    const response = await fetch(`/api/portal/users/${entry.membershipId}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({})) as { message?: string };
    if (!response.ok) setError(body.message ?? "Não foi possível atualizar o acesso.");
    else router.refresh();
    setBusy(false);
  }
  return <div className="member-row">
    <span className="user-avatar">{entry.user.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
    <div className="member-identity"><strong>{entry.user.name}</strong><small>{entry.user.email}</small><em>{entry.activityCount} ações nos últimos 30 dias{entry.lastActivityAt ? ` · última em ${formatDate(entry.lastActivityAt)}` : ""}</em></div>
    <div className="member-role"><select aria-label={`Perfil de ${entry.user.name}`} disabled={!canManage || protectedOwner || busy || entry.role === "OWNER"} onChange={(event) => setRole(event.target.value)} value={role}>{entry.role === "OWNER" && <option value="OWNER">Proprietário</option>}{roles.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select><small>{entry.active ? "Acesso ativo" : "Acesso suspenso"}</small></div>
    <div className="member-actions">{canManage && !protectedOwner && <><button disabled={busy || role === entry.role} onClick={() => update({ perfil: role })} type="button">Salvar perfil</button><button className={entry.active ? "danger-link" : "success-link"} disabled={busy} onClick={() => update({ ativo: !entry.active })} type="button">{entry.active ? "Suspender" : "Reativar"}</button></>}{!canManage && <span>Somente leitura</span>}{error && <small>{error}</small>}</div>
  </div>;
}

export function UserAdministration({ users, invitations, currentRole }: { users: UserEntry[]; invitations: PendingInvitation[]; currentRole: string }) {
  const router = useRouter();
  const [showInvite, setShowInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const canManage = ["OWNER", "ADMIN"].includes(currentRole);
  async function invite(formData: FormData) {
    setBusy(true); setError(""); setInviteUrl(""); setDeliveryMessage("");
    const response = await fetch("/api/portal/users/invite", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: formData.get("email"), perfil: formData.get("perfil") }),
    });
    const body = await response.json().catch(() => ({})) as { message?: string; inviteUrl?: string; delivery?: { automatic?: boolean; status?: string } };
    if (!response.ok) setError(body.message ?? "Não foi possível criar o convite.");
    else {
      setInviteUrl(body.inviteUrl ?? "");
      setDeliveryMessage(body.delivery?.automatic && body.delivery.status === "SENT" ? "Convite enviado automaticamente por e-mail." : "Envio automático indisponível. Copie o link seguro abaixo.");
      router.refresh();
    }
    setBusy(false);
  }
  async function resend(id: string) {
    setBusy(true); setError(""); setInviteUrl(""); setDeliveryMessage("");
    const response = await fetch(`/api/portal/invitations/${id}/resend`, { method: "POST" });
    const body = await response.json().catch(() => ({})) as { message?: string; inviteUrl?: string; delivery?: { automatic?: boolean; status?: string } };
    if (!response.ok) setError(body.message ?? "Não foi possível reenviar o convite.");
    else {
      setInviteUrl(body.inviteUrl ?? "");
      setDeliveryMessage(body.delivery?.automatic && body.delivery.status === "SENT" ? "Novo convite enviado automaticamente por e-mail." : "Novo link gerado. O link anterior foi invalidado.");
      router.refresh();
    }
    setBusy(false);
  }
  async function revoke(id: string) {
    setBusy(true); setError("");
    const response = await fetch(`/api/portal/invitations/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string };
      setError(body.message ?? "Não foi possível cancelar o convite.");
    } else router.refresh();
    setBusy(false);
  }
  return <>
    <div className="users-toolbar"><div><strong>Equipe e permissões</strong><span>{canManage ? "Você pode convidar pessoas e ajustar seus acessos." : "Seu perfil possui acesso de consulta."}</span></div>{canManage && <button className="button button-yellow" onClick={() => setShowInvite((value) => !value)} type="button">{showInvite ? "Fechar" : "+ Convidar usuário"}</button>}</div>
    {showInvite && <section className="invite-panel"><form action={invite}><label>E-mail corporativo<input autoComplete="email" name="email" placeholder="nome@farmacia.com.br" required type="email" /></label><label>Perfil inicial<select defaultValue="OPERATOR" name="perfil">{roles.map((role) => <option key={role} value={role}>{labels[role]}</option>)}</select></label><button className="button" disabled={busy} type="submit">{busy ? "Criando…" : "Gerar convite seguro"}</button></form><p>O link é válido por 72 horas e funciona uma única vez.</p>{error && <p className="form-error">{error}</p>}{inviteUrl && <div className="invite-link"><span>{deliveryMessage || "Link criado — envie somente à pessoa convidada."}</span><input aria-label="Link do convite" onFocus={(event) => event.currentTarget.select()} readOnly value={inviteUrl}/><button onClick={() => navigator.clipboard.writeText(inviteUrl)} type="button">Copiar link</button></div>}</section>}
    {!showInvite && (error || inviteUrl) && <section className="invite-feedback">{error && <p className="form-error">{error}</p>}{inviteUrl && <div className="invite-link"><span>{deliveryMessage}</span><input aria-label="Novo link do convite" onFocus={(event) => event.currentTarget.select()} readOnly value={inviteUrl}/><button onClick={() => navigator.clipboard.writeText(inviteUrl)} type="button">Copiar link</button></div>}</section>}
    {invitations.length > 0 && <article className="report-panel pending-invitations"><div className="panel-title"><div><span>AGUARDANDO ACEITE</span><h2>Convites pendentes</h2></div><strong>{invitations.length}</strong></div><div>{invitations.map((invitation) => <div className="invitation-row" key={invitation.id}><div><strong>{invitation.email}</strong><small>{labels[invitation.role] ?? invitation.role} · expira em {formatDate(invitation.expiresAt)}</small></div><span>Enviado por {invitation.invitedBy.name}</span>{canManage && <div className="invitation-actions"><button disabled={busy} onClick={() => resend(invitation.id)} type="button">Reenviar</button><button className="danger-link" disabled={busy} onClick={() => revoke(invitation.id)} type="button">Cancelar</button></div>}</div>)}</div></article>}
    <article className="report-panel full"><div className="panel-title"><div><span>EQUIPE</span><h2>Perfis da empresa</h2></div></div><div className="member-list">{users.map((entry) => <MemberRow currentRole={currentRole} entry={entry} key={entry.membershipId}/>)}</div></article>
  </>;
}
