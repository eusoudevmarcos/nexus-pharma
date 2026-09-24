/**
 * Parser de código de barras GS1 (DataMatrix 2D / GS1-128) focado nos dados de
 * rastreabilidade de medicamentos:
 *
 *   (01) GTIN            (17) Validade AAMMDD
 *   (10) Lote            (21) Serial (IUM)   (11) Fabricação AAMMDD
 *
 * Aceita três formas de entrada:
 *   - fluxo bruto com separador FNC1 (GS = \x1d) entre campos de tamanho variável
 *   - forma legível com parênteses:  (01)0789...(17)280110(10)ABC123
 *   - EAN/GTIN puro (só dígitos), sem AIs (código 1D comum)
 *
 * Módulo puro e determinístico — não acessa banco, rede nem segredos.
 */

const GS = "\x1d"; // FNC1 / Group Separator

// AIs de tamanho fixo relevantes (valor em nº de dígitos após o AI de 2 posições).
const FIXED_LENGTH: Record<string, number> = {
  "00": 18, "01": 14, "02": 14, "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6, "20": 2,
};

export type Gs1ParseResult = {
  /** true quando havia AIs GS1 (não é um EAN puro). */
  gs1: boolean;
  gtin: string | null;
  /** GTIN reduzido a 13 dígitos (EAN-13) quando começa com zero. */
  ean: string | null;
  lote: string | null;
  serial: string | null;
  validade: Date | null;
  fabricacao: Date | null;
  /** Todos os AIs encontrados, para depuração/uso avançado. */
  ais: Record<string, string>;
};

const onlyDigits = (value: string) => value.replace(/\D/g, "");

function stripSymbologyId(value: string): string {
  // Identificadores de simbologia: ]d2 (DataMatrix), ]C1 (GS1-128), ]Q3, ]e0…
  return /^\][A-Za-z]\d/.test(value) ? value.slice(3) : value;
}

/** Converte AAMMDD em Date (UTC). DD=00 significa o último dia do mês. */
export function gs1DateToDate(yymmdd: string): Date | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const year = 2000 + Number(yymmdd.slice(0, 2));
  const month = Number(yymmdd.slice(2, 4));
  const day = Number(yymmdd.slice(4, 6));
  if (month < 1 || month > 12) return null;
  const date = day === 0 ? new Date(Date.UTC(year, month, 0)) : new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeEan(gtin: string | null): string | null {
  if (!gtin) return null;
  const trimmed = gtin.replace(/^0+/, "");
  return trimmed.length >= 8 && trimmed.length <= 13 ? trimmed.padStart(13, "0") : gtin;
}

function buildResult(ais: Record<string, string>, gs1: boolean): Gs1ParseResult {
  const gtin = ais["01"] ? onlyDigits(ais["01"]) : null;
  return {
    gs1,
    gtin,
    ean: normalizeEan(gtin),
    lote: ais["10"] ?? null,
    serial: ais["21"] ?? null,
    validade: ais["17"] ? gs1DateToDate(ais["17"]) : null,
    fabricacao: ais["11"] ? gs1DateToDate(ais["11"]) : null,
    ais,
  };
}

/**
 * Interpreta um código escaneado. Nunca lança — devolve o que conseguiu ler.
 */
export function parseGs1(raw: string): Gs1ParseResult {
  const value = stripSymbologyId((raw ?? "").trim());
  if (!value) return buildResult({}, false);

  // Forma com parênteses.
  if (value.includes("(")) {
    const ais: Record<string, string> = {};
    for (const match of value.matchAll(/\((\d{2,4})\)([^()]*)/g)) {
      const ai = match[1];
      if (ai) ais[ai] = (match[2] ?? "").trim();
    }
    return buildResult(ais, Object.keys(ais).length > 0);
  }

  // EAN/GTIN puro (só dígitos, sem AIs) — código 1D comum.
  const digits = onlyDigits(value);
  if (digits === value && [8, 12, 13, 14].includes(value.length)) {
    return buildResult({ "01": value.padStart(14, "0") }, false);
  }

  // Fluxo bruto de AIs (com FNC1 nos campos variáveis).
  const ais: Record<string, string> = {};
  let index = 0;
  while (index + 2 <= value.length) {
    const ai = value.slice(index, index + 2);
    index += 2;
    const fixed = FIXED_LENGTH[ai];
    if (fixed) {
      ais[ai] = value.slice(index, index + fixed);
      index += fixed;
    } else {
      const gsAt = value.indexOf(GS, index);
      const end = gsAt === -1 ? value.length : gsAt;
      ais[ai] = value.slice(index, end);
      index = gsAt === -1 ? value.length : gsAt + 1;
    }
  }
  return buildResult(ais, Object.keys(ais).length > 0);
}
