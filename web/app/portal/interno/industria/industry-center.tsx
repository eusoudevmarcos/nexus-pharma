"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Scope = { mode: "ALL" } | { mode: "OWN"; gs1Prefixes: string[] };
type Connection = { id: string; companyId: string; status: "ACTIVE" | "SUSPENDED" | "TERMINATED"; startsAt: string; company: { tradeName: string; city: string | null; state: string | null; status: string } };
type Member = { userId: string; name: string; email: string; role: string; roleLabel: string; active: boolean };
type Invite = { id: string; email: string; roleLabel: string | null; expiresAt: string };
export type IndustryOrganization = { id: string; code: string; legalName: string; tradeName: string; taxId: string | null; kind: "LABORATORY" | "DISTRIBUTOR" | "WHOLESALER"; status: "ACTIVE" | "SUSPENDED" | "CANCELLED"; scope: Scope; connections: Connection[]; members: Member[]; invites: Invite[] };
export type IndustryOverview = { primeEnabled: boolean; companies: Array<{ id: string; tradeName: string; city: string | null; state: string | null; status: string }>; organizations: IndustryOrganization[] };

const kindLabels = { LABORATORY: "Laboratório", DISTRIBUTOR: "Distribuidora", WHOLESALER: "Atacadista" } as const;
const statusLabels = { ACTIVE: "Ativa", SUSPENDED: "Suspensa", CANCELLED: "Cancelada" } as const;
const inviteRoles = [["OWNER", "Responsável"], ["ADMIN", "Administrador"], ["ANALYST", "Visualizador"]] as const;
const parsePrefixes = (text: string) => text.split(/[\s,;]+/).map((item) => item.replace(/\D/g, "")).filter(Boolean);
const place = (city: string | null, state: string | null) => (city && state ? `${city}/${state}` : state ?? city ?? "Local não informado");

async function send(path: string, method: "POST" | "PATCH" | "PUT", body: unknown) {
  const response = await fetch(`/api/portal/internal/industria/${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => ({}))) as { message?: string; inviteUrl?: string; delivery?: { automatic?: boolean } };
  return { ok: response.ok, payload, error: payload.message ?? "Não foi possível concluir a operação." };
}

function NewOrganizationForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ codigo: "", razao_social: "", nome_fantasia: "", cnpj: "", tipo: "LABORATORY", prefixos: "" });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setFeedback(null);
    const result = await send("organizacoes", "POST", {
      codigo: form.codigo, razao_social: form.razao_social, nome_fantasia: form.nome_fantasia, tipo: form.tipo,
      ...(form.cnpj.replace(/\D/g, "") && { cnpj: form.cnpj.replace(/\D/g, "") }),
      prefixos_gs1: parsePrefixes(form.prefixos),
    });
    setBusy(false);
    if (!result.ok) return setFeedback(result.error);
    setForm({ codigo: "", razao_social: "", nome_fantasia: "", cnpj: "", tipo: "LABORATORY", prefixos: "" });
    setOpen(false);
    router.refresh();
  }

  if (!open) return <div className="new-client-actions"><button onClick={() => setOpen(true)} type="button">+ Nova organização</button></div>;
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  return (
    <div className="new-client-panel">
      <div className="new-client-grid">
        <label>Tipo<select value={form.tipo} onChange={set("tipo")}>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Código interno<input placeholder="EMS" value={form.codigo} onChange={set("codigo")} /></label>
        <label>Nome fantasia<input value={form.nome_fantasia} onChange={set("nome_fantasia")} /></label>
        <label>Razão social<input value={form.razao_social} onChange={set("razao_social")} /></label>
        <label>CNPJ (opcional)<input inputMode="numeric" value={form.cnpj} onChange={set("cnpj")} /></label>
        <label>Prefixos GS1 (opcional)<input placeholder="7891234, 7895678" value={form.prefixos} onChange={set("prefixos")} /></label>
      </div>
      <p className="team-hint">
        Toda organização vê <b>todas as marcas</b> nas farmácias vinculadas: estoque baixo, vendas e validade, e decide o que oferecer.
        Os prefixos GS1 (7 a 12 dígitos) só servem se um dia a Nexus quiser restringir a organização aos próprios produtos.
      </p>
      <div className="new-client-actions">
        <button disabled={busy || !form.codigo || !form.razao_social || !form.nome_fantasia} onClick={create} type="button">{busy ? "Cadastrando…" : "Cadastrar organização"}</button>
        <button className="new-client-cancel" onClick={() => setOpen(false)} type="button">Cancelar</button>
        {feedback && <span className="invite-status error">{feedback}</span>}
      </div>
    </div>
  );
}

function ScopeEditor({ organization }: { organization: IndustryOrganization }) {
  const router = useRouter();
  const [mode, setMode] = useState(organization.scope.mode);
  const [prefixes, setPrefixes] = useState(organization.scope.mode === "OWN" ? organization.scope.gs1Prefixes.join(", ") : "");
  const [status, setStatus] = useState(organization.status);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  async function save() {
    setBusy(true);
    setFeedback(null);
    const result = await send(`organizacoes/${organization.id}`, "PATCH", { status, escopo_produtos: mode, ...(mode === "OWN" && { prefixos_gs1: parsePrefixes(prefixes) }) });
    setBusy(false);
    setFeedback(result.ok ? { tone: "ok", text: "Salvo. O painel da organização já reflete a mudança." } : { tone: "error", text: result.error });
    if (result.ok) router.refresh();
  }

  return (
    <div className="store-manager">
      <div className="store-manager-head"><span>Situação e produtos visíveis</span></div>
      <div className="store-add-form">
        <select aria-label="Situação" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="Produtos visíveis" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
          <option value="ALL">Todas as marcas (padrão)</option>
          <option value="OWN">Restringir aos próprios produtos (prefixo GS1)</option>
        </select>
        {mode === "OWN" && <input aria-label="Prefixos GS1" placeholder="7891234, 7895678" value={prefixes} onChange={(event) => setPrefixes(event.target.value)} />}
        <button disabled={busy} onClick={save} type="button">{busy ? "…" : "Salvar"}</button>
      </div>
      {mode === "OWN" && !parsePrefixes(prefixes).length && <p className="industry-warning">Restrição ligada sem prefixo GS1: a organização não verá nenhum produto.</p>}
      {feedback && <span className={feedback.tone === "ok" ? "invite-status" : "invite-status error"}>{feedback.text}</span>}
    </div>
  );
}

function ConnectionRow({ organization, connection }: { organization: IndustryOrganization; connection: Connection }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  async function change(status: Connection["status"]) {
    setBusy(true);
    setFeedback(null);
    const result = await send(`organizacoes/${organization.id}/conexoes`, "PUT", { empresa_id: connection.companyId, status });
    setBusy(false);
    if (result.ok) router.refresh(); else setFeedback(result.error);
  }
  const label = connection.status === "ACTIVE" ? "Compartilhando" : connection.status === "TERMINATED" ? "Encerrado" : "Suspenso";
  return (
    <div className="store-item">
      <div><strong>{connection.company.tradeName}</strong><small>{place(connection.company.city, connection.company.state)}{connection.company.status !== "ACTIVE" ? " · farmácia ainda não ativa" : ""}</small></div>
      <span className={`status-pill ${connection.status === "ACTIVE" ? "" : connection.status === "SUSPENDED" ? "pending" : "disabled"}`}>{label}</span>
      <div className="industry-actions">
        {connection.status === "ACTIVE" && <button className="team-suspend-btn" disabled={busy} onClick={() => change("SUSPENDED")} type="button">Suspender</button>}
        {connection.status !== "ACTIVE" && <button className="team-suspend-btn resume" disabled={busy} onClick={() => change("ACTIVE")} type="button">Religar</button>}
        {connection.status !== "TERMINATED" && <button className="team-suspend-btn" disabled={busy} onClick={() => change("TERMINATED")} type="button">Encerrar</button>}
      </div>
      {feedback && <em className="industry-error">{feedback}</em>}
    </div>
  );
}

function ConnectionsManager({ organization, companies }: { organization: IndustryOrganization; companies: IndustryOverview["companies"] }) {
  const router = useRouter();
  const linked = new Set(organization.connections.map((item) => item.companyId));
  const available = companies.filter((company) => !linked.has(company.id));
  const [companyId, setCompanyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  async function link() {
    setBusy(true);
    setFeedback(null);
    const result = await send(`organizacoes/${organization.id}/conexoes`, "PUT", { empresa_id: companyId, status: "ACTIVE" });
    setBusy(false);
    if (!result.ok) return setFeedback(result.error);
    setCompanyId("");
    router.refresh();
  }
  return (
    <div className="store-manager">
      <div className="store-manager-head"><span>Farmácias vinculadas ({organization.connections.filter((item) => item.status === "ACTIVE").length})</span></div>
      <div className="store-add-form">
        <select aria-label="Farmácia para vincular" value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
          <option value="">Escolha a farmácia…</option>
          {available.map((company) => <option key={company.id} value={company.id}>{company.tradeName} · {place(company.city, company.state)}</option>)}
        </select>
        <button disabled={busy || !companyId} onClick={link} type="button">{busy ? "…" : "Vincular"}</button>
        {feedback && <em>{feedback}</em>}
      </div>
      {organization.connections.length ? organization.connections.map((connection) => <ConnectionRow connection={connection} key={connection.id} organization={organization} />) : <p className="store-empty">Nenhuma farmácia vinculada: a organização ainda não vê dados.</p>}
    </div>
  );
}

function TeamManager({ organization }: { organization: IndustryOrganization }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [perfil, setPerfil] = useState<string>(organization.members.some((member) => member.role === "OWNER") ? "ANALYST" : "OWNER");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; tone: "ok" | "error"; link?: string } | null>(null);
  async function invite() {
    setBusy("invite");
    setFeedback(null);
    const result = await send(`organizacoes/${organization.id}/convites`, "POST", { email, perfil });
    setBusy(null);
    if (!result.ok) return setFeedback({ tone: "error", text: result.error });
    setEmail("");
    setFeedback(result.payload.delivery?.automatic ? { tone: "ok", text: "Convite enviado por e-mail." } : { tone: "ok", text: "Convite criado. O e-mail automático não está configurado: copie o link e envie você mesmo.", link: result.payload.inviteUrl });
    router.refresh();
  }
  async function toggle(member: Member) {
    setBusy(member.userId);
    setFeedback(null);
    const result = await send(`organizacoes/${organization.id}/membros/${member.userId}`, "PATCH", { ativo: !member.active });
    setBusy(null);
    if (result.ok) router.refresh(); else setFeedback({ tone: "error", text: result.error });
  }
  return (
    <div className="store-manager">
      <div className="store-manager-head"><span>Usuários da organização</span></div>
      {organization.members.map((member) => (
        <div className="store-item" key={member.userId}>
          <div><strong>{member.name}</strong><small>{member.email} · {member.roleLabel}</small></div>
          <span className={`status-pill ${member.active ? "" : "disabled"}`}>{member.active ? "Ativo" : "Suspenso"}</span>
          <button className={`team-suspend-btn${member.active ? "" : " resume"}`} disabled={busy === member.userId} onClick={() => toggle(member)} type="button">{member.active ? "Suspender" : "Reativar"}</button>
        </div>
      ))}
      {organization.invites.map((invite) => (
        <div className="store-item" key={invite.id}>
          <div><strong>{invite.email}</strong><small>{invite.roleLabel ?? "Convite"} · expira {new Date(invite.expiresAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</small></div>
          <span className="status-pill pending">Convite pendente</span>
        </div>
      ))}
      {!organization.members.length && !organization.invites.length && <p className="store-empty">Ninguém da organização tem acesso ainda. Convide primeiro o Responsável.</p>}
      <div className="invite-row">
        <label>E-mail<input type="email" placeholder="nome@laboratorio.com.br" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Perfil<select value={perfil} onChange={(event) => setPerfil(event.target.value)}>{inviteRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button disabled={busy === "invite" || !email || organization.status !== "ACTIVE"} onClick={invite} type="button">{busy === "invite" ? "Enviando…" : "Convidar"}</button>
        {feedback && <span className={feedback.tone === "ok" ? "invite-status" : "invite-status error"}>{feedback.text}{feedback.link && <><br /><code className="industry-link">{feedback.link}</code></>}</span>}
      </div>
    </div>
  );
}

function OrganizationCard({ organization, companies }: { organization: IndustryOrganization; companies: IndustryOverview["companies"] }) {
  const activeLinks = organization.connections.filter((item) => item.status === "ACTIVE").length;
  const activeUsers = organization.members.filter((item) => item.active).length;
  return (
    <article className="commercial-company-card industry-card">
      <div className="industry-card-head">
        <div>
          <strong>{organization.tradeName}</strong>
          <small>{kindLabels[organization.kind]} · {organization.code}{organization.taxId ? ` · CNPJ ${organization.taxId}` : ""}</small>
        </div>
        <span className={`status-pill ${organization.status === "ACTIVE" ? "" : organization.status === "SUSPENDED" ? "pending" : "disabled"}`}>{statusLabels[organization.status]}</span>
        <small className="industry-card-summary">{activeLinks} farmácia(s) · {activeUsers} usuário(s) · {organization.scope.mode === "ALL" ? "todas as marcas" : `prefixos ${organization.scope.gs1Prefixes.join(", ") || "não cadastrados"}`}</small>
      </div>
      <ScopeEditor organization={organization} />
      <ConnectionsManager companies={companies} organization={organization} />
      <TeamManager organization={organization} />
    </article>
  );
}

export function IndustryCenter({ overview }: { overview: IndustryOverview }) {
  return (
    <article className="report-panel full">
      <div className="panel-title"><div><span>ORGANIZAÇÕES B2B</span><h2>Laboratórios, distribuidoras e atacadistas</h2></div><strong>{overview.organizations.length}</strong></div>
      <p className="team-hint">
        Painel <b>só de consulta</b>: a organização vê em tempo real estoque, vendas, ruptura e validade dos produtos dela nas farmácias
        vinculadas. Nunca vê preço, margem, financeiro ou dados de clientes. Vincular farmácia e convidar usuários exige identidade confirmada (MFA).
      </p>
      <NewOrganizationForm />
      {overview.organizations.length
        ? <div className="internal-list commercial-contract-list">{overview.organizations.map((organization) => <OrganizationCard companies={overview.companies} key={organization.id} organization={organization} />)}</div>
        : <p className="store-empty">Nenhuma organização cadastrada.</p>}
    </article>
  );
}
