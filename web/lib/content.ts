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
  setupPrice: number;
  successFeeRate: number;
  hasFineTuning: boolean;
  features: string[];
  featured?: boolean;
};

export const fallbackPlans: CommercialPlan[] = [
  {
    code: "BASIC",
    name: "Basic",
    description: "A base operacional para organizar a rotina da farmácia.",
    monthlyPrice: 698,
    yearlyPrice: 8376,
    setupPrice: 890,
    successFeeRate: 0,
    hasFineTuning: false,
    features: ["Vendas e PDV", "Estoque básico", "Financeiro", "1 loja e 1 PDV inclusos"],
  },
  {
    code: "SMART",
    name: "Smart",
    description: "Automação para comprar melhor e perder menos por validade.",
    monthlyPrice: 1199,
    yearlyPrice: 14388,
    setupPrice: 890,
    successFeeRate: 0,
    hasFineTuning: false,
    features: ["Tudo do Basic", "IA de compras", "Automação de estoque e pedidos", "Controle inteligente de validades"],
  },
  {
    code: "FISCAL_INTELIGENTE",
    name: "Fiscal Inteligente",
    description: "Gestão e motor tributário trabalhando em tempo real.",
    monthlyPrice: 1990,
    yearlyPrice: 23880,
    setupPrice: 890,
    successFeeRate: 0.1,
    hasFineTuning: false,
    features: ["Tudo do Smart", "Motor tributário em tempo real", "Economia auditável", "Success Fee de 10% somente sobre economia real"],
    featured: true,
  },
  {
    code: "ULTIMATE",
    name: "Ultimate",
    description: "Implantação completa com ajuste fino tributário da base.",
    monthlyPrice: 2498,
    yearlyPrice: 29976,
    setupPrice: 10000,
    successFeeRate: 0.1,
    hasFineTuning: true,
    features: ["Tudo do Fiscal Inteligente", "Consultoria tributária inicial", "Ajuste fino da base", "Success Fee de 10% sobre economia homologada"],
  },
];
