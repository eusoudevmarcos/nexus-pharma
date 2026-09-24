import test from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import {
  buildNfceCancelamentoXml,
  buildEventSoap,
  parseEventResponse,
  buildNfceInutilizacaoXml,
  buildInutilizacaoSoap,
  parseInutilizacaoResponse,
  CANCELAMENTO_TP_EVENTO,
} from "../dist/services/nfce-events.service.js";
import { signSefazXml } from "../dist/services/nfce-signature.service.js";

const chave = "53260811222333000181650010000001231123456782";
const justificativa = "Cancelamento por erro de digitacao no valor";

function throwaway() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = "01";
  cert.validity.notBefore = new Date(); cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const attrs = [{ name: "commonName", value: "TESTE:11222333000181" }];
  cert.setSubject(attrs); cert.setIssuer(attrs); cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certificatePem: forge.pki.certificateToPem(cert), privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

test("cancelamento: Id ID+110111+chave+seq e campos do infEvento", () => {
  const { xml, eventId } = buildNfceCancelamentoXml({ accessKey: chave, cnpj: "11222333000181", protocol: "153260000123456", justification: justificativa, environment: "HOMOLOGATION" });
  assert.equal(eventId, `ID${CANCELAMENTO_TP_EVENTO}${chave}01`);
  assert.match(xml, /<tpEvento>110111<\/tpEvento>/);
  assert.match(xml, /<descEvento>Cancelamento<\/descEvento><nProt>153260000123456<\/nProt>/);
  assert.match(xml, /<tpAmb>2<\/tpAmb>/);
});

test("cancelamento rejeita justificativa curta", () => {
  assert.throws(() => buildNfceCancelamentoXml({ accessKey: chave, cnpj: "11222333000181", protocol: "1", justification: "curta", environment: "HOMOLOGATION" }), /NFCE_EVENTO_JUSTIFICATIVA_INVALIDA/);
});

test("evento assina em infEvento e verifica (round-trip) e monta SOAP", () => {
  const cert = throwaway();
  const { xml } = buildNfceCancelamentoXml({ accessKey: chave, cnpj: "11222333000181", protocol: "153260000123456", justification: justificativa, environment: "HOMOLOGATION" });
  const signed = signSefazXml({ xml, tagName: "infEvento", ...cert });
  assert.match(signed.signedXml, /<\/infEvento><Signature/);
  const signatureXml = signed.signedXml.match(/<Signature[\s\S]*<\/Signature>/)[0];
  const verifier = new SignedXml({ publicCert: cert.certificatePem });
  verifier.loadSignature(signatureXml);
  assert.equal(verifier.checkSignature(signed.signedXml), true);

  const { body, action } = buildEventSoap(signed.signedXml, "1");
  assert.match(action, /NFeRecepcaoEvento4/);
  assert.match(body, /<envEvento versao="1\.00"[^>]*><idLote>1<\/idLote><evento/);
});

test("parseEventResponse reconhece evento registrado (135)", () => {
  const resp = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeRecepcaoEventoResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"><nfeResultMsg><retEnvEvento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe"><idLote>1</idLote><cStat>128</cStat><xMotivo>Lote de Evento Processado</xMotivo><retEvento versao="1.00"><infEvento><tpAmb>2</tpAmb><cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo><chNFe>${chave}</chNFe><tpEvento>110111</tpEvento><nProt>853260000999</nProt></infEvento></retEvento></retEnvEvento></nfeResultMsg></nfeRecepcaoEventoResponse></soap:Body></soap:Envelope>`;
  const result = parseEventResponse(resp);
  assert.equal(result.registered, true);
  assert.equal(result.eventStatus, "135");
  assert.equal(result.protocol, "853260000999");
});

test("inutilização: Id de 43 caracteres e homologação (102)", () => {
  const { xml, inutId } = buildNfceInutilizacaoXml({ cnpj: "11222333000181", stateCode: "53", year: 2026, series: 1, numberFrom: 10, numberTo: 15, justification: "Falha de numeracao na serie", environment: "HOMOLOGATION" });
  assert.equal(inutId.length, 43);
  assert.match(inutId, /^ID53261122233300018165001000000010000000015$/);
  assert.match(xml, /<xServ>INUTILIZAR<\/xServ>/);
  const cert = throwaway();
  const signed = signSefazXml({ xml, tagName: "infInut", ...cert });
  const { body, action } = buildInutilizacaoSoap(signed.signedXml);
  assert.match(action, /NFeInutilizacao4/);
  assert.match(body, /<nfeDadosMsg><inutNFe/);

  const resp = `<retInutNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><infInut><tpAmb>2</tpAmb><cStat>102</cStat><xMotivo>Inutilizacao de numero homologado</xMotivo><nProt>853260000111</nProt></infInut></retInutNFe>`;
  const result = parseInutilizacaoResponse(resp);
  assert.equal(result.homologated, true);
  assert.equal(result.protocol, "853260000111");
});
