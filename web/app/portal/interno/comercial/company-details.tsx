"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type CompanyStore = { id: string; code: string; name: string; type: string; pointsOfSale: Array<{ id: string; code: string; name: string }> };
type HistoryEntry = { id: string; action: string; before: unknown; after: unknown; createdAt: string; user: { name: string } | null };

const historyActionLabels: Record<string, string> = {
  COMPANY_CREATED: "Cliente cadastrado",
  COMPANY_PIPELINE_UPDATED: "Situação/etapa alterada",
  SUBSCRIPTION_CONFIGURED: "Contrato configurado",
  COMPANY_RESPONSIBLE_INVITED: "Responsável convidado",
  STORE_ACTIVATED: "Loja ativada",
  POINT_OF_SALE_ACTIVATED: "PDV ativado",
};
const localDateTime = (value: string) => new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function AddPdvForm({ storeId }: { storeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setFeedback(null);
    const response = await fetch(`/api/portal/internal/stores/${storeId}/pdvs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ codigo, nome }),
    });
    if (response.ok) {
      setCodigo("");
      setNome("");
      setOpen(false);
      router.refresh();
    } else {
      const body = await response.json().catch(() => ({}));
      setFeedback(body.message ?? "Não foi possível adicionar o PDV.");
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button type="button" className="store-inline-add" onClick={() => setOpen(true)}>
        + PDV
      </button>
    );
  }

  return (
    <span className="store-pdv-form">
      <input value={codigo} onChange={(event) => setCodigo(event.target.value)} placeholder="Código" />
      <input value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Nome" />
      <button type="button" disabled={busy || !codigo || !nome} onClick={submit}>
        {busy ? "..." : "Salvar"}
      </button>
      {feedback && <em>{feedback}</em>}
    </span>
  );
}

export function StoreManager({ companyId, stores }: { companyId: string; stores: CompanyStore[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"MAIN" | "BRANCH">("BRANCH");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setFeedback(null);
    const response = await fetch(`/api/portal/internal/companies/${companyId}/stores`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ codigo, nome, tipo }),
    });
    if (response.ok) {
      setCodigo("");
      setNome("");
      setOpen(false);
      router.refresh();
    } else {
      const body = await response.json().catch(() => ({}));
      setFeedback(body.message ?? "Não foi possível adicionar a loja.");
    }
    setBusy(false);
  }

  return (
    <div className="store-manager">
      <div className="store-manager-head">
        <span>LOJAS E PDVS</span>
        <button type="button" className="store-inline-add" onClick={() => setOpen((value) => !value)}>
          + Loja
        </button>
      </div>
      {open && (
        <div className="store-add-form">
          <input value={codigo} onChange={(event) => setCodigo(event.target.value)} placeholder="Código (ex.: FILIAL-02)" />
          <input value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Nome da loja" />
          <select value={tipo} onChange={(event) => setTipo(event.target.value as "MAIN" | "BRANCH")}>
            <option value="BRANCH">Filial</option>
            <option value="MAIN">Matriz</option>
          </select>
          <button type="button" disabled={busy || !codigo || !nome} onClick={submit}>
            {busy ? "Salvando..." : "Salvar"}
          </button>
          {feedback && <em>{feedback}</em>}
        </div>
      )}
      {stores.length ? (
        <div className="store-list">
          {stores.map((store) => (
            <div className="store-item" key={store.id}>
              <div>
                <strong>{store.name}</strong>
                <small>
                  {store.code} · {store.type === "MAIN" ? "Matriz" : "Filial"}
                </small>
              </div>
              <div className="store-pdv-list">
                {store.pointsOfSale.map((pdv) => (
                  <span key={pdv.id} className="store-pdv-chip">
                    {pdv.name}
                  </span>
                ))}
                <AddPdvForm storeId={store.id} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="store-empty">Nenhuma loja ativa ainda — a matriz é criada automaticamente ao ativar o contrato.</p>
      )}
    </div>
  );
}

export function ContractHistory({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (entries) return;
    setBusy(true);
    const response = await fetch(`/api/portal/internal/companies/${companyId}/history`);
    setEntries(response.ok ? await response.json() : []);
    setBusy(false);
  }

  return (
    <div className="contract-history">
      <button type="button" className="store-inline-add" onClick={toggle}>
        {open ? "Ocultar histórico de aditivos" : "Ver histórico de aditivos"}
      </button>
      {open && (
        <div className="history-list">
          {busy && <p className="store-empty">Carregando...</p>}
          {!busy && entries?.length === 0 && <p className="store-empty">Nenhum aditivo registrado ainda.</p>}
          {entries?.map((entry) => (
            <div className="history-item" key={entry.id}>
              <span>{localDateTime(entry.createdAt)}</span>
              <strong>{historyActionLabels[entry.action] ?? entry.action}</strong>
              <small>{entry.user?.name ?? "sistema"}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
