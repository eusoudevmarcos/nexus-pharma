"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SellOutTrend } from "./sellout-trend";
import { PrimeTeam, type PrimeTeamData } from "./prime-team";

type Amount = number | string;
type Opportunity = {
  id: string; type: "OUT_OF_STOCK" | "LOW_COVERAGE" | "EXPIRING" | "HIGH_DEMAND"; priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  currentStock: Amount; minimumStock: Amount; expiringQuantity: Amount; salesLast30Days: Amount; salesPrevious30Days: Amount; coverageDays: Amount | null; suggestedQuantity: Amount; logisticsWindowDays: number; dueAt: string;
  company: { id: string; tradeName: string; city: string | null; state: string | null }; store: { id: string; name: string }; product: { id: string; name: string; ean: string; laboratory: string };
  snapshot: { salesGrowthPercent?: number; nearestExpiryAt?: string | null };
};
type Preferences = { logisticsWindowDays: number; targetCoverageDays: number; lowCoverageDays: number; expiryWindowDays: number; highDemandGrowthPercent: number; alertOutOfStock: boolean; alertLowCoverage: boolean; alertExpiring: boolean; alertHighDemand: boolean; allowedStates: string[] };
type ProductRow = { ean: string; name: string; laboratory: string; stockUnits: number; today: number; last7: number; last30: number; pharmacies: number; pharmaciesInRupture: number; coverageDays: number | null };
type PharmacyRow = { companyId: string; tradeName: string; city: string | null; state: string | null; stockUnits: number; today: number; last30: number; ruptures: number; products: number };
export type PrimeDashboardData = {
  generatedAt: string; signalsSyncedAt: string;
  organization: { id: string; code: string; tradeName: string; kind: string };
  viewer: { role: string; roleLabel: string; governance: boolean; canManage: boolean };
  scope: { mode: "ALL" } | { mode: "OWN"; gs1Prefixes: string[] };
  preferences: Preferences;
  indicators: { opportunities: number; critical: number; clients: number; suggestedUnits: Amount; expiringUnits: Amount };
  regions: Array<{ state: string; city: string; opportunities: number; clients: number; suggestedUnits: Amount }>;
  opportunities: Opportunity[];
  live: { today: string; sellOut: { today: number; last7Days: number; last30Days: number }; stockUnits: number; pharmacies: number; productsTracked: number; ruptures: number; daily: Array<{ day: string; units: number }>; products: ProductRow[]; pharmacyRows: PharmacyRow[] };
};

const REFRESH_MS = 30_000;
const number = (value: Amount | null) => Number(value ?? 0);
const qty = (value: Amount | null) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(number(value));
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "—";
const clock = (value: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value));
const typeLabels = { OUT_OF_STOCK: "Ruptura", LOW_COVERAGE: "Baixa cobertura", EXPIRING: "Vencimento", HIGH_DEMAND: "Alta demanda" };
const typeIcons = { OUT_OF_STOCK: "!", LOW_COVERAGE: "↓", EXPIRING: "◷", HIGH_DEMAND: "↗" };
const kindLabels: Record<string, string> = { LABORATORY: "Laboratório", DISTRIBUTOR: "Distribuidora", WHOLESALER: "Atacadista", PLATFORM: "Governança Nexus" };
const ufs = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export function PrimeDashboard({ initial, team, currentUserId }: { initial: PrimeDashboardData; team: PrimeTeamData | null; currentUserId: string }) {
  const router = useRouter();
  const [live, setLive] = useState(true);
  const [query, setQuery] = useState(""); const [state, setState] = useState(""); const [type, setType] = useState("");
  const [settings, setSettings] = useState(initial.preferences); const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const opportunities = useMemo(() => initial.opportunities.filter((item) => (!state || item.company.state === state) && (!type || item.type === type) && (!query || `${item.product.name} ${item.product.laboratory} ${item.company.tradeName} ${item.company.city}`.toLowerCase().includes(query.toLowerCase()))), [initial.opportunities, query, state, type]);
  const maxRegion = Math.max(...initial.regions.map((item) => item.opportunities), 1);

  // Tempo real: relê o painel a cada 30 s enquanto a aba está visível.
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [live, router]);

  async function saveSettings() {
    setBusy(true); setMessage("");
    const response = await fetch("/api/prime/configuracoes", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
    setBusy(false);
    setMessage(response.ok ? "Preferências do radar atualizadas." : ((await response.json().catch(() => ({}))) as { message?: string }).message ?? "Não foi possível salvar as preferências.");
    if (response.ok) { setShowSettings(false); router.refresh(); }
  }

  const sell = initial.live.sellOut;
  return <div className="prime-dashboard">
    <section className="prime-hero">
      <div><span>{kindLabels[initial.organization.kind] ?? "Organização"} · {initial.organization.tradeName.toUpperCase()}</span><h1>Seus produtos nas farmácias, ao vivo</h1><p>Estoque, vendas, ruptura e validade em tempo real. Só consulta: nada aqui altera a operação da farmácia.</p></div>
      <div className="prime-hero-actions">
        <span className="prime-updated"><i className={live ? "on" : ""} />Atualizado às {clock(initial.generatedAt)}</span>
        <button className="ghost" onClick={() => setLive((value) => !value)} type="button">{live ? "Pausar atualização" : "Retomar ao vivo"}</button>
        {initial.viewer.canManage && <button className="ghost" onClick={() => setShowSettings((value) => !value)} type="button">⚙ Preferências</button>}
      </div>
    </section>
    {message && <div className="prime-message">{message}</div>}
    {initial.scope.mode === "OWN" && (initial.scope.gs1Prefixes.length
      ? <p className="prime-scope-note">Você vê só os produtos da sua marca: códigos de barras que começam com {initial.scope.gs1Prefixes.join(", ")}. Produtos de outras marcas não aparecem.</p>
      : <p className="prime-scope-note warn">Nenhum prefixo GS1 cadastrado para a sua marca, então nenhum produto aparece ainda. Fale com a Nexus para concluir o cadastro.</p>)}

    <section className="prime-kpis" id="ao-vivo">
      <article className="urgent"><span>VENDAS HOJE</span><strong>{qty(sell.today)}</strong><small>unidades até agora</small></article>
      <article><span>ÚLTIMOS 7 DIAS</span><strong>{qty(sell.last7Days)}</strong><small>unidades vendidas</small></article>
      <article><span>ÚLTIMOS 30 DIAS</span><strong>{qty(sell.last30Days)}</strong><small>unidades vendidas</small></article>
      <article><span>ESTOQUE NA REDE</span><strong>{qty(initial.live.stockUnits)}</strong><small>unidades disponíveis</small></article>
      <article><span>RUPTURAS</span><strong>{initial.live.ruptures}</strong><small>produto × farmácia zerados · {initial.live.pharmacies} farmácia(s)</small></article>
    </section>

    <section className="prime-live-grid">
      <article className="prime-panel"><SellOutTrend daily={initial.live.daily} /></article>
      <article className="prime-panel" id="regioes"><div className="prime-section-title"><div><span>ONDE ESTÃO OS SINAIS</span><h2>Praças com alerta</h2></div><strong>{initial.regions.length}</strong></div><div className="prime-region-list">{initial.regions.length ? initial.regions.slice(0, 8).map((region) => <button key={`${region.state}-${region.city}`} onClick={() => { setState(region.state); setQuery(region.city === "Não informado" ? "" : region.city); document.getElementById("sinais")?.scrollIntoView({ behavior: "smooth" }); }} type="button"><div><b>{region.city}</b><span>{region.state} · {region.clients} farmácia(s)</span></div><div className="region-bar"><i style={{ width: `${Math.max(8, region.opportunities / maxRegion * 100)}%` }}/></div><strong>{region.opportunities}<small>alertas</small></strong></button>) : <p className="prime-empty-inline">Nenhum alerta ativo agora.</p>}</div></article>
    </section>

    <section className="prime-panel" id="produtos">
      <div className="prime-section-title"><div><span>POR PRODUTO</span><h2>Estoque e giro na rede</h2><p>Cada código de barras somado em todas as farmácias vinculadas.</p></div><strong>{initial.live.productsTracked}</strong></div>
      {initial.live.products.length ? <div className="prime-table-wrap"><table className="prime-table"><thead><tr><th scope="col">Produto</th><th scope="col">Estoque</th><th scope="col">Hoje</th><th scope="col">7 dias</th><th scope="col">30 dias</th><th scope="col">Cobertura</th><th scope="col">Farmácias zeradas</th></tr></thead><tbody>{initial.live.products.map((row) => <tr key={row.ean}><th scope="row"><strong>{row.name}</strong><small>{row.laboratory || "Laboratório não informado"} · EAN {row.ean}</small></th><td>{qty(row.stockUnits)}</td><td>{qty(row.today)}</td><td>{qty(row.last7)}</td><td>{qty(row.last30)}</td><td>{row.coverageDays === null ? "—" : `${qty(row.coverageDays)} dias`}</td><td className={row.pharmaciesInRupture ? "alert" : ""}>{row.pharmaciesInRupture} de {row.pharmacies}</td></tr>)}</tbody></table></div> : <p className="prime-empty-inline">Nenhum produto no seu escopo nas farmácias vinculadas.</p>}
    </section>

    <section className="prime-panel" id="farmacias">
      <div className="prime-section-title"><div><span>POR FARMÁCIA</span><h2>Onde seus produtos estão</h2></div><strong>{initial.live.pharmacyRows.length}</strong></div>
      {initial.live.pharmacyRows.length ? <div className="prime-table-wrap"><table className="prime-table"><thead><tr><th scope="col">Farmácia</th><th scope="col">Estoque</th><th scope="col">Hoje</th><th scope="col">30 dias</th><th scope="col">Produtos zerados</th></tr></thead><tbody>{initial.live.pharmacyRows.map((row) => <tr key={row.companyId}><th scope="row"><strong>{row.tradeName}</strong><small>{row.city && row.state ? `${row.city}/${row.state}` : row.state ?? "Local não informado"}</small></th><td>{qty(row.stockUnits)}</td><td>{qty(row.today)}</td><td>{qty(row.last30)}</td><td className={row.ruptures ? "alert" : ""}>{row.ruptures} de {row.products}</td></tr>)}</tbody></table></div> : <p className="prime-empty-inline">Nenhuma farmácia compartilhando dados com você agora.</p>}
    </section>

    {showSettings && initial.viewer.canManage && <section className="prime-settings" id="configuracoes"><div className="prime-section-title"><div><span>PREFERÊNCIAS DO RADAR</span><h2>O que conta como alerta</h2><p>Ajusta só a sua visão. Nada disso muda a operação da farmácia.</p></div><button onClick={() => setShowSettings(false)} type="button">×</button></div><div className="prime-settings-grid"><label>Janela logística<select value={settings.logisticsWindowDays} onChange={(event) => setSettings({ ...settings, logisticsWindowDays: Number(event.target.value) })}>{[2,3,4,5].map((day) => <option key={day} value={day}>{day} dias</option>)}</select><small>Prazo para a reposição chegar.</small></label><label>Cobertura desejada<input min={7} max={90} type="number" value={settings.targetCoverageDays} onChange={(event) => setSettings({ ...settings, targetCoverageDays: Number(event.target.value) })}/><small>Dias usados na reposição sugerida.</small></label><label>Alerta de baixa cobertura<input min={1} max={45} type="number" value={settings.lowCoverageDays} onChange={(event) => setSettings({ ...settings, lowCoverageDays: Number(event.target.value) })}/><small>Dispara abaixo deste número de dias.</small></label><label>Janela de vencimento<select value={settings.expiryWindowDays} onChange={(event) => setSettings({ ...settings, expiryWindowDays: Number(event.target.value) })}>{[30,60,90,120,180].map((day) => <option key={day} value={day}>{day} dias</option>)}</select><small>Lotes que vencem dentro deste prazo.</small></label></div><div className="prime-alert-toggles"><Toggle checked={settings.alertOutOfStock} label="Ruptura" onChange={(checked) => setSettings({ ...settings, alertOutOfStock: checked })}/><Toggle checked={settings.alertLowCoverage} label="Baixa cobertura" onChange={(checked) => setSettings({ ...settings, alertLowCoverage: checked })}/><Toggle checked={settings.alertExpiring} label="Vencimento" onChange={(checked) => setSettings({ ...settings, alertExpiring: checked })}/><Toggle checked={settings.alertHighDemand} label="Alta demanda" onChange={(checked) => setSettings({ ...settings, alertHighDemand: checked })}/></div><button className="primary save-prime-settings" disabled={busy} onClick={saveSettings} type="button">{busy ? "Salvando…" : "Salvar preferências"}</button></section>}

    <section className="prime-opportunities" id="sinais">
      <div className="prime-section-title opportunity-title"><div><span>SINAIS DE ABASTECIMENTO · {initial.indicators.critical} CRÍTICO(S)</span><h2>Ruptura, cobertura, validade e demanda</h2><p>Recalculado a cada minuto. Reposição sugerida para recompor {settings.targetCoverageDays} dias de cobertura.</p></div><strong>{opportunities.length}</strong></div>
      <div className="prime-filters"><label><span>⌕</span><input aria-label="Buscar sinal" placeholder="Produto, farmácia ou cidade" value={query} onChange={(event) => setQuery(event.target.value)}/></label><select aria-label="Filtrar estado" value={state} onChange={(event) => setState(event.target.value)}><option value="">Todos os estados</option>{ufs.map((uf) => <option key={uf}>{uf}</option>)}</select><select aria-label="Filtrar sinal" value={type} onChange={(event) => setType(event.target.value)}><option value="">Todos os sinais</option>{Object.entries(typeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>{(query || state || type) && <button onClick={() => { setQuery(""); setState(""); setType(""); }} type="button">Limpar</button>}</div>
      <div className="prime-opportunity-table readonly"><div className="prime-table-head"><span>Prioridade e farmácia</span><span>Produto</span><span>Sinal</span><span>Reposição sugerida</span></div>{opportunities.length ? opportunities.map((item) => <SignalRow item={item} key={item.id}/>) : <div className="prime-empty"><strong>Nenhum sinal neste recorte.</strong><p>Altere os filtros ou aguarde a próxima leitura.</p></div>}</div>
    </section>

    {team && <PrimeTeam currentUserId={currentUserId} team={team} />}
  </div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="prime-toggle"><input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox"/><i/><span>{label}</span></label>; }

function SignalRow({ item }: { item: Opportunity }) {
  const growth = item.snapshot?.salesGrowthPercent ?? (number(item.salesPrevious30Days) ? ((number(item.salesLast30Days) - number(item.salesPrevious30Days)) / number(item.salesPrevious30Days)) * 100 : 0);
  return <article className={`prime-opportunity-row priority-${item.priority.toLowerCase()}`}><div className="prime-client-cell"><span className={`prime-signal-icon signal-${item.type.toLowerCase()}`}>{typeIcons[item.type]}</span><div><strong>{item.company.tradeName}</strong><small>{item.company.city ?? "Local não informado"}/{item.company.state ?? "--"} · {item.store.name}</small><em>{item.priority === "CRITICAL" ? "Prioridade imediata" : item.priority === "HIGH" ? "Alta prioridade" : "Monitorar"}</em></div></div><div className="prime-product-cell"><strong>{item.product.name}</strong><small>{item.product.laboratory || "Laboratório não informado"} · EAN {item.product.ean}</small><span>{typeLabels[item.type]}</span></div><div className="prime-signal-data"><div><span>Saldo</span><b>{qty(item.currentStock)}</b></div><div><span>Vendas 30d</span><b>{qty(item.salesLast30Days)}</b></div><div><span>A vencer</span><b>{qty(item.expiringQuantity)}</b></div>{item.type === "HIGH_DEMAND" && <em>↗ {growth.toFixed(0)}%</em>}</div><div className="prime-preparation"><span>Reposição sugerida</span><strong>{qty(item.suggestedQuantity)} <small>un.</small></strong><em>Para chegar até {date(item.dueAt)}</em>{item.coverageDays !== null && <small>{qty(item.coverageDays)} dias de cobertura</small>}</div></article>;
}
