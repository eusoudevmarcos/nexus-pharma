import { SignedXml } from "xml-crypto";

/**
 * Assinatura digital XMLDSig da NFC-e/NF-e conforme o Manual de Orientação do
 * Contribuinte (MOC) e o leiaute 4.00:
 *
 *  - Algoritmo de assinatura:   RSA-SHA1
 *  - Digest:                    SHA1
 *  - Canonicalização:           Canonical XML 1.0 INCLUSIVO (C14N)
 *  - Transforms da Reference:   enveloped-signature + C14N
 *  - URI da Reference:          "#<Id do infNFe>"  (ex.: "#NFe5326...")
 *  - Signature:                 elemento irmão de infNFe, dentro de NFe
 *  - KeyInfo:                   X509Data/X509Certificate (certificado A1)
 *
 * A chave privada e o certificado chegam em PEM — extraídos do PKCS#12 (A1)
 * pelo cofre criptografado já existente (dfe-certificate.service). Este módulo
 * não toca em segredos de ambiente nem em disco: recebe tudo por parâmetro.
 */

const RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
const SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

export type SignNfceXmlInput = {
  /** XML do documento sem assinatura: <NFe ...><infNFe Id="NFe..">…</infNFe></NFe>. */
  xml: string;
  /** Certificado X.509 (PEM) do A1. */
  certificatePem: string;
  /** Chave privada RSA (PEM) do A1. */
  privateKeyPem: string;
  /**
   * Valor do atributo Id do elemento infNFe (ex.: "NFe5326…"). Se omitido é
   * extraído do próprio XML.
   */
  referenceId?: string;
};

export type SignedNfceXml = {
  /** XML assinado (NFe com Signature). */
  signedXml: string;
  /** DigestValue calculado (base64) — usado na conferência/QR de contingência. */
  digestValue: string;
  /** DigestValue em hexadecimal — formato exigido no QR Code offline (digVal). */
  digestValueHex: string;
  /** SignatureValue (base64). */
  signatureValue: string;
};

function extractElementId(xml: string, tagName: string): string {
  const match = xml.match(new RegExp(`<${tagName}\\b[^>]*\\bId="([^"]+)"`));
  if (!match?.[1]) throw new Error(`NFCE_ASSINATURA_ID_${tagName.toUpperCase()}_NAO_ENCONTRADO`);
  return match[1];
}

function extractBetween(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([^<]*)</(?:[\\w-]+:)?${tag}>`));
  if (!match?.[1]) throw new Error(`NFCE_ASSINATURA_${tag.toUpperCase()}_NAO_ENCONTRADO`);
  return match[1].trim();
}

/**
 * Assina, com as regras do SEFAZ, um XML cujo elemento assinado (`tagName`)
 * possui atributo Id. Usado para NFe (infNFe), eventos (infEvento) e
 * inutilização (infInut) — a Signature é inserida como irmã, logo após ele.
 */
export function signSefazXml(input: {
  xml: string;
  tagName: string;
  certificatePem: string;
  privateKeyPem: string;
  referenceId?: string;
}): SignedNfceXml {
  if (!new RegExp(`<${input.tagName}\\b`).test(input.xml)) throw new Error(`NFCE_ASSINATURA_XML_SEM_${input.tagName.toUpperCase()}`);
  if (!input.privateKeyPem?.includes("PRIVATE KEY")) throw new Error("NFCE_ASSINATURA_CHAVE_PRIVADA_INVALIDA");
  if (!input.certificatePem?.includes("CERTIFICATE")) throw new Error("NFCE_ASSINATURA_CERTIFICADO_INVALIDO");

  const referenceId = input.referenceId ?? extractElementId(input.xml, input.tagName);
  const xpath = `//*[local-name(.)='${input.tagName}']`;

  const sig = new SignedXml({
    privateKey: input.privateKeyPem,
    publicCert: input.certificatePem,
    signatureAlgorithm: RSA_SHA1,
    canonicalizationAlgorithm: C14N,
    getKeyInfoContent: SignedXml.getKeyInfoContent,
  });

  sig.addReference({
    xpath,
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: SHA1,
    uri: `#${referenceId}`,
  });

  try {
    sig.computeSignature(input.xml, { location: { reference: xpath, action: "after" }, prefix: "" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "ERRO";
    throw new Error(`NFCE_ASSINATURA_FALHOU:${detail}`);
  }

  const signedXml = sig.getSignedXml();
  const digestValue = extractBetween(signedXml, "DigestValue");
  const signatureValue = extractBetween(signedXml, "SignatureValue").replace(/\s+/g, "");
  const digestValueHex = Buffer.from(digestValue, "base64").toString("hex");

  return { signedXml, digestValue, digestValueHex, signatureValue };
}

/**
 * Assina o XML da NFC-e (elemento infNFe). Lança erro com prefixo
 * NFCE_ASSINATURA_ quando o certificado/chave ou a estrutura são inválidos.
 */
export function signNfceXml(input: SignNfceXmlInput): SignedNfceXml {
  return signSefazXml({ xml: input.xml, tagName: "infNFe", certificatePem: input.certificatePem, privateKeyPem: input.privateKeyPem, referenceId: input.referenceId });
}
