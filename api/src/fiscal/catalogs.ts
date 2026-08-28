export const pisCofinsCstCodes = new Set([
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "49",
  "50", "51", "52", "53", "54", "55", "56", "60", "61", "62",
  "63", "64", "65", "66", "67", "70", "71", "72", "73", "74",
  "75", "98", "99",
]);

export const icmsCstCodes = new Set(["00", "10", "20", "30", "40", "41", "50", "51", "60", "70", "90"]);
export const csosnCodes = new Set(["101", "102", "103", "201", "202", "203", "300", "400", "500", "900"]);

type RevenueNatureRule = { csts: string[]; ncmPrefixes: string[] };
export const revenueNatureRules = new Map<string, RevenueNatureRule>([
  ["201", { csts: ["02", "04"], ncmPrefixes: ["3001", "3003", "3004", "3002101", "3002102", "3002103", "3002201", "3002202", "30029020", "30029092", "30029099", "30051010", "3006301", "3006302", "30066000"] }],
  ["202", { csts: ["02", "04"], ncmPrefixes: ["3303", "3304", "3305", "3306", "3307", "34011190", "34012010", "96032100"] }],
]);

type IbsCbsRule = { cst: string; ncmPrefixes: string[]; requiresEvidence?: boolean };
export const ibsCbsRules = new Map<string, IbsCbsRule>([
  ["000001", { cst: "000", ncmPrefixes: ["*"] }],
  ["200013", { cst: "200", ncmPrefixes: ["96190000"] }],
  ["200032", { cst: "200", ncmPrefixes: ["3001", "3002", "3003", "3004", "3005", "3006"], requiresEvidence: true }],
  ["200035", { cst: "200", ncmPrefixes: ["34011190", "33061000", "96032100", "48181000", "38089419", "34011900", "96190000"] }],
]);

function matchesNcm(ncm: string, prefixes: string[]) {
  return prefixes.some((prefix) => prefix === "*" || ncm.startsWith(prefix));
}

export function validateRevenueNature(ncm: string, cst: string, nature: string | null) {
  if (!nature) return true;
  const rule = revenueNatureRules.get(nature);
  return Boolean(rule && rule.csts.includes(cst) && matchesNcm(ncm, rule.ncmPrefixes));
}

export function validateIbsCbsClassification(ncm: string, cst: string, cClassTrib: string) {
  const rule = ibsCbsRules.get(cClassTrib);
  return Boolean(rule && rule.cst === cst && matchesNcm(ncm, rule.ncmPrefixes));
}
