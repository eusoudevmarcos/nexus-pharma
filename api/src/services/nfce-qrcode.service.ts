import { createHash } from "node:crypto";

/**
 * Geração do QR Code da NFC-e (modelo 65), versão 2.00 do QR Code,
 * compatível com o leiaute 4.00 da NF-e/NFC-e.
 *
 * Fonte normativa: Nota Técnica 2015.002 e o "Manual de Especificações
 * Técnicas do DANFE NFC-e e QR Code". O CSC (segredo) NUNCA aparece na URL:
 * ele apenas alimenta o cálculo do hash. Apenas o identificador do CSC
 * (cIdToken / idCSC) fica visível.
 *
 * Este módulo é puro e determinístico — não acessa banco, rede ou segredos
 * de ambiente. Os valores sensíveis (CSC) são recebidos por parâmetro para
 * que a chamada os obtenha do cofre criptografado da configuração NFC-e.
 */

export type NfceQrEnvironment = "HOMOLOGATION" | "PRODUCTION";

export type NfceQrInput = {
  /** Chave de acesso da NFC-e (44 dígitos numéricos). */
  accessKey: string;
  /** Versão do QR Code. Para o leiaute 4.00 o valor vigente é 2. */
  qrVersion?: 2;
  /** Ambiente: HOMOLOGATION => tpAmb 2, PRODUCTION => tpAmb 1. */
  environment: NfceQrEnvironment;
  /** Identificador do CSC (idCSC / cIdToken) emitido pela SEFAZ. */
  cscId: string;
  /** Código do CSC (segredo). Alimenta o hash e não vai para a URL. */
  csc: string;
  /**
   * URL base de consulta da NFC-e por chave, específica da UF e do ambiente.
   * Ex.: https://dfe-portal.svrs.rs.gov.br/nfce/qrcode  (varia por UF).
   * Deve ser HTTPS e não conter query string.
   */
  baseUrl: string;
  /**
   * URL de consulta ("consChNFe") exibida no rodapé do DANFE, no elemento
   * infNFCeSupl/urlChave. Opcional; quando ausente, não é retornada.
   */
  consultationUrl?: string;
  /**
   * Padroniza o identificador do CSC para 6 posições com zeros à esquerda
   * (convenção do manual). Desative apenas se a sua SEFAZ exigir o valor cru.
   */
  padCscIdTo6?: boolean;
  /** Caixa do hash hexadecimal. O manual exibe em maiúsculas (padrão aqui). */
  hashCase?: "upper" | "lower";
  /**
   * Dados exigidos apenas na emissão em contingência offline (tpEmis = 9).
   * Na emissão normal online devem ser omitidos.
   */
  offline?: {
    /** Dia da emissão (campo dhEmi), com dois dígitos (DD). */
    emissionDay: number | string;
    /** Valor total da NFC-e (vNF) com ponto decimal, ex.: "18.00". */
    totalAmount: number | string;
    /** DigestValue da assinatura convertido para hexadecimal (digVal). */
    digestValueHex: string;
  };
};

export type NfceQrCode = {
  /** Conteúdo textual do QR Code (vai no elemento infNFCeSupl/qrCode). */
  qrCode: string;
  /** URL de consulta por chave (infNFCeSupl/urlChave), quando informada. */
  urlChave: string | null;
  /** Hash calculado, exposto para auditoria/testes. */
  hash: string;
};

const onlyDigits = (value: string) => value.replace(/\D/g, "");

function environmentCode(environment: NfceQrEnvironment): "1" | "2" {
  return environment === "PRODUCTION" ? "1" : "2";
}

function normalizeDay(value: number | string): string {
  const digits = onlyDigits(String(value));
  if (!digits) throw new Error("NFCE_QRCODE_DIA_EMISSAO_INVALIDO");
  return digits.slice(-2).padStart(2, "0");
}

function normalizeAmount(value: number | string): string {
  const numeric = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error("NFCE_QRCODE_VALOR_TOTAL_INVALIDO");
  return numeric.toFixed(2);
}

/**
 * Monta o conteúdo do QR Code da NFC-e (online ou contingência offline).
 * Lança erro com prefixo NFCE_QRCODE_ para entradas inválidas.
 */
export function buildNfceQrCode(input: NfceQrInput): NfceQrCode {
  const accessKey = onlyDigits(input.accessKey);
  if (!/^\d{44}$/.test(accessKey)) throw new Error("NFCE_QRCODE_CHAVE_INVALIDA");
  if (!input.baseUrl || !/^https:\/\//i.test(input.baseUrl)) throw new Error("NFCE_QRCODE_URL_BASE_INVALIDA");
  const cscId = onlyDigits(input.cscId);
  if (!cscId) throw new Error("NFCE_QRCODE_IDENTIFICADOR_CSC_INVALIDO");
  if (!input.csc || input.csc.trim().length < 6) throw new Error("NFCE_QRCODE_CSC_INVALIDO");

  const qrVersion = String(input.qrVersion ?? 2);
  const tpAmb = environmentCode(input.environment);
  const idToken = input.padCscIdTo6 === false ? cscId : cscId.padStart(6, "0");

  const parameters = input.offline
    ? [
        accessKey,
        qrVersion,
        tpAmb,
        normalizeDay(input.offline.emissionDay),
        normalizeAmount(input.offline.totalAmount),
        input.offline.digestValueHex.trim(),
        idToken,
      ]
    : [accessKey, qrVersion, tpAmb, idToken];

  if (input.offline && !/^[0-9a-fA-F]+$/.test(input.offline.digestValueHex.trim())) {
    throw new Error("NFCE_QRCODE_DIGEST_VALUE_INVALIDO");
  }

  const base = parameters.join("|");
  const digest = createHash("sha1").update(`${base}${input.csc.trim()}`).digest("hex");
  const hash = input.hashCase === "lower" ? digest.toLowerCase() : digest.toUpperCase();
  const separator = input.baseUrl.includes("?") ? "&" : "?";
  const qrCode = `${input.baseUrl}${separator}p=${base}|${hash}`;

  return {
    qrCode,
    urlChave: input.consultationUrl ?? null,
    hash,
  };
}
