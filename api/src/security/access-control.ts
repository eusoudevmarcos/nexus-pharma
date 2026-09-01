export const accessLevels = ["NONE", "VIEW", "OPERATE", "APPROVE", "ADMIN"] as const;
export type AccessLevel = (typeof accessLevels)[number];

export const tenantRoles = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "BUYER",
  "FINANCE",
  "PHARMACIST",
  "ATTENDANT",
  "OPERATOR",
  "VIEWER",
] as const;
export type TenantRoleCode = (typeof tenantRoles)[number];

export const systemRoles = [
  "INTERNAL_ADMIN",
  "DEVELOPER",
  "HELPDESK",
  "FINANCE",
  "COMMERCIAL",
] as const;
export type SystemRoleCode = (typeof systemRoles)[number];

type Profile<Role extends string> = {
  code: Role;
  name: string;
  shortName: string;
  purpose: string;
  responsibilities: readonly string[];
  boundaries: readonly string[];
  defaultArea: string;
};

type AccessDomain<Role extends string> = {
  code: string;
  name: string;
  description: string;
  access: Record<Role, AccessLevel>;
};

export const tenantProfiles: readonly Profile<TenantRoleCode>[] = [
  {
    code: "OWNER",
    name: "Proprietário",
    shortName: "Proprietário",
    purpose: "Responsável máximo pela empresa, continuidade do acesso e decisões críticas.",
    responsibilities: ["governança da conta", "usuários e administradores", "aprovações críticas", "visão integral"],
    boundaries: ["o último proprietário ativo não pode ser removido", "ações permanecem auditadas"],
    defaultArea: "/portal/gestao",
  },
  {
    code: "ADMIN",
    name: "Administrador da farmácia",
    shortName: "Administrador",
    purpose: "Administra configuração, equipe e operação diária sem assumir a titularidade protegida.",
    responsibilities: ["configurações", "gestão de usuários", "operação integral", "aprovações"],
    boundaries: ["não remove o proprietário protegido", "não acessa a Central Nexus"],
    defaultArea: "/portal/gestao",
  },
  {
    code: "MANAGER",
    name: "Gerente",
    shortName: "Gerente",
    purpose: "Coordena a operação, acompanha resultados e aprova movimentos sensíveis.",
    responsibilities: ["painel gerencial", "compras e estoque", "fechamentos", "aprovações operacionais"],
    boundaries: ["consulta usuários, mas não concede acesso", "não altera titularidade"],
    defaultArea: "/portal/gestao",
  },
  {
    code: "BUYER",
    name: "Compras e estoque",
    shortName: "Compras",
    purpose: "Evita ruptura e excesso por meio de cotações, pedidos, recebimento e giro.",
    responsibilities: ["cotações", "pedidos", "fornecedores", "recebimento NF-e", "estoque operacional"],
    boundaries: ["não aprova ajuste crítico sozinho", "não opera caixa, usuários ou contas a pagar"],
    defaultArea: "/portal/operacao",
  },
  {
    code: "FINANCE",
    name: "Financeiro da farmácia",
    shortName: "Financeiro loja",
    purpose: "Controla obrigações e resultados financeiros da farmácia, separado do Financeiro Nexus.",
    responsibilities: ["contas a pagar", "indicadores", "compras em consulta", "reembolsos e conciliação"],
    boundaries: ["não movimenta estoque", "não opera caixa nem configura tributação"],
    defaultArea: "/portal/gestao",
  },
  {
    code: "PHARMACIST",
    name: "Farmacêutico",
    shortName: "Farmacêutico",
    purpose: "Responde pela operação farmacêutica, medicamentos controlados e revisão fiscal assistida.",
    responsibilities: ["medicamentos", "classificação fiscal", "recebimento", "estoque", "apoio ao caixa"],
    boundaries: ["não administra usuários", "não opera contas a pagar ou compras comerciais"],
    defaultArea: "/portal/fiscal",
  },
  {
    code: "ATTENDANT",
    name: "Atendente de balcão",
    shortName: "Balcão",
    purpose: "Inicia o atendimento, consulta produtos e preços e encaminha a pré-venda confirmada ao caixa.",
    responsibilities: ["consulta de produtos", "registro do consumidor", "desconto permitido", "pré-venda e envio ao caixa"],
    boundaries: ["não recebe pagamentos", "não abre ou fecha caixa", "não altera estoque, fiscal ou financeiro"],
    defaultArea: "/portal/balcao",
  },
  {
    code: "OPERATOR",
    name: "Caixa / operador",
    shortName: "Caixa",
    purpose: "Executa venda, consulta e pós-venda com superfície mínima de acesso.",
    responsibilities: ["frente de caixa", "NFC-e", "consulta de produtos", "pós-venda permitido"],
    boundaries: ["sem painéis gerenciais", "sem cadastros fiscais, estoque administrativo ou usuários"],
    defaultArea: "/portal/caixa",
  },
  {
    code: "VIEWER",
    name: "Auditoria e consulta",
    shortName: "Auditoria",
    purpose: "Permite conferência ampla sem qualquer mutação operacional.",
    responsibilities: ["relatórios", "rastreabilidade", "conferência de estoque, compras e fiscal"],
    boundaries: ["nenhuma criação, edição, aprovação ou transmissão", "não administra usuários"],
    defaultArea: "/portal/gestao",
  },
] as const;

export const tenantDomains: readonly AccessDomain<TenantRoleCode>[] = [
  {
    code: "DASHBOARDS", name: "Painéis e alertas", description: "Indicadores de gestão, ruptura, validade, margem e relatórios.",
    access: { OWNER: "ADMIN", ADMIN: "ADMIN", MANAGER: "APPROVE", BUYER: "VIEW", FINANCE: "VIEW", PHARMACIST: "VIEW", ATTENDANT: "NONE", OPERATOR: "NONE", VIEWER: "VIEW" },
  },
  {
    code: "PRODUCTS", name: "Produtos e categorias", description: "Cadastros, composição, ANVISA, classificação e importação em massa.",
    access: { OWNER: "ADMIN", ADMIN: "ADMIN", MANAGER: "ADMIN", BUYER: "VIEW", FINANCE: "NONE", PHARMACIST: "OPERATE", ATTENDANT: "VIEW", OPERATOR: "VIEW", VIEWER: "VIEW" },
  },
  {
    code: "INVENTORY", name: "Estoque e lotes", description: "Entradas, lotes, validade, inventário, perdas e ajustes.",
    access: { OWNER: "ADMIN", ADMIN: "ADMIN", MANAGER: "APPROVE", BUYER: "OPERATE", FINANCE: "NONE", PHARMACIST: "OPERATE", ATTENDANT: "NONE", OPERATOR: "NONE", VIEWER: "VIEW" },
  },
  {
    code: "PURCHASING", name: "Compras e cotações", description: "Fornecedores, propostas, pedidos, aprovação e recebimento comercial.",
    access: { OWNER: "ADMIN", ADMIN: "ADMIN", MANAGER: "APPROVE", BUYER: "OPERATE", FINANCE: "VIEW", PHARMACIST: "NONE", ATTENDANT: "NONE", OPERATOR: "NONE", VIEWER: "VIEW" },
  },
  {
    code: "FINANCIAL", name: "Financeiro da farmácia", description: "Contas a pagar, parcelas, baixa, estorno e visão financeira.",
    access: { OWNER: "ADMIN", ADMIN: "ADMIN", MANAGER: "OPERATE", BUYER: "NONE", FINANCE: "OPERATE", PHARMACIST: "NONE", ATTENDANT: "NONE", OPERATOR: "NONE", VIEWER: "VIEW" },
  },
  {
    code: "POS", name: "Caixa e pós-venda", description: "Sessão de caixa, venda, pagamentos, devolução e conciliação.",
    access: { OWNER: "ADMIN", ADMIN: "ADMIN", MANAGER: "ADMIN", BUYER: "NONE", FINANCE: "VIEW", PHARMACIST: "OPERATE", ATTENDANT: "NONE", OPERATOR: "OPERATE", VIEWER: "VIEW" },
  },
  {
    code: "COUNTER_SERVICE", name: "Balcão e pré-venda", description: "Consulta, atendimento, identificação do consumidor e envio do pedido ao caixa.",
    access: { OWNER: "ADMIN", ADMIN: "ADMIN", MANAGER: "ADMIN", BUYER: "NONE", FINANCE: "NONE", PHARMACIST: "OPERATE", ATTENDANT: "OPERATE", OPERATOR: "VIEW", VIEWER: "VIEW" },
  },
  {
    code: "MEDICATIONS", name: "Medicamentos controlados", description: "Credenciais farmacêuticas, comprador, retenção e rastreabilidade.",
    access: { OWNER: "ADMIN", ADMIN: "ADMIN", MANAGER: "APPROVE", BUYER: "NONE", FINANCE: "NONE", PHARMACIST: "OPERATE", ATTENDANT: "NONE", OPERATOR: "NONE", VIEWER: "VIEW" },
  },
  {
    code: "FISCAL", name: "Motor fiscal e IA", description: "Análises, sugestões, propagação, trilha legal e aprovação em quatro olhos.",
    access: { OWNER: "ADMIN", ADMIN: "ADMIN", MANAGER: "APPROVE", BUYER: "NONE", FINANCE: "VIEW", PHARMACIST: "APPROVE", ATTENDANT: "NONE", OPERATOR: "NONE", VIEWER: "VIEW" },
  },
  {
    code: "DFE", name: "NF-e e recebimento", description: "Distribuição DFe, manifestação, conferência e devolução ao fornecedor.",
    access: { OWNER: "ADMIN", ADMIN: "ADMIN", MANAGER: "APPROVE", BUYER: "OPERATE", FINANCE: "NONE", PHARMACIST: "OPERATE", ATTENDANT: "NONE", OPERATOR: "NONE", VIEWER: "VIEW" },
  },
  {
    code: "NFCE", name: "NFC-e", description: "Preparação, transmissão, cancelamento, contingência e configuração fiscal.",
    access: { OWNER: "ADMIN", ADMIN: "ADMIN", MANAGER: "ADMIN", BUYER: "NONE", FINANCE: "NONE", PHARMACIST: "OPERATE", ATTENDANT: "NONE", OPERATOR: "OPERATE", VIEWER: "VIEW" },
  },
  {
    code: "USERS", name: "Usuários e acessos", description: "Convites, perfis, suspensão, sessões e responsabilidades.",
    access: { OWNER: "ADMIN", ADMIN: "ADMIN", MANAGER: "VIEW", BUYER: "NONE", FINANCE: "NONE", PHARMACIST: "NONE", ATTENDANT: "NONE", OPERATOR: "NONE", VIEWER: "NONE" },
  },
  {
    code: "PRIVACY", name: "Privacidade pessoal", description: "Solicitações LGPD da própria pessoa e acompanhamento do protocolo.",
    access: { OWNER: "OPERATE", ADMIN: "OPERATE", MANAGER: "OPERATE", BUYER: "OPERATE", FINANCE: "OPERATE", PHARMACIST: "OPERATE", ATTENDANT: "OPERATE", OPERATOR: "OPERATE", VIEWER: "OPERATE" },
  },
  {
    code: "SUPPORT", name: "Helpdesk e consentimento", description: "Chamados, conversa, SLA e autorização de diagnóstico temporário.",
    access: { OWNER: "ADMIN", ADMIN: "ADMIN", MANAGER: "OPERATE", BUYER: "OPERATE", FINANCE: "OPERATE", PHARMACIST: "OPERATE", ATTENDANT: "OPERATE", OPERATOR: "OPERATE", VIEWER: "OPERATE" },
  },
] as const;

export const systemProfiles: readonly Profile<SystemRoleCode>[] = [
  {
    code: "INTERNAL_ADMIN", name: "Administração Nexus", shortName: "Admin Nexus", purpose: "Governança corporativa, segurança, continuidade e segregação de funções.",
    responsibilities: ["governança interna", "segurança e DR", "homologações", "supervisão departamental"],
    boundaries: ["não entra diretamente na empresa do cliente", "diagnóstico exige consentimento, prazo, escopo somente leitura e auditoria"], defaultArea: "/portal/interno/monitoramento",
  },
  {
    code: "DEVELOPER", name: "Desenvolvimento", shortName: "Desenvolvedor", purpose: "Mantém produto, observabilidade, releases e importação técnica de catálogos.",
    responsibilities: ["monitoramento", "go-live", "releases", "importação de catálogos"],
    boundaries: ["não ativa catálogo oficial", "não acessa dados do cliente diretamente", "não opera financeiro ou comercial"], defaultArea: "/portal/interno/desenvolvimento",
  },
  {
    code: "HELPDESK", name: "Helpdesk", shortName: "Helpdesk", purpose: "Atende chamados sem herdar privilégios administrativos da farmácia.",
    responsibilities: ["triagem", "SLA", "comunicação e resolução de chamados"],
    boundaries: ["sem acesso direto ao tenant", "diagnóstico somente em sessão consentida, temporária e auditada", "sem financeiro, catálogo fiscal ou deploy"], defaultArea: "/portal/interno/suporte",
  },
  {
    code: "FINANCE", name: "Financeiro Nexus", shortName: "Financeiro Nexus", purpose: "Cuida do faturamento SaaS e contratos, separado do financeiro da farmácia.",
    responsibilities: ["assinaturas", "faturas SaaS", "economia auditada", "inadimplência"],
    boundaries: ["não acessa contas a pagar do cliente", "sem catálogo fiscal, deploy ou usuários da farmácia"], defaultArea: "/portal/interno/financeiro",
  },
  {
    code: "COMMERCIAL", name: "Comercial Nexus", shortName: "Comercial", purpose: "Conduz leads, propostas e onboarding sem acessar a operação do cliente.",
    responsibilities: ["pipeline", "propostas", "planos", "onboarding comercial"],
    boundaries: ["sem acesso direto à empresa", "sem faturamento, catálogo fiscal ou deploy"], defaultArea: "/portal/interno/comercial",
  },
] as const;

export const systemDomains: readonly AccessDomain<SystemRoleCode>[] = [
  { code: "OBSERVABILITY", name: "Monitoramento", description: "Saúde, incidentes e desempenho do SaaS.", access: { INTERNAL_ADMIN: "ADMIN", DEVELOPER: "OPERATE", HELPDESK: "NONE", FINANCE: "NONE", COMMERCIAL: "NONE" } },
  { code: "SECURITY", name: "Segurança", description: "Sessões, eventos, defesa e políticas de acesso.", access: { INTERNAL_ADMIN: "ADMIN", DEVELOPER: "VIEW", HELPDESK: "NONE", FINANCE: "NONE", COMMERCIAL: "NONE" } },
  { code: "PRIVACY_DR", name: "Privacidade e DR", description: "LGPD corporativa, retenção, backup e recuperação.", access: { INTERNAL_ADMIN: "ADMIN", DEVELOPER: "NONE", HELPDESK: "NONE", FINANCE: "NONE", COMMERCIAL: "NONE" } },
  { code: "GO_LIVE", name: "Go-live", description: "Preflight, prontidão e evidências de publicação.", access: { INTERNAL_ADMIN: "ADMIN", DEVELOPER: "OPERATE", HELPDESK: "NONE", FINANCE: "NONE", COMMERCIAL: "NONE" } },
  { code: "FISCAL_CATALOGS", name: "Catálogos oficiais", description: "Importação, comparação, homologação e ativação da base legal.", access: { INTERNAL_ADMIN: "ADMIN", DEVELOPER: "OPERATE", HELPDESK: "NONE", FINANCE: "NONE", COMMERCIAL: "NONE" } },
  { code: "HELPDESK", name: "Helpdesk", description: "Chamados, SLA e comunicação de suporte.", access: { INTERNAL_ADMIN: "ADMIN", DEVELOPER: "NONE", HELPDESK: "OPERATE", FINANCE: "NONE", COMMERCIAL: "NONE" } },
  { code: "SAAS_BILLING", name: "Financeiro e faturamento SaaS", description: "Planos, assinaturas, faturas e success fee.", access: { INTERNAL_ADMIN: "ADMIN", DEVELOPER: "NONE", HELPDESK: "NONE", FINANCE: "OPERATE", COMMERCIAL: "NONE" } },
  { code: "COMMERCIAL", name: "Comercial", description: "Leads, propostas, onboarding e conversão.", access: { INTERNAL_ADMIN: "ADMIN", DEVELOPER: "NONE", HELPDESK: "NONE", FINANCE: "NONE", COMMERCIAL: "OPERATE" } },
  { code: "DEVELOPMENT", name: "Desenvolvimento", description: "Releases, flags, integrações e qualidade técnica.", access: { INTERNAL_ADMIN: "ADMIN", DEVELOPER: "ADMIN", HELPDESK: "NONE", FINANCE: "NONE", COMMERCIAL: "NONE" } },
] as const;

const levelWeight = new Map<AccessLevel, number>(accessLevels.map((level, index) => [level, index]));

export function tenantRolesAtLeast(domainCode: string, level: Exclude<AccessLevel, "NONE">): TenantRoleCode[] {
  const domain = tenantDomains.find((item) => item.code === domainCode);
  if (!domain) throw new Error(`DOMINIO_DE_ACESSO_DESCONHECIDO:${domainCode}`);
  const minimum = levelWeight.get(level) ?? Number.POSITIVE_INFINITY;
  return tenantRoles.filter((role) => (levelWeight.get(domain.access[role]) ?? 0) >= minimum);
}

export function accessControlCatalog() {
  return {
    version: "2026.09.02",
    policy: {
      model: "RBAC_COM_MENOR_PRIVILEGIO",
      levels: accessLevels,
      principles: [
        "A API é a barreira efetiva; ocultar menu não concede segurança.",
        "Perfis Nexus não entram diretamente no ambiente da farmácia.",
        "Consulta não autoriza mutação, transmissão ou aprovação.",
        "Ações críticas exigem segregação e trilha de auditoria.",
        "Fornecedor futuro terá identidade B2B separada.",
      ],
    },
    tenant: { profiles: tenantProfiles, domains: tenantDomains },
    internal: { profiles: systemProfiles, domains: systemDomains },
  };
}
