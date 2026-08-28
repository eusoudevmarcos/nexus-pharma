export type FiscalOption = {
  code: string;
  description: string;
};

export type RevenueNature = FiscalOption & {
  csts: string[];
  ncmPrefixes: string[];
  sourceVersion: string;
  sourceUrl: string;
};

export type IbsCbsClassification = FiscalOption & {
  cst: string;
  ncmPrefixes: string[];
  reduction: number;
  requiresAnvisa?: boolean;
  legalBasis: string;
  sourceVersion: string;
  sourceUrl: string;
};

export const PIS_COFINS_CSTS: FiscalOption[] = [
  { code: "01", description: "Operação tributável com alíquota básica" },
  { code: "02", description: "Operação tributável com alíquota diferenciada" },
  { code: "03", description: "Operação tributável por unidade de medida" },
  { code: "04", description: "Operação tributável monofásica — revenda a alíquota zero" },
  { code: "05", description: "Operação tributável por substituição tributária" },
  { code: "06", description: "Operação tributável a alíquota zero" },
  { code: "07", description: "Operação isenta da contribuição" },
  { code: "08", description: "Operação sem incidência da contribuição" },
  { code: "09", description: "Operação com suspensão da contribuição" },
  { code: "49", description: "Outras operações de saída" },
  { code: "50", description: "Crédito vinculado exclusivamente a receita tributada no mercado interno" },
  { code: "51", description: "Crédito vinculado exclusivamente a receita não tributada no mercado interno" },
  { code: "52", description: "Crédito vinculado exclusivamente a receita de exportação" },
  { code: "53", description: "Crédito vinculado a receitas tributadas e não tributadas no mercado interno" },
  { code: "54", description: "Crédito vinculado a receitas tributadas no mercado interno e de exportação" },
  { code: "55", description: "Crédito vinculado a receitas não tributadas no mercado interno e de exportação" },
  { code: "56", description: "Crédito vinculado a receitas tributadas, não tributadas e de exportação" },
  { code: "60", description: "Crédito presumido vinculado exclusivamente a receita tributada no mercado interno" },
  { code: "61", description: "Crédito presumido vinculado exclusivamente a receita não tributada no mercado interno" },
  { code: "62", description: "Crédito presumido vinculado exclusivamente a receita de exportação" },
  { code: "63", description: "Crédito presumido vinculado a receitas tributadas e não tributadas no mercado interno" },
  { code: "64", description: "Crédito presumido vinculado a receitas tributadas no mercado interno e de exportação" },
  { code: "65", description: "Crédito presumido vinculado a receitas não tributadas no mercado interno e de exportação" },
  { code: "66", description: "Crédito presumido vinculado a receitas tributadas, não tributadas e de exportação" },
  { code: "67", description: "Crédito presumido — outras operações" },
  { code: "70", description: "Aquisição sem direito a crédito" },
  { code: "71", description: "Aquisição com isenção" },
  { code: "72", description: "Aquisição com suspensão" },
  { code: "73", description: "Aquisição a alíquota zero" },
  { code: "74", description: "Aquisição sem incidência" },
  { code: "75", description: "Aquisição por substituição tributária" },
  { code: "98", description: "Outras operações de entrada" },
  { code: "99", description: "Outras operações" },
];

export const ICMS_CSTS: FiscalOption[] = [
  { code: "00", description: "Tributada integralmente" },
  { code: "10", description: "Tributada e com cobrança do ICMS por substituição tributária" },
  { code: "20", description: "Com redução da base de cálculo" },
  { code: "30", description: "Isenta ou não tributada e com cobrança do ICMS-ST" },
  { code: "40", description: "Isenta" },
  { code: "41", description: "Não tributada" },
  { code: "50", description: "Suspensão" },
  { code: "51", description: "Diferimento" },
  { code: "60", description: "ICMS cobrado anteriormente por substituição tributária" },
  { code: "70", description: "Com redução da base e cobrança do ICMS-ST" },
  { code: "90", description: "Outras" },
];

export const CSOSNS: FiscalOption[] = [
  { code: "101", description: "Tributada pelo Simples com permissão de crédito" },
  { code: "102", description: "Tributada pelo Simples sem permissão de crédito" },
  { code: "103", description: "Isenção do Simples para faixa de receita bruta" },
  { code: "201", description: "Tributada pelo Simples com crédito e cobrança do ICMS-ST" },
  { code: "202", description: "Tributada pelo Simples sem crédito e com cobrança do ICMS-ST" },
  { code: "203", description: "Isenção do Simples e cobrança do ICMS-ST" },
  { code: "300", description: "Imune" },
  { code: "400", description: "Não tributada pelo Simples Nacional" },
  { code: "500", description: "ICMS cobrado anteriormente por substituição tributária" },
  { code: "900", description: "Outros" },
];

export const REVENUE_NATURES: RevenueNature[] = [
  {
    code: "201",
    description: "Produtos farmacêuticos",
    csts: ["02", "04"],
    ncmPrefixes: ["3001", "3003", "3004", "3002101", "3002102", "3002103", "3002201", "3002202", "30029020", "30029092", "30029099", "30051010", "3006301", "3006302", "30066000"],
    sourceVersion: "EFD-Contribuições 4.3.10 v1.25 — 30/03/2026",
    sourceUrl: "https://sped.rfb.gov.br/item/show/8124",
  },
  {
    code: "202",
    description: "Produtos de perfumaria, de toucador ou de higiene pessoal",
    csts: ["02", "04"],
    ncmPrefixes: ["3303", "3304", "3305", "3306", "3307", "34011190", "34012010", "96032100"],
    sourceVersion: "EFD-Contribuições 4.3.10 v1.25 — 30/03/2026",
    sourceUrl: "https://sped.rfb.gov.br/item/show/8124",
  },
];

const IBS_CBS_SOURCE = "https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributariaNcm";

export const IBS_CBS_CLASSIFICATIONS: IbsCbsClassification[] = [
  {
    code: "000001",
    cst: "000",
    description: "Situações tributadas integralmente pelo IBS e CBS",
    ncmPrefixes: ["*"],
    reduction: 0,
    legalBasis: "Regra geral de tributação integral",
    sourceVersion: "Portal Conformidade Fácil — consulta em 28/08/2026",
    sourceUrl: IBS_CBS_SOURCE,
  },
  {
    code: "200013",
    cst: "200",
    description: "Tampões, absorventes, calcinhas absorventes e coletores menstruais",
    ncmPrefixes: ["96190000"],
    reduction: 1,
    legalBasis: "LC 214/2025, art. 147",
    sourceVersion: "Portal Conformidade Fácil — consulta em 28/08/2026",
    sourceUrl: IBS_CBS_SOURCE,
  },
  {
    code: "200032",
    cst: "200",
    description: "Medicamentos registrados na Anvisa ou produzidos por farmácia de manipulação, exceto alíquota zero",
    ncmPrefixes: ["3001", "3002", "3003", "3004", "3005", "3006"],
    reduction: 0.6,
    requiresAnvisa: true,
    legalBasis: "LC 214/2025, art. 133",
    sourceVersion: "Portal Conformidade Fácil — consulta em 28/08/2026",
    sourceUrl: IBS_CBS_SOURCE,
  },
  {
    code: "200035",
    cst: "200",
    description: "Produtos de higiene pessoal e limpeza listados no Anexo VIII",
    ncmPrefixes: ["34011190", "33061000", "96032100", "48181000", "38089419", "34011900", "96190000"],
    reduction: 0.6,
    legalBasis: "LC 214/2025, art. 136 e Anexo VIII",
    sourceVersion: "Portal Conformidade Fácil — consulta em 28/08/2026",
    sourceUrl: IBS_CBS_SOURCE,
  },
];

function matchesNcm(ncm: string, patterns: string[]) {
  return patterns.some((pattern) => pattern === "*" || ncm.startsWith(pattern));
}

export function revenueNatureSuggestions(ncm: string, cst: string) {
  return REVENUE_NATURES.filter((item) => item.csts.includes(cst) && matchesNcm(ncm, item.ncmPrefixes));
}

export function ibsCbsSuggestions(ncm: string) {
  return IBS_CBS_CLASSIFICATIONS.filter((item) => item.code !== "000001" && matchesNcm(ncm, item.ncmPrefixes));
}

export function getIbsCbsClassification(code: string) {
  return IBS_CBS_CLASSIFICATIONS.find((item) => item.code === code);
}

export function isFiscalOption(catalog: FiscalOption[], code: string) {
  return catalog.some((item) => item.code === code);
}
