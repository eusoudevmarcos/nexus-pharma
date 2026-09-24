"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const taxRegimes = [
  { value: "SIMPLES_NACIONAL", label: "Simples Nacional" },
  { value: "LUCRO_PRESUMIDO", label: "Lucro Presumido" },
  { value: "LUCRO_REAL", label: "Lucro Real" },
];

const emptyForm = { razao_social: "", nome_fantasia: "", cnpj: "", uf: "", cidade: "", regime_tributario: "SIMPLES_NACIONAL" };

export function NewClientForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  function update<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setBusy(true);
    setFeedback(null);
    const response = await fetch("/api/portal/internal/companies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      setFeedback({ tone: "ok", text: "Cliente cadastrado. Convide o responsável e ative o contrato na lista abaixo." });
      setForm(emptyForm);
      setOpen(false);
      router.refresh();
    } else {
      const messages: Record<string, string> = { CNPJ_JA_CADASTRADO: "Já existe um cliente com este CNPJ." };
      setFeedback({ tone: "error", text: body.erro ? messages[body.erro] ?? body.message ?? "Não foi possível cadastrar o cliente." : (body.message ?? "Não foi possível cadastrar o cliente. Confira os campos obrigatórios.") });
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <div className="new-client-actions">
        <button type="button" onClick={() => setOpen(true)}>
          + Novo cliente
        </button>
        {feedback && <span className={feedback.tone === "ok" ? "invite-status" : "invite-status error"}>{feedback.text}</span>}
      </div>
    );
  }

  return (
    <div className="new-client-panel">
      <div className="new-client-grid">
        <label>
          Razão social
          <input value={form.razao_social} onChange={(event) => update("razao_social", event.target.value)} placeholder="Farmácia Exemplo LTDA" />
        </label>
        <label>
          Nome fantasia
          <input value={form.nome_fantasia} onChange={(event) => update("nome_fantasia", event.target.value)} placeholder="Farmácia Exemplo" />
        </label>
        <label>
          CNPJ
          <input value={form.cnpj} onChange={(event) => update("cnpj", event.target.value)} placeholder="00.000.000/0001-00" />
        </label>
        <label>
          UF
          <input value={form.uf} onChange={(event) => update("uf", event.target.value.toUpperCase())} maxLength={2} placeholder="DF" />
        </label>
        <label>
          Cidade
          <input value={form.cidade} onChange={(event) => update("cidade", event.target.value)} placeholder="Brasília" />
        </label>
        <label>
          Regime tributário
          <select value={form.regime_tributario} onChange={(event) => update("regime_tributario", event.target.value)}>
            {taxRegimes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="new-client-actions">
        <button type="button" disabled={busy || !form.razao_social || !form.nome_fantasia} onClick={submit}>
          {busy ? "Cadastrando..." : "Cadastrar cliente"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="new-client-cancel">
          Cancelar
        </button>
      </div>
      {feedback && <p className={feedback.tone === "ok" ? "invite-status" : "invite-status error"}>{feedback.text}</p>}
    </div>
  );
}
