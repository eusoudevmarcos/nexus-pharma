import test from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { signNfceXml } from "../dist/services/nfce-signature.service.js";

// Certificado A1 de teste, autoassinado e descartável (nunca um cert real).
function throwawayCertificate() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const attrs = [{ name: "commonName", value: "TESTE NEXUS:11222333000181" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    certificatePem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

const chave = "35260811222333000181650010000001231123456782";
const unsigned = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe versao="4.00" Id="NFe${chave}"><ide><cUF>35</cUF><mod>65</mod></ide><emit><CNPJ>11222333000181</CNPJ></emit></infNFe></NFe>`;

test("assina o XML e a assinatura verifica criptograficamente (round-trip)", () => {
  const cert = throwawayCertificate();
  const result = signNfceXml({ xml: unsigned, ...cert });

  assert.match(result.signedXml, /<Signature[\s>]/);
  assert.match(result.signedXml, /<X509Certificate>/);
  assert.ok(result.digestValue.length > 0);
  assert.ok(result.signatureValue.length > 0);
  assert.equal(result.digestValueHex, Buffer.from(result.digestValue, "base64").toString("hex"));

  // A Signature deve ser irmã de infNFe (fecha infNFe antes de abrir Signature).
  assert.match(result.signedXml, /<\/infNFe><Signature/);
  // Reference aponta para o Id do infNFe.
  assert.match(result.signedXml, new RegExp(`URI="#NFe${chave}"`));

  const signatureXml = result.signedXml.match(/<Signature[\s\S]*<\/Signature>/)[0];
  const verifier = new SignedXml({ publicCert: cert.certificatePem });
  verifier.loadSignature(signatureXml);
  const isValid = verifier.checkSignature(result.signedXml);
  assert.equal(isValid, true);
});

test("adulteração no conteúdo invalida a assinatura", () => {
  const cert = throwawayCertificate();
  const result = signNfceXml({ xml: unsigned, ...cert });
  const tampered = result.signedXml.replace("11222333000181", "99999999999999");
  const signatureXml = result.signedXml.match(/<Signature[\s\S]*<\/Signature>/)[0];
  const verifier = new SignedXml({ publicCert: cert.certificatePem });
  verifier.loadSignature(signatureXml);
  assert.equal(verifier.checkSignature(tampered), false);
});

test("rejeita chave privada e certificado inválidos", () => {
  assert.throws(() => signNfceXml({ xml: unsigned, certificatePem: "x", privateKeyPem: "y" }), /NFCE_ASSINATURA/);
});
