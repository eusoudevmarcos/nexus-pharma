import { XMLParser } from "fast-xml-parser";

/**
 * Validação estrutural da NFC-e (leiaute 4.00) — arcabouço.
 *
 * Enquanto o pacote oficial de XSDs não é carregado e validado, esta função faz
 * uma checagem estrutural forte (bem-formação + elementos e atributos
 * obrigatórios), suficiente para barrar XML malformado antes de assinar/enviar.
 *
 * Ponto de extensão: quando os XSDs oficiais forem disponibilizados, uma
 * engine XSD real (ex.: libxmljs2 apontando para os .xsd) substitui/soma-se a
 * esta verificação e o campo `engine` passa a "xsd". Nada aqui acessa disco,
 * rede, banco ou segredos.
 */

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", removeNSPrefix: true, parseTagValue: false, trimValues: true });

export type NfceXsdEngine = "structural" | "xsd";
export type NfceXsdValidationResult = {
  validated: boolean;
  engine: NfceXsdEngine;
  errors: string[];
};

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const asArray = (value: unknown): unknown[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
const str = (value: unknown): string => (typeof value === "string" || typeof value === "number" ? String(value).trim() : "");

/**
 * Valida estruturalmente o XML da NFC-e. Retorna a lista de erros (vazia quando
 * válido). Não lança para XML malformado — reporta como erro estrutural.
 */
export function validateNfceXmlStructure(xml: string): NfceXsdValidationResult {
  const errors: string[] = [];
  const push = (code: string) => errors.push(code);

  let root: Record<string, unknown>;
  try {
    if (!xml || !xml.trim().startsWith("<")) throw new Error("empty");
    root = asObject(parser.parse(xml));
  } catch {
    return { validated: false, engine: "structural", errors: ["XML_MALFORMADO"] };
  }

  const nfe = asObject(root.NFe);
  if (!root.NFe) push("NFE_AUSENTE");
  const infNFe = asObject(nfe.infNFe);
  if (!nfe.infNFe) push("INFNFE_AUSENTE");
  if (str(infNFe.versao) !== "4.00") push("VERSAO_DIFERENTE_DE_4.00");
  if (!/^NFe\d{44}$/.test(str(infNFe.Id))) push("ID_INFNFE_INVALIDO");

  const ide = asObject(infNFe.ide);
  if (str(ide.mod) !== "65") push("MODELO_DIFERENTE_DE_65");
  for (const field of ["cUF", "cNF", "natOp", "serie", "nNF", "dhEmi", "tpNF", "idDest", "cMunFG", "tpImp", "tpEmis", "cDV", "tpAmb", "finNFe", "indFinal", "indPres"]) {
    if (!str((ide as Record<string, unknown>)[field])) push(`IDE_${field.toUpperCase()}_AUSENTE`);
  }

  const emit = asObject(infNFe.emit);
  if (!/^\d{14}$/.test(str(emit.CNPJ))) push("EMIT_CNPJ_INVALIDO");
  if (!str(emit.xNome)) push("EMIT_XNOME_AUSENTE");
  if (!["1", "2", "3"].includes(str(emit.CRT))) push("EMIT_CRT_INVALIDO");
  const ender = asObject(emit.enderEmit);
  for (const field of ["xLgr", "nro", "xBairro", "cMun", "xMun", "UF", "CEP"]) {
    if (!str((ender as Record<string, unknown>)[field])) push(`ENDEREMIT_${field.toUpperCase()}_AUSENTE`);
  }

  const items = asArray(infNFe.det);
  if (!items.length) push("SEM_ITENS");
  items.forEach((entry, index) => {
    const det = asObject(entry);
    const prod = asObject(det.prod);
    const label = `DET_${index + 1}`;
    if (!/^\d{8}$/.test(str(prod.NCM))) push(`${label}_NCM_INVALIDO`);
    if (!/^\d{4}$/.test(str(prod.CFOP))) push(`${label}_CFOP_INVALIDO`);
    if (!str(prod.cProd)) push(`${label}_CPROD_AUSENTE`);
    if (!str(prod.uCom)) push(`${label}_UCOM_AUSENTE`);
    if (!str(prod.vProd)) push(`${label}_VPROD_AUSENTE`);
    if (str(prod.indTot) !== "1" && str(prod.indTot) !== "0") push(`${label}_INDTOT_AUSENTE`);
    if (!det.imposto) push(`${label}_IMPOSTO_AUSENTE`);
  });

  const total = asObject(asObject(infNFe.total).ICMSTot);
  if (!str(total.vNF)) push("TOTAL_VNF_AUSENTE");
  if (!str(total.vProd)) push("TOTAL_VPROD_AUSENTE");

  const pag = asObject(infNFe.pag);
  if (!asArray(pag.detPag).length) push("PAG_SEM_DETPAG");

  return { validated: errors.length === 0, engine: "structural", errors };
}
