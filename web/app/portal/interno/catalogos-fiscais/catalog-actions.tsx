"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { date } from "../../report-ui";

export type ReviewRelease = { id: string; catalog: string; sourceVersion: string; itemCount: number; sourcePublishedAt: string | null; payloadHash: string | null; importedBy: { name: string } | null };
export type ReviewRule = { id: string; name: string; ncmPattern: string; cestPattern: string | null; regime: string; validFrom: string; evidenceHash: string | null };

function ActivateReleaseButton({ release }: { release: ReviewRelease }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  async function activate() {
    setBusy(true);
    setFeedback(null);
    const response = await fetch(`/api/portal/internal/fiscal-catalogs/${release.id}/activate`, { method: "POST" });
    if (response.ok) {
      setFeedback({ tone: "ok", text: "Catálogo ativado." });
      router.refresh();
    } else {
      const body = await response.json().catch(() => ({}));
      const messages: Record<string, string> = { MFA_CONFIRMACAO_RECENTE_OBRIGATORIA: "Confirme o MFA recentemente para ativar (ação sensível de quatro olhos)." };
      setFeedback({ tone: "error", text: body.erro ? messages[body.erro] ?? body.message ?? "Não foi possível ativar." : (body.message ?? "Não foi possível ativar.") });
    }
    setBusy(false);
  }

  return (
    <div className="catalog-action">
      <button type="button" disabled={busy} onClick={activate}>
        {busy ? "Ativando..." : "Ativar"}
      </button>
      {feedback && <span className={feedback.tone === "ok" ? "invite-status" : "invite-status error"}>{feedback.text}</span>}
    </div>
  );
}

function ApproveMatrixPackage({ evidenceHash, ruleCount }: { evidenceHash: string; ruleCount: number }) {
  const router = useRouter();
  const [parecer, setParecer] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  async function approve() {
    setBusy(true);
    setFeedback(null);
    const response = await fetch(`/api/portal/internal/fiscal-matrix/${evidenceHash}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parecer }),
    });
    if (response.ok) {
      setFeedback({ tone: "ok", text: "Pacote homologado." });
      router.refresh();
    } else {
      const body = await response.json().catch(() => ({}));
      const messages: Record<string, string> = { MFA_CONFIRMACAO_RECENTE_OBRIGATORIA: "Confirme o MFA recentemente para homologar (ação sensível de quatro olhos)." };
      setFeedback({ tone: "error", text: body.erro ? messages[body.erro] ?? body.message ?? "Não foi possível homologar." : (body.message ?? "Não foi possível homologar.") });
    }
    setBusy(false);
  }

  return (
    <div className="matrix-package">
      <div className="matrix-package-head">
        <strong>Pacote {evidenceHash.slice(0, 12)}…</strong>
        <span>{ruleCount} regra(s)</span>
      </div>
      <textarea value={parecer} onChange={(event) => setParecer(event.target.value)} placeholder="Parecer do revisor (mín. 10 caracteres) — obrigatório para homologar" rows={2} />
      <div className="catalog-action">
        <button type="button" disabled={busy || parecer.trim().length < 10} onClick={approve}>
          {busy ? "Homologando..." : "Homologar pacote"}
        </button>
        {feedback && <span className={feedback.tone === "ok" ? "invite-status" : "invite-status error"}>{feedback.text}</span>}
      </div>
    </div>
  );
}

function ImportPanel({ title, description, placeholder, endpoint }: { title: string; description: string; placeholder: string; endpoint: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  async function submit() {
    let payload: unknown;
    try {
      payload = JSON.parse(json);
    } catch {
      setFeedback({ tone: "error", text: "JSON inválido — confira a formatação." });
      return;
    }
    setBusy(true);
    setFeedback(null);
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (response.ok) {
      setFeedback({ tone: "ok", text: "Importado. Segue para revisão de um segundo responsável antes de ativar." });
      setJson("");
      setOpen(false);
      router.refresh();
    } else {
      const body = await response.json().catch(() => ({}));
      setFeedback({ tone: "error", text: body.message ?? "Não foi possível importar. Confira a estrutura do JSON." });
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <div className="new-client-actions">
        <button type="button" onClick={() => setOpen(true)}>
          + {title}
        </button>
        {feedback && <span className={feedback.tone === "ok" ? "invite-status" : "invite-status error"}>{feedback.text}</span>}
      </div>
    );
  }

  return (
    <div className="new-client-panel">
      <p className="fiscal-import-description">{description}</p>
      <textarea className="fiscal-import-textarea" value={json} onChange={(event) => setJson(event.target.value)} placeholder={placeholder} rows={8} />
      <div className="new-client-actions">
        <button type="button" disabled={busy || !json.trim()} onClick={submit}>
          {busy ? "Importando..." : "Importar"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="new-client-cancel">
          Cancelar
        </button>
      </div>
      {feedback && <p className={feedback.tone === "ok" ? "invite-status" : "invite-status error"}>{feedback.text}</p>}
    </div>
  );
}

export function CatalogImportPanel() {
  return (
    <ImportPanel
      title="Importar catálogo oficial"
      description="Cole o JSON gerado pelo processo de extração das fontes oficiais (NCM, CEST, CST, CSOSN, IBS/CBS etc.)."
      placeholder='{"catalogo":"NCM","versao_fonte":"2026.09","url_fonte":"https://...","publicado_em":"2026-09-01","itens":[{"codigo":"30049099","descricao":"..."}]}'
      endpoint="/api/portal/internal/fiscal-catalogs/import"
    />
  );
}

export function MatrixImportPanel() {
  return (
    <ImportPanel
      title="Importar matriz tributária do DF"
      description="Cole o JSON com as regras extraídas do RICMS-DF e demais fontes oficiais, já com fundamento legal por regra."
      placeholder='{"versao_fonte":"2026.09","url_fonte":"https://...","publicado_em":"2026-09-01","referencia_legal":"Decreto 18.955/1997, art. ...","regras":[{"codigo":"...","nome":"...","regime":"SIMPLES_NACIONAL","ncm":"3004.90","prioridade":100,"resultado":{"icms":{"st":false,"csosn":"102"}},"vigencia_inicio":"2026-01-01"}]}'
      endpoint="/api/portal/internal/fiscal-matrix/import"
    />
  );
}

export function ReleaseReviewActions({ releases }: { releases: ReviewRelease[] }) {
  return (
    <div className="fiscal-review-list">
      {releases.map((release) => (
        <div key={release.id}>
          <span className="status-pill">REVISÃO</span>
          <div>
            <strong>
              {release.catalog} · {release.sourceVersion}
            </strong>
            <small>{release.itemCount} itens · publicado {release.sourcePublishedAt ? date(release.sourcePublishedAt) : "sem data"}</small>
            <small>Importado por {release.importedBy?.name ?? "não identificado"} · hash {release.payloadHash?.slice(0, 12) ?? "ausente"}</small>
          </div>
          <ActivateReleaseButton release={release} />
        </div>
      ))}
    </div>
  );
}

export function MatrixReviewActions({ rules }: { rules: ReviewRule[] }) {
  const groups = new Map<string, ReviewRule[]>();
  for (const rule of rules) {
    const hash = rule.evidenceHash ?? "sem-hash";
    groups.set(hash, [...(groups.get(hash) ?? []), rule]);
  }
  return (
    <div className="fiscal-review-list matrix-review-list">
      {Array.from(groups.entries()).map(([hash, group]) => (
        <div key={hash} className="matrix-package-wrap">
          {group.map((rule) => (
            <div key={rule.id}>
              <span className="status-pill">REVISÃO</span>
              <div>
                <strong>{rule.name}</strong>
                <small>
                  NCM {rule.ncmPattern}
                  {rule.cestPattern ? ` · CEST ${rule.cestPattern}` : ""} · {rule.regime.replaceAll("_", " ")}
                </small>
                <small>Vigência desde {date(rule.validFrom)}</small>
              </div>
            </div>
          ))}
          {hash !== "sem-hash" && <ApproveMatrixPackage evidenceHash={hash} ruleCount={group.length} />}
        </div>
      ))}
    </div>
  );
}
