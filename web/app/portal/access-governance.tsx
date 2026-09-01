export type AccessLevel = "NONE" | "VIEW" | "OPERATE" | "APPROVE" | "ADMIN";

type AccessProfile = {
  code: string;
  name: string;
  shortName: string;
  purpose: string;
  responsibilities: readonly string[];
  boundaries: readonly string[];
  defaultArea: string;
};

type AccessDomain = {
  code: string;
  name: string;
  description: string;
  access: Record<string, AccessLevel>;
};

export type AccessCatalog = {
  version: string;
  policy: { model: string; levels: readonly AccessLevel[]; principles: readonly string[] };
  tenant: { profiles: readonly AccessProfile[]; domains: readonly AccessDomain[] };
  internal: { profiles: readonly AccessProfile[]; domains: readonly AccessDomain[] };
};

const levelLabels: Record<AccessLevel, string> = {
  NONE: "—",
  VIEW: "Consulta",
  OPERATE: "Opera",
  APPROVE: "Aprova",
  ADMIN: "Administra",
};

const levelDescriptions: Record<Exclude<AccessLevel, "NONE">, string> = {
  VIEW: "consulta sem alterar",
  OPERATE: "executa o fluxo diário",
  APPROVE: "opera e autoriza ações sensíveis",
  ADMIN: "configura e governa o domínio",
};

export function AccessGovernance({
  catalog,
  scope,
  compact = false,
}: {
  catalog: AccessCatalog;
  scope: "tenant" | "internal";
  compact?: boolean;
}) {
  const data = catalog[scope];
  const isInternal = scope === "internal";
  return <section className={`access-governance ${compact ? "compact" : ""}`}>
    <div className="access-governance-heading">
      <div>
        <span>{isInternal ? "SEGREGAÇÃO CORPORATIVA" : "RESPONSABILIDADES DA FARMÁCIA"}</span>
        <h2>{isInternal ? "Perfis internos Nexus" : "Perfis da equipe"}</h2>
        <p>{isInternal ? "Cada departamento enxerga somente sua operação. Nenhum perfil interno herda acesso direto à empresa do cliente." : "Acesso é concedido por responsabilidade e por ação, não apenas pela tela exibida."}</p>
      </div>
      <div className="access-policy-version"><small>POLÍTICA</small><strong>{catalog.version}</strong></div>
    </div>

    <div className="access-profile-grid">
      {data.profiles.map((profile) => <article className="access-profile-card" key={profile.code}>
        <div className="access-profile-title"><span>{profile.shortName.slice(0, 2).toUpperCase()}</span><div><small>{profile.code}</small><h3>{profile.name}</h3></div></div>
        <p>{profile.purpose}</p>
        <div className="access-profile-list"><strong>Responsabilidades</strong><ul>{profile.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div className="access-boundary"><strong>Limites claros</strong><span>{profile.boundaries.join(" · ")}</span></div>
      </article>)}
    </div>

    <article className="access-matrix-panel">
      <div className="access-matrix-heading"><div><span>MATRIZ RBAC</span><h3>Permissão efetiva por domínio</h3><p>O maior nível mostrado inclui os níveis anteriores.</p></div><div className="access-legend">{(["VIEW", "OPERATE", "APPROVE", "ADMIN"] as const).map((level) => <span className={`level-${level.toLowerCase()}`} key={level}><i />{levelLabels[level]} <small>{levelDescriptions[level]}</small></span>)}</div></div>
      <div className="access-table-scroll">
        <table className="access-matrix-table">
          <thead><tr><th>Domínio</th>{data.profiles.map((profile) => <th key={profile.code}><span>{profile.shortName}</span><small>{profile.code}</small></th>)}</tr></thead>
          <tbody>{data.domains.map((domain) => <tr key={domain.code}><th><strong>{domain.name}</strong><small>{domain.description}</small></th>{data.profiles.map((profile) => { const level = domain.access[profile.code] ?? "NONE"; return <td key={profile.code}><span aria-label={`${profile.name}: ${levelLabels[level]}`} className={`access-level level-${level.toLowerCase()}`}>{levelLabels[level]}</span></td>; })}</tr>)}</tbody>
        </table>
      </div>
    </article>
  </section>;
}

export function AccessPrinciples({ catalog }: { catalog: AccessCatalog }) {
  return <article className="access-principles">
    <div><span>DEFESA EM CAMADAS</span><h2>O que torna o modelo seguro</h2><p>Menu, página e API seguem a mesma responsabilidade. O bloqueio real acontece no servidor.</p></div>
    <ol>{catalog.policy.principles.map((principle, index) => <li key={principle}><span>{String(index + 1).padStart(2, "0")}</span><p>{principle}</p></li>)}</ol>
  </article>;
}
