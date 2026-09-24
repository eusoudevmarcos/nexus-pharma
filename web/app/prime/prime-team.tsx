"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type PrimeTeamData = {
  members: Array<{ userId: string; name: string; email: string; role: string; roleLabel: string; active: boolean }>;
  invites: Array<{ id: string; email: string; roleLabel: string | null; expiresAt: string }>;
};

const roles = [["ANALYST", "Visualizador"], ["ADMIN", "Administrador"]] as const;

/** Responsável e Administrador cuidam do próprio time; o Responsável é definido pela Nexus. */
export function PrimeTeam({ team, currentUserId }: { team: PrimeTeamData; currentUserId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [perfil, setPerfil] = useState<string>("ANALYST");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; tone: "ok" | "error"; link?: string } | null>(null);

  async function request(path: string, method: "POST" | "PATCH", body: unknown) {
    const response = await fetch(`/api/prime/${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: response.ok, payload: (await response.json().catch(() => ({}))) as { message?: string; inviteUrl?: string; delivery?: { automatic?: boolean } } };
  }
  async function invite() {
    setBusy("invite");
    setFeedback(null);
    const result = await request("equipe/convites", "POST", { email, perfil });
    setBusy(null);
    if (!result.ok) return setFeedback({ tone: "error", text: result.payload.message ?? "Não foi possível convidar." });
    setEmail("");
    setFeedback(result.payload.delivery?.automatic ? { tone: "ok", text: "Convite enviado por e-mail." } : { tone: "ok", text: "Convite criado. Envie o link abaixo para a pessoa (vale por 72 horas, uma única vez).", link: result.payload.inviteUrl });
    router.refresh();
  }
  async function toggle(userId: string, active: boolean) {
    setBusy(userId);
    setFeedback(null);
    const result = await request(`equipe/membros/${userId}`, "PATCH", { ativo: !active });
    setBusy(null);
    if (result.ok) router.refresh(); else setFeedback({ tone: "error", text: result.payload.message ?? "Não foi possível alterar o acesso." });
  }

  return (
    <section className="prime-team" id="equipe">
      <div className="prime-section-title"><div><span>SUA EQUIPE</span><h2>Quem acessa este painel</h2><p>Todos veem os mesmos dados, só para consulta. Administradores também convidam e suspendem.</p></div><strong>{team.members.filter((member) => member.active).length}</strong></div>
      <div className="prime-team-list">
        {team.members.map((member) => (
          <div className="prime-team-row" key={member.userId}>
            <div><strong>{member.name}{member.userId === currentUserId ? " (você)" : ""}</strong><small>{member.email} · {member.roleLabel}</small></div>
            <span className={member.active ? "prime-chip ok" : "prime-chip off"}>{member.active ? "Ativo" : "Suspenso"}</span>
            {member.userId !== currentUserId && member.role !== "OWNER"
              ? <button disabled={busy === member.userId} onClick={() => toggle(member.userId, member.active)} type="button">{member.active ? "Suspender" : "Reativar"}</button>
              : <span />}
          </div>
        ))}
        {team.invites.map((item) => (
          <div className="prime-team-row" key={item.id}>
            <div><strong>{item.email}</strong><small>{item.roleLabel ?? "Convite"} · convite pendente</small></div>
            <span className="prime-chip wait">Aguardando</span>
            <span />
          </div>
        ))}
      </div>
      <div className="prime-team-invite">
        <label>E-mail<input placeholder="nome@empresa.com.br" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Perfil<select value={perfil} onChange={(event) => setPerfil(event.target.value)}>{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button disabled={busy === "invite" || !email} onClick={invite} type="button">{busy === "invite" ? "Enviando…" : "Convidar"}</button>
      </div>
      {feedback && <p className={feedback.tone === "ok" ? "prime-message" : "prime-message error"}>{feedback.text}{feedback.link && <><br /><code>{feedback.link}</code></>}</p>}
    </section>
  );
}
