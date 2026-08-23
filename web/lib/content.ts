export const features = [
  {
    number: "01",
    title: "Classificação fiscal assistida",
    description: "A IA organiza origem, destino, composição e enquadramento como hipótese revisável, sempre com evidências e histórico.",
    tag: "Motor fiscal",
  },
  {
    number: "02",
    title: "Tributação por categoria",
    description: "NCM, ICMS, PIS/COFINS e IBS/CBS ficam centralizados. Uma regra aprovada alimenta os produtos vinculados.",
    tag: "Menos retrabalho",
  },
  {
    number: "03",
    title: "Estoque que olha a margem",
    description: "Alertas combinam saldo, giro, validade e rentabilidade para mostrar o que realmente merece reposição.",
    tag: "Compra inteligente",
  },
  {
    number: "04",
    title: "Venda com memória fiscal",
    description: "Cada saída preserva um retrato da regra aplicada, permitindo auditoria, conferência e provisão gerencial.",
    tag: "Rastreabilidade",
  },
];

export const audiences = [
  { title: "Farmácias", copy: "Operação, estoque, validade, vendas e margem em um único contexto." },
  { title: "Gestores", copy: "Indicadores claros para comprar melhor e acompanhar resultado real." },
  { title: "Fiscal e contábil", copy: "Regras versionadas, evidências, revisões e trilha de auditoria." },
  { title: "Helpdesk", copy: "Tickets, prioridade, SLA, mensagens internas e histórico por cliente." },
  { title: "Financeiro", copy: "Planos, assinaturas, faturas, inadimplência e visão por empresa." },
  { title: "Desenvolvedores", copy: "Releases aprovadas por área e liberação gradual para cada cliente." },
];

export const securityItems = [
  "Dados isolados por empresa e associação validada no servidor",
  "Permissões distintas para equipe Nexus e operação da farmácia",
  "Sessões curtas com renovação rotativa e revogação",
  "Auditoria de alterações fiscais, produtos, vendas e liberações",
  "Revisão humana antes de transformar sugestão em regra aprovada",
  "Banco sem acesso público direto; somente a API se conecta",
];

export type CommercialPlan = {
  code: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  featured?: boolean;
};

export const fallbackPlans: CommercialPlan[] = [
  {
    code: "ESSENCIAL",
    name: "Essencial",
    description: "Para organizar a operação fiscal e o estoque da farmácia.",
    monthlyPrice: 299,
    yearlyPrice: 2990,
    features: ["Motor fiscal", "Estoque e validade", "Alertas de reposição", "Até 5 usuários"],
  },
  {
    code: "GESTAO",
    name: "Gestão",
    description: "Para decisões de margem, compras e atendimento prioritário.",
    monthlyPrice: 599,
    yearlyPrice: 5990,
    features: ["Tudo do Essencial", "IA fiscal assistida", "Indicadores de margem", "Suporte prioritário"],
    featured: true,
  },
  {
    code: "REDE",
    name: "Rede",
    description: "Para operações multiempresa com integrações e governança.",
    monthlyPrice: 1299,
    yearlyPrice: 12990,
    features: ["Tudo do Gestão", "API e webhooks", "Liberação por empresa", "SLA dedicado"],
  },
];
