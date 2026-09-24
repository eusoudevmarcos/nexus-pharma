"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type StaffMember = { id: string; name: string; email: string; systemRole: string; status: string; createdAt: string };
export type PendingStaffInvite = { id: string; email: string; systemRole: string; expiresAt: string; createdAt: string; invitedBy: { name: string } };

const internalRoles = ["INTERNAL_ADMIN", "DEVELOPER", "HELPDESK", "FINANCE", "COMMERCIAL"] as const;
const roleLabels: Record<string, string> = {
  INTERNAL_ADMIN: "Administração Nexus",
  DEVELOPER: "Desenvolvimento",
  HELPDESK: "Helpdesk",
  FINANCE: "Financeiro Nexus",
  COMMERCIAL: "Comercial Nexus",
};
const statusLabels: Record<string, string> = { ACTIVE: "Ativo", INVITED: "Convite pendente", SUSPENDED: "Suspenso", DISABLED: "Desativado" };
const localDateTime = (value: string) => new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function TeamManagement({ staff, pendingInvites }: { staff: StaffMember[]; pendingInvites: PendingStaffInvite[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [perfil, setPerfil] = useState<(typeof internalRoles)[number]>("HELPDESK");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  async function send() {
    setBusy(true);
    setFeedback(null);
    const response = await fetch("/api/portal/internal/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, perfil }),
    });
    if (response.ok) {
      const body = await response.json().catch(() => ({}));
      setFeedback({ tone: "ok", text: body?.delivery?.automatic ? "Convite enviado por e-mail." : "Convite criado. E-mail automático não está configurado — copie o link e envie você mesmo." });
      setEmail("");
      router.refresh();
    } else {
      const body = await response.json().catch(() => ({}));
      const messages: Record<string, string> = {
        CONVITE_JA_ENVIADO: "Já existe um convite pendente para este e-mail.",
        USUARIO_JA_E_EQUIPE_INTERNA: "Este e-mail já pertence à equipe interna Nexus.",
      };
      setFeedback({ tone: "error", text: body.erro ? messages[body.erro] ?? body.message ?? "Não foi possível enviar o convite." : (body.message ?? "Não foi possível enviar o convite.") });
    }
    setBusy(false);
  }

  return (
    <article className="report-panel full team-panel">
      <div className="panel-title">
        <div>
          <span>EQUIPE NEXUS</span>
          <h2>Administração, desenvolvimento, financeiro, comercial e helpdesk</h2>
        </div>
        <strong>{staff.length}</strong>
      </div>

      <div className="invite-row team-invite-row">
        <label>
          E-mail do novo membro
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@nexuspharma.com.br" />
        </label>
        <label>
          Perfil
          <select value={perfil} onChange={(event) => setPerfil(event.target.value as (typeof internalRoles)[number])}>
            {internalRoles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={busy || !email} onClick={send}>
          {busy ? "Enviando..." : "Convidar"}
        </button>
        {feedback && <span className={feedback.tone === "ok" ? "invite-status" : "invite-status error"}>{feedback.text}</span>}
      </div>

      <div className="team-list">
        {staff.map((member) => (
          <div className="internal-row team-row" key={member.id}>
            <div>
              <strong>{member.name}</strong>
              <small>{member.email}</small>
            </div>
            <span className="status-pill">{roleLabels[member.systemRole] ?? member.systemRole}</span>
            <span className={`status-pill ${member.status.toLowerCase()}`}>{statusLabels[member.status] ?? member.status}</span>
          </div>
        ))}
      </div>

      {pendingInvites.length > 0 && (
        <div className="team-pending">
          <h3>Convites aguardando aceite</h3>
          {pendingInvites.map((invite) => (
            <div className="internal-row team-row" key={invite.id}>
              <div>
                <strong>{invite.email}</strong>
                <small>Convidado por {invite.invitedBy.name} em {localDateTime(invite.createdAt)}</small>
              </div>
              <span className="status-pill">{roleLabels[invite.systemRole] ?? invite.systemRole}</span>
              <span className="status-pill pending">Expira {localDateTime(invite.expiresAt)}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
