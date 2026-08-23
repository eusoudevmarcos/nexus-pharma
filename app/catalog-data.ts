export type Regime = "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";

export type Rule = {
  cfop: string; cstIcms: string; csosn: string; icms: number; mva: number;
  cstPis: string; cstCofins: string; natureza: string; pis: number; cofins: number;
  cstReforma: string; classificacao: string; cbs: number; ibs: number; reducao: number; compensarCbs: boolean;
};

export type Category = {
  id: string; nome: string; codigo: string; ncm: string; cest: string; classe: string;
  descricao: string; versao: string; vigencia: string; rules: Record<Regime, Rule>;
};

export type Product = {
  ean: string; nome: string; laboratorio: string; principioAtivo: string; categoriaId: string;
  lote: string; quantidadeEntrada: number; custo: number; estoque: number; minimo: number;
  fabricacao: string; vencimento: string; preco: number; vendas30d: number;
};

export function rule(overrides: Partial<Rule> = {}): Rule {
  return { cfop: "5102", cstIcms: "00", csosn: "102", icms: 0, mva: 0, cstPis: "01", cstCofins: "01", natureza: "", pis: .0065, cofins: .03, cstReforma: "000", classificacao: "TRIBUTAÇÃO INTEGRAL", cbs: .009, ibs: .001, reducao: 0, compensarCbs: true, ...overrides };
}

export function rulesFor(overrides: Partial<Rule> = {}): Record<Regime, Rule> {
  return {
    SIMPLES_NACIONAL: rule({ ...overrides, cbs: 0, ibs: 0, compensarCbs: false }),
    LUCRO_PRESUMIDO: rule({ ...overrides, csosn: "—", pis: .0065, cofins: .03 }),
    LUCRO_REAL: rule({ ...overrides, csosn: "—", pis: .0165, cofins: .076 }),
  };
}

export const initialCategories: Category[] = [
  { id: "med", nome: "Medicamentos", codigo: "MEDICAMENTOS", ncm: "30049069", cest: "1300402", classe: "Lista positiva", descricao: "Medicamentos de uso humano e genéricos", versao: "2026.08", vigencia: "01/08/2026", rules: rulesFor({ cfop: "5405", cstIcms: "60", csosn: "500", mva: .38, cstPis: "05", cstCofins: "05", natureza: "101", pis: 0, cofins: 0, cstReforma: "200", classificacao: "MEDICAMENTO REDUZIDO", cbs: .009, ibs: .001, reducao: .6 }) },
  { id: "ant", nome: "Antibióticos", codigo: "ANTIBIOTICOS", ncm: "30042099", cest: "1300200", classe: "Lista positiva", descricao: "Antimicrobianos sujeitos a controle", versao: "2026.08", vigencia: "01/08/2026", rules: rulesFor({ cfop: "5405", cstIcms: "60", csosn: "500", mva: .38, cstPis: "05", cstCofins: "05", natureza: "101", pis: 0, cofins: 0, cstReforma: "200", classificacao: "MEDICAMENTO REDUZIDO", cbs: .009, ibs: .001, reducao: .6 }) },
  { id: "hig", nome: "Higiene pessoal", codigo: "HIGIENE", ncm: "33049990", cest: "2001500", classe: "Tributação normal", descricao: "Cuidados pessoais, higiene bucal e corporal", versao: "2026.08", vigencia: "01/08/2026", rules: rulesFor({ mva: .42 }) },
  { id: "maq", nome: "Maquiagens", codigo: "MAQUIAGEM", ncm: "33049910", cest: "2001500", classe: "Tributação normal", descricao: "Cosméticos e maquiagem", versao: "2026.08", vigencia: "01/08/2026", rules: rulesFor({ mva: .52 }) },
  { id: "sup", nome: "Suplementos e esporte", codigo: "SUPLEMENTOS", ncm: "21069030", cest: "—", classe: "Tributação normal", descricao: "Nutrição esportiva, vitaminas e proteínas", versao: "2026.08", vigencia: "01/08/2026", rules: rulesFor() },
  { id: "per", nome: "Perfumaria", codigo: "PERFUMARIA", ncm: "33030020", cest: "2000700", classe: "Tributação normal", descricao: "Perfumes, colônias e cuidados", versao: "2026.08", vigencia: "01/08/2026", rules: rulesFor({ mva: .55 }) },
  { id: "bal", nome: "Balas e confeitos", codigo: "BALAS", ncm: "17049020", cest: "1700400", classe: "Monofásico", descricao: "Balas, pastilhas e confeitos", versao: "2026.08", vigencia: "01/08/2026", rules: rulesFor({ cstPis: "04", cstCofins: "04", pis: 0, cofins: 0 }) },
];

export const initialProducts: Product[] = [
  { ean: "7891000100011", nome: "Paracetamol 750 mg 20 comprimidos", laboratorio: "Medley", principioAtivo: "Paracetamol", categoriaId: "med", lote: "PA260718", quantidadeEntrada: 24, custo: 6.4, estoque: 7, minimo: 12, fabricacao: "2026-05-10", vencimento: "2027-05-10", preco: 12.9, vendas30d: 86 },
  { ean: "7891000100028", nome: "Multivitamínico A-Z 60 comprimidos", laboratorio: "Vitamed", principioAtivo: "Vitaminas e minerais", categoriaId: "sup", lote: "MV260331", quantidadeEntrada: 36, custo: 19.1, estoque: 18, minimo: 10, fabricacao: "2026-03-31", vencimento: "2027-03-31", preco: 34.5, vendas30d: 54 },
  { ean: "7896004710893", nome: "Dipirona 500 mg 10 comprimidos", laboratorio: "Genérico", principioAtivo: "Dipirona monoidratada", categoriaId: "med", lote: "DP250912", quantidadeEntrada: 48, custo: 3.85, estoque: 24, minimo: 8, fabricacao: "2025-09-12", vencimento: "2026-09-22", preco: 8.49, vendas30d: 72 },
  { ean: "7896422507051", nome: "Protetor solar FPS 60 120 ml", laboratorio: "Derma", principioAtivo: "Filtros UVA/UVB", categoriaId: "hig", lote: "PS260114", quantidadeEntrada: 12, custo: 31.2, estoque: 5, minimo: 7, fabricacao: "2026-01-14", vencimento: "2027-01-14", preco: 52.9, vendas30d: 38 },
];
