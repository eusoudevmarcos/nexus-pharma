"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Decision = "PENDING" | "CONFIRMED" | "ADJUSTMENT_REQUIRED" | "REVOKED";
type ReviewSummary = { total: number; pending: number; confirmed?: number; adjustmentRequired: number; revoked: number; drift?: number };
export type AccessReviewListItem = {
  id: string; periodLabel: string; status: "OPEN" | "COMPLETED" | "CANCELLED"; dueAt: string; snapshotHash: string; notes: string | null; createdAt: string;
  createdBy: { id: string; name: string }; completedBy: { id: string; name: string } | null; completedAt: string | null; summary: ReviewSummary;
};
export type AccessReviewDetail = AccessReviewListItem & {
  items: Array<{
    id: string; membershipId: string; userNameSnapshot: string; userEmailSnapshot: string; roleSnapshot: string; activeSnapshot: boolean;
    decision: Decision; justification: string | null; reviewedAt: string | null; reviewedBy: { id: string; name: string } | null;
    drift: boolean; currentRole: string | null; currentActive: boolean | null;
  }>;
  summary: Required<ReviewSummary>;
};

const roleLabels: Record<string, string> = { OWNER: "Proprietário", ADMIN: "Administrador", MANAGER: "Gerente", BUYER: "Compras", FINANCE: "Financeiro loja", PHARMACIST: "Farmacêutico", OPERATOR: "Caixa", VIEWER: "Auditoria" };
const decisionLabels: Record<Decision, string> = { PENDING: "Pendente", CONFIRMED: "Confirmado", ADJUSTMENT_REQUIRED: "Ajuste necessário", REVOKED: "Revogado" };
const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR").format(new Date(value));

export function AccessReviewCenter({ campaigns, review, currentRole }: { campaigns: AccessReviewListItem[]; review: AccessReviewDetail | null; currentRole: string }) {
  const router = useRouter();
  const canManage = ["OWNER", "ADMIN"].includes(currentRole);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<{ itemId: string; decision: "ADJUSTMENT_REQUIRED" | "REVOKED"; name: string } | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const progress = review ? Math.round(((review.summary.total - review.summary.pending) / Math.max(review.summary.total, 1)) * 100) : 0;
  const nextQuarter = useMemo(() => {
    const now = new Date(); const quarter = Math.floor(now.getMonth() / 3) + 1;
    return `${quarter}º trimestre de ${now.getFullYear()}`;
  }, []);

  async function request(path: string, method: "POST" | "PUT", payload: unknown) {
    setBusy(true); setMessage("");
    const response = await fetch(`/api/portal/access-reviews${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => ({})) as { message?: string };
    if (!response.ok) setMessage(body.message ?? "Não foi possível concluir a operação.");
    else { setShowCreate(false); setShowComplete(false); setAction(null); router.refresh(); }
    setBusy(false);
  }

  function createReview(formData: FormData) {
    void request("", "POST", { periodo: formData.get("periodo"), prazo: formData.get("prazo"), observacoes: formData.get("observacoes") || null, confirmacao: "INICIAR REVISAO" });
  }

  function confirmItem(itemId: string) {
    if (!review) return;
    void request(`/${review.id}/itens/${itemId}`, "PUT", { decisao: "CONFIRMED" });
  }

  function submitDecision(formData: FormData) {
    if (!review || !action) return;
    void request(`/${review.id}/itens/${action.itemId}`, "PUT", { decisao: action.decision, justificativa: formData.get("justificativa"), ...(action.decision === "REVOKED" && { confirmacao: formData.get("confirmacao") }) });
  }

  function completeReview(formData: FormData) {
    if (!review) return;
    void request(`/${review.id}/concluir`, "POST", { confirmacao: formData.get("confirmacao"), observacoes: formData.get("observacoes") || null });
  }

  return <section className="access-review-center">
    <div className="users-toolbar access-review-toolbar"><div><span>RECERTIFICAÇÃO PERIÓDICA</span><strong>Revisão de acessos</strong><p>Confirme quem ainda precisa de cada perfil e gere evidência auditável.</p></div><div className="access-review-actions">{review && <a className="button button-secondary" href={`/api/portal/access-reviews/${review.id}/exportar.csv`}>Exportar CSV</a>}{canManage && !campaigns.some((campaign) => campaign.status === "OPEN") && <button className="button button-yellow" onClick={() => setShowCreate((value) => !value)} type="button">+ Abrir revisão</button>}</div></div>
    {message && <div className="access-review-message" role="alert">{message}</div>}
    {showCreate && <form action={createReview} className="access-review-form"><label>Período<input defaultValue={nextQuarter} name="periodo" required /></label><label>Prazo<input min={new Date().toISOString().slice(0, 10)} name="prazo" required type="date" /></label><label className="wide">Observações<textarea name="observacoes" placeholder="Objetivo e escopo desta revisão" /></label><div className="wide access-review-form-footer"><small>Ao iniciar, os perfis e situações atuais serão congelados em um snapshot com hash.</small><button className="button" disabled={busy} type="submit">{busy ? "Abrindo…" : "Confirmar abertura"}</button></div></form>}
    {!review ? <div className="access-review-empty"><span>✓</span><div><strong>Nenhuma campanha registrada</strong><p>Abra a primeira revisão para recertificar os acessos da equipe.</p></div></div> : <>
      <div className="access-review-overview"><div><span className={`review-status ${review.status.toLowerCase()}`}>{review.status === "OPEN" ? "Em revisão" : review.status === "COMPLETED" ? "Concluída" : "Cancelada"}</span><h3>{review.periodLabel}</h3><p>Aberta por {review.createdBy.name} · prazo {formatDate(review.dueAt)}</p><code title={review.snapshotHash}>HASH {review.snapshotHash.slice(0, 14)}</code></div><div className="access-progress"><strong>{progress}%</strong><span>analisado</span><div><i style={{ width: `${progress}%` }} /></div></div><dl><div><dt>Pendentes</dt><dd>{review.summary.pending}</dd></div><div><dt>Ajustes</dt><dd>{review.summary.adjustmentRequired}</dd></div><div><dt>Revogados</dt><dd>{review.summary.revoked}</dd></div><div><dt>Divergências</dt><dd>{review.summary.drift}</dd></div></dl></div>
      <div className="access-review-list">{review.items.map((item) => <article className={item.drift ? "has-drift" : ""} key={item.id}><span className="user-avatar">{item.userNameSnapshot.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div className="access-review-person"><strong>{item.userNameSnapshot}</strong><small>{item.userEmailSnapshot}</small><span>{roleLabels[item.roleSnapshot] ?? item.roleSnapshot} · {item.activeSnapshot ? "ativo no snapshot" : "inativo no snapshot"}</span></div><div className="access-review-current"><small>Situação atual</small><strong>{item.currentRole ? (roleLabels[item.currentRole] ?? item.currentRole) : "Vínculo removido"}</strong><span>{item.currentActive ? "Acesso ativo" : "Sem acesso"}{item.drift ? " · alterado após abertura" : ""}</span></div><div className="access-review-decision"><span className={`decision-${item.decision.toLowerCase()}`}>{decisionLabels[item.decision]}</span>{item.reviewedBy && <small>por {item.reviewedBy.name}</small>}</div>{canManage && review.status === "OPEN" && <div className="access-review-row-actions"><button disabled={busy} onClick={() => confirmItem(item.id)} type="button">Manter</button><button disabled={busy} onClick={() => setAction({ itemId: item.id, decision: "ADJUSTMENT_REQUIRED", name: item.userNameSnapshot })} type="button">Solicitar ajuste</button>{item.currentActive && <button className="danger-link" disabled={busy} onClick={() => setAction({ itemId: item.id, decision: "REVOKED", name: item.userNameSnapshot })} type="button">Revogar</button>}</div>}</article>)}</div>
      {canManage && review.status === "OPEN" && <div className="access-review-completion"><div><strong>Fechamento em quatro olhos</strong><span>{review.summary.pending ? `${review.summary.pending} acessos ainda precisam de decisão.` : "Todos os acessos foram analisados. Outro administrador deve concluir."}</span></div><button className="button" disabled={busy || review.summary.pending > 0} onClick={() => setShowComplete(true)} type="button">Concluir revisão</button></div>}
    </>}
    {action && <div className="access-review-modal" role="dialog" aria-modal="true"><form action={submitDecision}><div><span>{action.decision === "REVOKED" ? "AÇÃO CRÍTICA" : "REMÉDIO DE ACESSO"}</span><h3>{action.decision === "REVOKED" ? `Revogar ${action.name}?` : `Registrar ajuste para ${action.name}`}</h3><p>{action.decision === "REVOKED" ? "O vínculo será suspenso imediatamente e a decisão ficará na trilha de auditoria." : "A campanha registrará a inconsistência para correção administrativa."}</p></div><label>Justificativa<textarea minLength={10} name="justificativa" required /></label>{action.decision === "REVOKED" && <label>Digite <strong>REVOGAR ACESSO</strong><input autoComplete="off" name="confirmacao" pattern="REVOGAR ACESSO" required /></label>}<footer><button onClick={() => setAction(null)} type="button">Voltar</button><button className={action.decision === "REVOKED" ? "button danger-button" : "button"} disabled={busy} type="submit">Confirmar decisão</button></footer></form></div>}
    {showComplete && review && <div className="access-review-modal" role="dialog" aria-modal="true"><form action={completeReview}><div><span>QUATRO OLHOS</span><h3>Concluir a campanha</h3><p>A pessoa que abriu a revisão não pode encerrá-la. A exportação preservará o hash e todas as decisões.</p></div><label>Observação final<textarea name="observacoes" /></label><label>Digite <strong>CONCLUIR REVISAO</strong><input autoComplete="off" name="confirmacao" pattern="CONCLUIR REVISAO" required /></label><footer><button onClick={() => setShowComplete(false)} type="button">Voltar</button><button className="button" disabled={busy} type="submit">Concluir com evidência</button></footer></form></div>}
  </section>;
}
