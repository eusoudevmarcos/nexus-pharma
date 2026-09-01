export const features = [
  {
    number: "01",
    title: "Balcão conectado ao caixa",
    description: "Atendentes e farmacêuticos consultam preço e disponibilidade, leem o código de barras, identificam o consumidor, confirmam o pedido e enviam a pré-venda pronta ao caixa.",
    tag: "Operação de loja",
  },
  {
    number: "02",
    title: "Classificação fiscal assistida",
    description: "A IA organiza origem, destino, composição e enquadramento como hipótese revisável, sempre com evidências e histórico.",
    tag: "Motor fiscal",
  },
  {
    number: "03",
    title: "Tributação por categoria",
    description: "NCM, ICMS, PIS/COFINS e IBS/CBS ficam centralizados. Uma regra aprovada alimenta os produtos vinculados.",
    tag: "Menos retrabalho",
  },
  {
    number: "04",
    title: "Estoque que olha a margem",
    description: "Alertas combinam saldo, giro, validade e rentabilidade para mostrar o que realmente merece reposição.",
    tag: "Compra inteligente",
  },
  {
    number: "05",
    title: "Venda com memória fiscal",
    description: "Cada saída preserva um retrato da regra aplicada, permitindo auditoria, conferência e provisão gerencial.",
    tag: "Rastreabilidade",
  },
  {
    number: "06",
    title: "Gestão por perfil e responsabilidade",
    description: "Balcão, caixa, farmacêutico, compras, financeiro, fiscal e gestão trabalham em áreas próprias, com permissões e trilha de auditoria.",
    tag: "Governança",
  },
];

export const storeJourney = [
  { number: "01", title: "Atendimento no balcão", copy: "O atendente ou farmacêutico lê o código de barras, consulta medicamentos, preço e saldo e monta o pedido com o consumidor." },
  { number: "02", title: "Conferência e orientação", copy: "O sistema registra desconto autorizado, CPF e nome, valida exigências farmacêuticas e confirma itens e quantidades." },
  { number: "03", title: "Pré-venda enviada", copy: "O pedido recebe código e entra na fila da mesma loja. Nenhum pagamento ou baixa de estoque acontece no balcão." },
  { number: "04", title: "Recebimento no caixa", copy: "O operador chama a pré-venda, informa os meios de pagamento e conclui sem redigitar produtos ou dados do cliente." },
  { number: "05", title: "Gestão atualizada", copy: "A venda alimenta estoque, lotes, margem, financeiro e memória fiscal em uma única operação rastreável." },
];

export const departments = [
  { title: "Balcão e farmacêutico", copy: "Consulta por código de barras, nome ou princípio ativo; disponibilidade por loja; pedido, desconto, consumidor, prescrição e envio ao caixa." },
  { title: "Caixa e frente de loja", copy: "Fila de pré-vendas, venda direta quando necessário, pagamentos divididos, abertura, sangria, suprimento, conciliação e fechamento." },
  { title: "Produtos e estoque", copy: "Cadastro estruturado, categorias, GTIN, lotes, fabricação, validade, transferências, inventário, perdas e alerta de ruptura." },
  { title: "Compras", copy: "Sugestão por giro, sazonalidade, margem e validade, cotações, pedidos, limites de aprovação, fornecedores e recebimento." },
  { title: "Fiscal e tributário", copy: "NCM, CEST, ICMS, CST/CSOSN, PIS/COFINS, natureza da receita, IBS, CBS e cClassTrib com vigência, fonte e aprovação." },
  { title: "Financeiro", copy: "Contas a pagar e receber, parcelas, baixas, estornos, fluxo operacional, conciliação e visão por loja e empresa." },
  { title: "Gestão", copy: "Ruptura, giro, margem, validade, perdas evitadas, acurácia das recomendações, relatórios e detalhamento até produto e lote." },
  { title: "Administração e suporte", copy: "Usuários por perfil, revisão de acessos, MFA, helpdesk, sessões temporárias consentidas e auditoria das ações críticas." },
];

export const audiences = [
  { title: "Atendentes e farmacêuticos", copy: "Atendimento rápido no balcão e pedido completo enviado ao caixa sem redigitação." },
  { title: "Caixas", copy: "Recebimento objetivo, venda direta, pagamentos, conciliação e fechamento por sessão." },
  { title: "Gestores", copy: "Indicadores claros para comprar melhor, proteger margem e antecipar ruptura e perdas." },
  { title: "Fiscal", copy: "Regras versionadas, evidências, revisões e preparação estruturada para IBS e CBS." },
  { title: "Compras e financeiro", copy: "Reposição recomendada, aprovações, fornecedores, títulos, baixas e visão de caixa." },
  { title: "Helpdesk", copy: "Tickets, prioridade, SLA, mensagens internas e histórico por cliente." },
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
