/**
 * Escopo de produtos que uma organização Prime (indústria/distribuição) enxerga
 * nas farmácias vinculadas.
 *
 * Padrão (política de 25/09): TODAS as marcas, para qualquer tipo de
 * organização. O laboratório vê todo o estoque baixo do cliente e decide por si
 * mesmo o que oferecer; o compartilhamento faz parte do contrato da farmácia.
 *
 * Restrição opcional, por organização: `settings.productScope = "OWN"` limita
 * aos produtos cujo código de barras começa com um dos `settings.gs1Prefixes`
 * (prefixo de empresa GS1).
 */

export type PrimeOrganizationKindCode = "PLATFORM" | "LABORATORY" | "DISTRIBUTOR" | "WHOLESALER";
export type PrimeProductScope = { mode: "ALL" } | { mode: "OWN"; gs1Prefixes: string[] };

/**
 * Prefixo de empresa GS1: 7 a 12 dígitos (país + empresa). O mínimo de 7 evita
 * um prefixo curto demais — "789" sozinho casaria com todo produto brasileiro e
 * abriria o sell-out de toda a concorrência.
 */
const gs1PrefixPattern = /^\d{7,12}$/;

export function isValidGs1Prefix(value: string): boolean {
  return gs1PrefixPattern.test(value);
}

/** Normaliza a lista vinda do cadastro: só prefixos válidos, sem duplicatas, ordenados. */
export function normalizeGs1Prefixes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const prefixes = input
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/\D/g, ""))
    .filter(isValidGs1Prefix);
  return [...new Set(prefixes)].sort();
}

export function defaultProductScopeMode(_kind: PrimeOrganizationKindCode): "OWN" | "ALL" {
  return "ALL";
}

export function resolvePrimeProductScope(kind: PrimeOrganizationKindCode, settings: unknown): PrimeProductScope {
  const values = settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>) : {};
  const explicit = values.productScope === "OWN" || values.productScope === "ALL" ? values.productScope : null;
  const mode = explicit ?? defaultProductScopeMode(kind);
  return mode === "ALL" ? { mode } : { mode, gs1Prefixes: normalizeGs1Prefixes(values.gs1Prefixes) };
}

/**
 * Leva o código de barras para a forma GTIN-13, onde o prefixo de empresa GS1
 * começa na primeira posição: GTIN-14 perde o dígito indicador e UPC-A (12)
 * ganha o zero à esquerda. EAN-8 não carrega prefixo de empresa — fica como está
 * e só casaria com um prefixo cadastrado explicitamente com ele.
 */
export function toGtin13(ean: string): string {
  const digits = ean.replace(/\D/g, "");
  if (digits.length === 14) return digits.slice(1);
  if (digits.length === 12) return `0${digits}`;
  return digits;
}

export function productInScope(scope: PrimeProductScope, ean: string): boolean {
  if (scope.mode === "ALL") return true;
  if (!scope.gs1Prefixes.length) return false;
  const gtin13 = toGtin13(ean);
  return scope.gs1Prefixes.some((prefix) => gtin13.startsWith(prefix));
}
