const stopWords = new Set([
  "com", "sem", "para", "por", "uso", "produto", "unidade", "caixa", "frasco", "embalagem", "original",
  "novo", "nova", "adulto", "adultos", "infantil", "ml", "mg", "gr", "g",
]);

const domainRules = [
  { code: "MEDICINE", label: "medicamento", prefixes: ["3003", "3004"], keywords: ["medicamento", "comprimido", "capsula", "antibiotico", "generico", "xarope", "principio ativo", "dose"] },
  { code: "MAKEUP", label: "maquiagem", prefixes: ["3304"], keywords: ["batom", "maquiagem", "rimel", "mascara cilios", "base facial", "esmalte", "cosmetico"] },
  { code: "HAIR", label: "preparação capilar", prefixes: ["3305"], keywords: ["shampoo", "condicionador", "capilar", "cabelo"] },
  { code: "ORAL_HYGIENE", label: "higiene bucal", prefixes: ["3306"], keywords: ["dentifricio", "pasta dental", "fio dental", "higiene bucal", "enxaguante bucal"] },
  { code: "PERFUMERY", label: "perfumaria", prefixes: ["3303", "3307"], keywords: ["perfume", "colonia", "desodorante", "perfumaria"] },
  { code: "SOAP", label: "sabonete", prefixes: ["3401"], keywords: ["sabonete", "sabao corporal", "higiene corporal"] },
  { code: "SUPPLEMENT", label: "suplemento alimentar", prefixes: ["2106"], keywords: ["suplemento", "whey", "creatina", "proteina", "aminoacido"] },
] as const;

export type NcmCatalogCandidate = {
  code: string;
  description: string;
  ncmPatterns?: string[];
  sourceVersion?: string | null;
};

export type ProductCompatibilityInput = {
  name: string;
  activeIngredient?: string | null;
  composition?: string | null;
  laboratory?: string | null;
  anvisaRegistration?: string | null;
  categoryName?: string | null;
  categoryDescription?: string | null;
  currentNcm: string;
  catalog: NcmCatalogCandidate[];
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string) {
  return new Set(normalize(value).split(/\s+/).filter((token) => token.length >= 3 && !stopWords.has(token)));
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function scoreDescription(productTokens: Set<string>, description: string) {
  const descriptionTokens = tokens(description);
  if (!descriptionTokens.size || !productTokens.size) return 0;
  const overlap = [...descriptionTokens].filter((token) => productTokens.has(token)).length;
  return Number((overlap / Math.min(Math.max(descriptionTokens.size, 1), 8)).toFixed(4));
}

function entryMatchesNcm(entry: NcmCatalogCandidate, ncm: string) {
  const code = digits(entry.code);
  const patterns = [code, ...(entry.ncmPatterns ?? []).map(digits)].filter(Boolean);
  return patterns.some((pattern) => ncm === pattern || ncm.startsWith(pattern) || pattern.startsWith(ncm));
}

export function analyzeProductTaxCompatibility(input: ProductCompatibilityInput) {
  const currentNcm = digits(input.currentNcm);
  const text = [input.name, input.activeIngredient, input.composition, input.categoryName, input.categoryDescription].filter(Boolean).join(" ");
  const normalizedText = normalize(text);
  const productTokens = tokens(text);
  const matchedDomains = domainRules.filter((domain) => domain.keywords.some((keyword) => normalizedText.includes(normalize(keyword))));
  const compatibleDomains = matchedDomains.filter((domain) => domain.prefixes.some((prefix) => currentNcm.startsWith(prefix)));
  const conflictingDomains = matchedDomains.filter((domain) => !domain.prefixes.some((prefix) => currentNcm.startsWith(prefix)));
  const currentEntry = input.catalog.find((entry) => entryMatchesNcm(entry, currentNcm)) ?? null;
  const rankedCandidates = input.catalog
    .map((entry) => ({ entry, score: scoreDescription(productTokens, entry.description) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.code.localeCompare(right.entry.code));
  const lexicalCandidate = rankedCandidates[0] ?? null;
  const domainCandidate = conflictingDomains.flatMap((domain) => input.catalog
    .filter((entry) => domain.prefixes.some((prefix) => digits(entry.code).startsWith(prefix) || (entry.ncmPatterns ?? []).some((pattern) => digits(pattern).startsWith(prefix))))
    .map((entry) => ({ entry, score: Math.max(0.55, scoreDescription(productTokens, entry.description)), domain })))
    .sort((left, right) => right.score - left.score)[0] ?? null;
  const candidate = domainCandidate ?? (lexicalCandidate && !entryMatchesNcm(lexicalCandidate.entry, currentNcm) && lexicalCandidate.score >= 0.34 ? lexicalCandidate : null);
  const currentDescriptionScore = currentEntry ? scoreDescription(productTokens, currentEntry.description) : 0;
  const hasUsefulDescription = productTokens.size >= 2;
  const medicinalSignal = matchedDomains.some((domain) => domain.code === "MEDICINE");
  const anvisaRegistration = input.anvisaRegistration?.trim() || null;
  const anvisaMismatch = Boolean(anvisaRegistration && !currentNcm.startsWith("3003") && !currentNcm.startsWith("3004"));
  const strongConflict = hasUsefulDescription && (conflictingDomains.length > 0 || Boolean(candidate && candidate.score >= Math.max(0.4, currentDescriptionScore + 0.2)) || anvisaMismatch);
  const strongCompatibility = hasUsefulDescription && !anvisaMismatch && conflictingDomains.length === 0 && (compatibleDomains.length > 0 || currentDescriptionScore >= 0.25);
  const status = strongConflict ? "CONFLICT" : strongCompatibility ? "COMPATIBLE" : "INCONCLUSIVE";
  const dataQuality = {
    description: Boolean(input.name.trim()),
    composition: Boolean(input.composition?.trim() || input.activeIngredient?.trim()),
    anvisaRegistration: Boolean(anvisaRegistration),
    officialNcmCatalog: input.catalog.length > 0,
    currentNcmLocated: Boolean(currentEntry),
  };
  const signals = [
    ...matchedDomains.map((domain) => ({ code: `DOMAIN_${domain.code}`, label: `Descrição indica ${domain.label}`, supportsCurrentNcm: domain.prefixes.some((prefix) => currentNcm.startsWith(prefix)), expectedPrefixes: [...domain.prefixes] })),
    ...(currentEntry ? [{ code: "OFFICIAL_NCM_MATCH", label: `NCM localizado no catálogo: ${currentEntry.description}`, supportsCurrentNcm: currentDescriptionScore >= 0.25, expectedPrefixes: [currentNcm] }] : []),
    ...(anvisaRegistration ? [{ code: "ANVISA_REGISTRATION_PRESENT", label: "Registro ANVISA informado no cadastro", supportsCurrentNcm: !anvisaMismatch, expectedPrefixes: ["3003", "3004"] }] : []),
  ];
  const score = status === "COMPATIBLE"
    ? Math.min(0.95, 0.55 + Math.max(currentDescriptionScore, compatibleDomains.length ? 0.25 : 0) + (currentEntry ? 0.1 : 0))
    : status === "CONFLICT"
      ? Math.min(0.95, 0.58 + (candidate?.score ?? 0.15) + (anvisaMismatch ? 0.1 : 0))
      : Math.min(0.49, 0.15 + currentDescriptionScore);
  return {
    status,
    score: Number(score.toFixed(4)),
    requiresNcmReview: status === "CONFLICT",
    current: { ncm: currentNcm, description: currentEntry?.description ?? null, lexicalScore: currentDescriptionScore, sourceVersion: currentEntry?.sourceVersion ?? null },
    candidate: candidate ? { ncm: digits(candidate.entry.code), description: candidate.entry.description, score: Number(candidate.score.toFixed(4)), sourceVersion: candidate.entry.sourceVersion ?? null } : null,
    expectedPrefixes: [...new Set(conflictingDomains.flatMap((domain) => [...domain.prefixes]))],
    signals,
    dataQuality,
    warnings: [
      ...(!hasUsefulDescription ? ["PRODUCT_DESCRIPTION_INSUFFICIENT"] : []),
      ...(!input.catalog.length ? ["OFFICIAL_NCM_CATALOG_NOT_ACTIVE"] : []),
      ...(status === "CONFLICT" ? ["PRODUCT_NCM_CONFLICT"] : []),
      ...(medicinalSignal && !anvisaRegistration ? ["ANVISA_REGISTRATION_NOT_INFORMED"] : []),
      ...(anvisaMismatch ? ["ANVISA_WITH_NON_MEDICINAL_NCM"] : []),
    ],
    disclaimer: "Compatibilidade semântica é indício para revisão; não substitui a fonte legal nem altera o NCM automaticamente.",
  };
}
