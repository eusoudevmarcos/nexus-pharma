"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type SupportTicket = { id: string; code: string; area: string; priority: string; status: string; subject: string; slaDueAt: string | null; updatedAt: string; company: { id: string; tradeName: string } | null; createdBy: { name: string; email: string }; assignedTo: { id: string; name: string } | null; _count: { messages: number } };
export type SupportAgent = { id: string; name: string; email: string };
const statusLabels: Record<string, string> = { OPEN: "Aberto", IN_PROGRESS: "Em atendimento", WAITING_CUSTOMER: "Aguardando cliente", RESOLVED: "Resolvido", CLOSED: "Fechado" };

function TicketRow({ ticket, agents }: { ticket: SupportTicket; agents: SupportAgent[] }) {
  const router = useRouter();
  const [status, setStatus] = useState(ticket.status);
  const [agent, setAgent] = useState(ticket.assignedTo?.id ?? "");
  const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); const response = await fetch(`/api/portal/internal/tickets/${ticket.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, responsavel_id: agent || null }) }); if (response.ok) router.refresh(); setBusy(false); }
  return <div className="internal-row ticket-row"><span className={`priority-dot ${ticket.priority.toLowerCase()}`}/><div><strong>{ticket.code} · {ticket.subject}</strong><small>{ticket.company?.tradeName ?? "Atendimento interno"} · {ticket.createdBy.name} · {ticket._count.messages} mensagens</small></div><select aria-label={`Status de ${ticket.code}`} onChange={(event) => setStatus(event.target.value)} value={status}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label={`Responsável por ${ticket.code}`} onChange={(event) => setAgent(event.target.value)} value={agent}><option value="">Sem responsável</option>{agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button disabled={busy || (status === ticket.status && agent === (ticket.assignedTo?.id ?? ""))} onClick={save} type="button">{busy ? "…" : "Salvar"}</button></div>;
}

export function SupportQueue({ tickets, agents }: { tickets: SupportTicket[]; agents: SupportAgent[] }) {
  return <div className="internal-list">{tickets.map((ticket) => <TicketRow agents={agents} key={ticket.id} ticket={ticket}/>)}</div>;
}
