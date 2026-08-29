import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import forge from "node-forge";

export type CertificatePayload = { pfxBase64: string; passphrase: string };

export function encryptSensitivePayload(payload: unknown, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptSensitivePayload<T>(value: string, key: Buffer): T {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("DFE_CONTEUDO_CRIPTOGRAFADO_INVALIDO");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8")) as T;
}

export function certificateEncryptionKey(value: string | undefined): Buffer {
  if (!value) throw new Error("DFE_CHAVE_DE_CRIPTOGRAFIA_NAO_CONFIGURADA");
  const normalized = value.trim();
  const key = /^[a-fA-F0-9]{64}$/.test(normalized)
    ? Buffer.from(normalized, "hex")
    : Buffer.from(normalized, "base64");
  if (key.length !== 32) throw new Error("DFE_CHAVE_DE_CRIPTOGRAFIA_INVALIDA");
  return key;
}

export function encryptCertificatePayload(payload: CertificatePayload, key: Buffer): string {
  return encryptSensitivePayload(payload, key);
}

export function decryptCertificatePayload(value: string, key: Buffer): CertificatePayload {
  let parsed: Partial<CertificatePayload>;
  try {
    parsed = decryptSensitivePayload<Partial<CertificatePayload>>(value, key);
  } catch {
    throw new Error("DFE_CERTIFICADO_CRIPTOGRAFADO_INVALIDO");
  }
  if (!parsed.pfxBase64 || typeof parsed.passphrase !== "string") {
    throw new Error("DFE_CERTIFICADO_CRIPTOGRAFADO_INVALIDO");
  }
  return { pfxBase64: parsed.pfxBase64, passphrase: parsed.passphrase };
}

export function inspectPfx(pfxBuffer: Buffer, passphrase: string) {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const binary = forge.util.createBuffer(pfxBuffer.toString("binary"));
    const asn1 = forge.asn1.fromDer(binary);
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase);
  } catch {
    throw new Error("CERTIFICADO_A1_OU_SENHA_INVALIDOS");
  }

  const certificateBagOid = forge.pki.oids.certBag!;
  const shroudedKeyBagOid = forge.pki.oids.pkcs8ShroudedKeyBag!;
  const keyBagOid = forge.pki.oids.keyBag!;
  const certificateBag = p12.getBags({ bagType: certificateBagOid })[
    certificateBagOid
  ]?.find((bag: forge.pkcs12.Bag) => bag.cert);
  const keyBag = [
    ...(p12.getBags({ bagType: shroudedKeyBagOid })[
      shroudedKeyBagOid
    ] ?? []),
    ...(p12.getBags({ bagType: keyBagOid })[keyBagOid] ?? []),
  ].find((bag: forge.pkcs12.Bag) => bag.key);

  if (!certificateBag?.cert || !keyBag?.key) {
    throw new Error("CERTIFICADO_A1_SEM_CERTIFICADO_OU_CHAVE_PRIVADA");
  }
  const certificate = certificateBag.cert;
  const certificateDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
  const subject = certificate.subject.attributes
    .map((attribute: forge.pki.CertificateField) => `${attribute.shortName ?? attribute.name}=${String(attribute.value)}`)
    .join(", ");
  return {
    fingerprint: createHash("sha256")
      .update(Buffer.from(certificateDer, "binary"))
      .digest("hex"),
    subject,
    serialNumber: certificate.serialNumber,
    validFrom: certificate.validity.notBefore,
    validUntil: certificate.validity.notAfter,
    certificatePem: forge.pki.certificateToPem(certificate),
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
  };
}
