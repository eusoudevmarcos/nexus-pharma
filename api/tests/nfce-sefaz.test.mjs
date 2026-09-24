import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNfceAuthorizationSoap,
  parseNfceAuthorizationResponse,
  NFCE_AUTHORIZATION_ACTION,
} from "../dist/services/nfce-sefaz.service.js";

const chave = "53260811222333000181650010000001231123456782";
const signedNfe = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${chave}"><ide></ide></infNFe><Signature>...</Signature></NFe>`;

function authorizedEnvelope(protocolStatus = "100") {
  return `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeAutorizacaoLoteResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4"><nfeResultMsg><retEnviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><verAplic>SVRS</verAplic><cStat>104</cStat><xMotivo>Lote processado</xMotivo><cUF>53</cUF><dhRecbto>2026-08-29T15:00:05-03:00</dhRecbto><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${chave}</chNFe><dhRecbto>2026-08-29T15:00:05-03:00</dhRecbto><nProt>153260000123456</nProt><digVal>YWJjMTIz</digVal><cStat>${protocolStatus}</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></retEnviNFe></nfeResultMsg></nfeAutorizacaoLoteResponse></soap:Body></soap:Envelope>`;
}

test("monta SOAP de autorização síncrona com enviNFe e action", () => {
  const { body, action } = buildNfceAuthorizationSoap({ signedNfeXml: signedNfe, idLote: "1" });
  assert.equal(action, NFCE_AUTHORIZATION_ACTION);
  assert.match(body, /<enviNFe versao="4\.00" xmlns="http:\/\/www\.portalfiscal\.inf\.br\/nfe"><idLote>1<\/idLote><indSinc>1<\/indSinc><NFe/);
  assert.match(body, /nfeAutorizacaoLote xmlns="http:\/\/www\.portalfiscal\.inf\.br\/nfe\/wsdl\/NFeAutorizacao4"/);
});

test("rejeita XML sem NFe ou sem assinatura", () => {
  assert.throws(() => buildNfceAuthorizationSoap({ signedNfeXml: "<x/>", idLote: "1" }), /NFCE_SEFAZ_XML_SEM_NFE/);
  assert.throws(() => buildNfceAuthorizationSoap({ signedNfeXml: `<NFe><infNFe/></NFe>`, idLote: "1" }), /NFCE_SEFAZ_XML_NAO_ASSINADO/);
});

test("interpreta autorização (cStat 100) dentro do envelope SOAP", () => {
  const result = parseNfceAuthorizationResponse(authorizedEnvelope("100"));
  assert.equal(result.authorized, true);
  assert.equal(result.batchStatus, "104");
  assert.equal(result.protocolStatus, "100");
  assert.equal(result.accessKey, chave);
  assert.equal(result.protocol, "153260000123456");
  assert.equal(result.digestValue, "YWJjMTIz");
  assert.equal(result.environmentCode, "2");
});

test("interpreta rejeição (cStat 204 duplicidade) sem lançar", () => {
  const result = parseNfceAuthorizationResponse(authorizedEnvelope("204"));
  assert.equal(result.authorized, false);
  assert.equal(result.protocolStatus, "204");
});

test("interpreta retEnviNFe cru (sem envelope) e lote pendente 103", () => {
  const pending = `<retEnviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><cStat>103</cStat><xMotivo>Lote recebido com sucesso</xMotivo><infRec><nRec>531000012345678</nRec></infRec></retEnviNFe>`;
  const result = parseNfceAuthorizationResponse(pending);
  assert.equal(result.batchStatus, "103");
  assert.equal(result.pending, true);
  assert.equal(result.authorized, false);
});
