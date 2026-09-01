"use client";

import { useState } from "react";
import readXlsxFile from "read-excel-file";
import { registrationApi } from "../cadastro-types";

type ImportRow = { id: string; rowNumber: number; action: "CREATE" | "UPDATE"; rawData: Record<string, unknown>; normalizedData: Record<string, unknown>; errors: string[]; warnings: string[] };
export type ProductImportBatch = {
  id: string; fileName: string; fileType: string; payloadHash: string; status: string; rowCount: number; validRowCount: number; errorRowCount: number;
  summary: { creates?: number; updates?: number; categoriesAffected?: number; suppliersAffected?: number; estimatedUnitMarginBefore?: number; estimatedUnitMarginAfter?: number };
  rejectionReason: string | null; createdAt: string; submittedAt: string | null; appliedAt: string | null;
  createdBy: { id: string; name: string }; reviewedBy: { id: string; name: string } | null; rows: ImportRow[];
};

const headers = ["gtin", "nome", "categoria_codigo", "fabricante", "fornecedor_cnpj", "registro_anvisa", "composicao", "principio_ativo", "custo", "preco_venda", "estoque_minimo", "media_venda_diaria", "ativo"];
const labels: Record<string, string> = { VALIDATED: "Pré-validada", PENDING_APPROVAL: "Aguardando aprovação", APPLIED: "Aplicada", REJECTED: "Rejeitada", FAILED: "Falhou" };

function parseCsv(text: string) {
  const result: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const current = text[index]; const next = text[index + 1];
    if (current === '"' && quoted && next === '"') { cell += '"'; index += 1; }
    else if (current === '"') quoted = !quoted;
    else if ((current === ";" || current === ",") && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((current === "\n" || current === "\r") && !quoted) { if (current === "\r" && next === "\n") index += 1; row.push(cell.trim()); if (row.some(Boolean)) result.push(row); row = []; cell = ""; }
    else cell += current;
  }
  row.push(cell.trim()); if (row.some(Boolean)) result.push(row); return result;
}

function normalizeHeader(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const aliases: Record<string, string> = { ean: "gtin", codigo_barras: "gtin", produto: "nome", categoria: "categoria_codigo", laboratorio: "fabricante", cnpj_fornecedor: "fornecedor_cnpj", anvisa: "registro_anvisa", valor_entrada: "custo", preco: "preco_venda", venda: "preco_venda", estoque_minimo_critico: "estoque_minimo", media_diaria: "media_venda_diaria" };
  return aliases[normalized] ?? normalized;
}

function rowsToRecords(matrix: unknown[][]) {
  const fileHeaders = (matrix[0] ?? []).map(normalizeHeader);
  return matrix.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim())).map((row) => Object.fromEntries(fileHeaders.map((header, index) => [header, row[index] ?? ""])));
}

export function BulkProductImport({ initial, role, userId }: { initial: ProductImportBatch[]; role: string; userId: string }) {
  const [batches, setBatches] = useState(initial); const [selected, setSelected] = useState(initial[0]?.id ?? "");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const canCreate = ["OWNER", "ADMIN", "MANAGER", "PHARMACIST"].includes(role); const canReview = ["OWNER", "ADMIN", "MANAGER"].includes(role);
  const active = batches.find((entry) => entry.id === selected) ?? batches[0];

  async function reload(id?: string) { const data = await registrationApi("importacoes") as ProductImportBatch[]; setBatches(data); setSelected(id ?? data[0]?.id ?? ""); }
  async function preview(file: File) {
    setBusy(true); setError(""); setMessage("");
    try {
      const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
      const matrix = isXlsx ? await readXlsxFile(file) : parseCsv(await file.text());
      const records = rowsToRecords(matrix);
      if (!records.length) throw new Error("O arquivo não possui linhas de produtos.");
      const missing = ["gtin", "nome", "categoria_codigo", "custo", "preco_venda"].filter((header) => !(header in records[0]));
      if (missing.length) throw new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}.`);
      const batch = await registrationApi("importacoes/pre-validar", { method: "POST", body: JSON.stringify({ nome_arquivo: file.name, tipo_arquivo: isXlsx ? "XLSX" : "CSV", linhas: records }) }) as ProductImportBatch;
      await reload(batch.id); setMessage(batch.errorRowCount ? "Pré-validação concluída. Corrija as linhas marcadas e envie um novo arquivo." : "Pré-validação concluída sem erros. O lote pode seguir para aprovação.");
    } catch (cause) { setError(cause instanceof Error ? cause.message.replaceAll("_", " ") : "Falha ao pré-validar o arquivo."); } finally { setBusy(false); }
  }
  function downloadTemplate() {
    const blob = new Blob([`\uFEFF${headers.join(";")}\r\n`], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "modelo-importacao-produtos.csv"; anchor.click(); URL.revokeObjectURL(url);
  }
  async function action(path: string, init: RequestInit, success: string) {
    setBusy(true); setError(""); setMessage(""); try { await registrationApi(path, init); await reload(active?.id); setMessage(success); } catch (cause) { setError(cause instanceof Error ? cause.message.replaceAll("_", " ") : "Não foi possível concluir."); } finally { setBusy(false); }
  }
  function reject() { const reason = window.prompt("Justificativa da rejeição (mínimo 10 caracteres):"); if (reason) void action(`importacoes/${active.id}/revisar`, { method: "PUT", body: JSON.stringify({ decisao: "REJECTED", justificativa: reason }) }, "Importação rejeitada com justificativa registrada."); }

  return <details className="bulk-import" open={Boolean(active?.status === "PENDING_APPROVAL")}>
    <summary><span><strong>Importação em massa</strong><small>CSV/XLSX · pré-validação · quatro olhos · sem alterar estoque</small></span><b>{batches.filter((entry) => entry.status === "PENDING_APPROVAL").length} pendente(s)</b></summary>
    <div className="bulk-import-body">
      <div className="bulk-import-toolbar"><button className="secondary-button" onClick={downloadTemplate} type="button">Baixar modelo CSV</button>{canCreate && <label className="bulk-import-file">{busy ? "Processando…" : "Selecionar CSV ou XLSX"}<input accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void preview(file); event.currentTarget.value = ""; }} type="file"/></label>}<span>Máximo de 1.000 produtos por lote.</span></div>
      {(message || error) && <div className={`portal-feedback ${error ? "error" : ""}`}>{error || message}</div>}
      <div className="bulk-import-layout"><aside>{batches.map((batch) => <button className={active?.id === batch.id ? "active" : ""} key={batch.id} onClick={() => setSelected(batch.id)} type="button"><span className={`status-pill ${batch.status.toLowerCase()}`}>{labels[batch.status] ?? batch.status}</span><strong>{batch.fileName}</strong><small>{batch.validRowCount}/{batch.rowCount} válidas · {new Date(batch.createdAt).toLocaleString("pt-BR")}</small></button>)}{!batches.length && <p>Nenhuma importação criada.</p>}</aside>
        {active && <main><header><div><span>IMPACTO ANTES DE APLICAR</span><h3>{active.fileName}</h3><p>Criado por {active.createdBy.name}. Hash {active.payloadHash.slice(0, 12)}…</p></div><div>{active.status === "VALIDATED" && active.createdBy.id === userId && <button disabled={busy || active.errorRowCount > 0} onClick={() => action(`importacoes/${active.id}/enviar`, { method: "POST", body: "{}" }, "Lote enviado. Outro gerente deve revisar e aprovar.")} type="button">Enviar para aprovação</button>}{active.status === "PENDING_APPROVAL" && canReview && active.createdBy.id !== userId && <><button disabled={busy} onClick={() => action(`importacoes/${active.id}/revisar`, { method: "PUT", body: JSON.stringify({ decisao: "APPROVED" }) }, "Importação aprovada e aplicada ao cadastro.")} type="button">Aprovar e aplicar</button><button className="danger-button" disabled={busy} onClick={reject} type="button">Rejeitar</button></>}</div></header>
          <div className="bulk-impact"><span>Novos<strong>{active.summary.creates ?? 0}</strong></span><span>Atualizações<strong>{active.summary.updates ?? 0}</strong></span><span>Categorias<strong>{active.summary.categoriesAffected ?? 0}</strong></span><span>Fornecedores<strong>{active.summary.suppliersAffected ?? 0}</strong></span><span>Com erro<strong>{active.errorRowCount}</strong></span></div>
          {active.status === "PENDING_APPROVAL" && active.createdBy.id === userId && <p className="bulk-four-eyes">Aguardando outro proprietário, administrador ou gerente. O criador não pode aprovar o próprio lote.</p>}
          {active.rejectionReason && <p className="bulk-four-eyes error">Rejeitada: {active.rejectionReason}</p>}
          <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Linha</th><th>Ação</th><th>GTIN / produto</th><th>Categoria</th><th>Validação</th></tr></thead><tbody>{active.rows.map((row) => <tr key={row.id}><td>{row.rowNumber}</td><td>{row.action === "CREATE" ? "Criar" : "Atualizar"}</td><td><strong>{String(row.normalizedData.nome ?? "")}</strong><small>{String(row.normalizedData.gtin ?? "")}</small></td><td>{String(row.normalizedData.categoriaCodigo ?? "")}</td><td>{row.errors.length ? <em className="bulk-errors">{row.errors.join(" · ")}</em> : <span className="bulk-valid">Válida</span>}{row.warnings.length > 0 && <small>{row.warnings.join(" · ")}</small>}</td></tr>)}</tbody></table></div>
        </main>}
      </div>
    </div>
  </details>;
}
