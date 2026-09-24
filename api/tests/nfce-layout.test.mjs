import test from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import {
  buildNfceInfXml,
  injectNfceSupl,
  HOMOLOGATION_ITEM_DESCRIPTION,
} from "../dist/services/nfce-layout.service.js";
import { signNfceXml } from "../dist/services/nfce-signature.service.js";
import { buildNfceQrCode } from "../dist/services/nfce-qrcode.service.js";

const chave = "53260811222333000181650010000001231123456782";

function baseInput(overrides = {}) {
  return {
    accessKey: chave,
    environment: "HOMOLOGATION",
    emissionType: "NORMAL",
    series: 1,
    number: 123,
    numericCode: "12345678",
    issuedAt: new Date("2026-08-29T15:00:00-03:00"),
    issuer: {
      cnpj: "11222333000181",
      legalName: "Farmácia Nexus LTDA",
      tradeName: "Nexus Pharma",
      stateRegistration: "0730000100109",
      taxRegimeCode: "1",
      address: {
        street: "SCS Quadra 2",
        number: "10",
        district: "Asa Sul",
        cityCode: "5300108",
        cityName: "Brasília",
        state: "DF",
        zipCode: "70300000",
        phone: "6133334444",
      },
    },
    items: [
      {
        code: "MED-001",
        ean: "7891234567895",
        description: "Dipirona 500mg",
        ncm: "30049099",
        cfop: "5405",
        quantity: 2,
        unitPrice: 9,
        grossAmount: 20,
        discount: 2,
        taxes: { origin: "0", csosn: "500", cstPis: "04", cstCofins: "04", icmsStBaseRetained: 20, icmsStRetained: 3.6 },
      },
    ],
    payments: [{ method: "01", amount: 18 }],
    ...overrides,
  };
}

test("gera NFe oficial 4.00 com namespace e Id da chave", () => {
  const { xml } = buildNfceInfXml(baseInput());
  assert.match(xml, /<NFe xmlns="http:\/\/www\.portalfiscal\.inf\.br\/nfe">/);
  assert.match(xml, new RegExp(`<infNFe versao="4\\.00" Id="NFe${chave}">`));
  assert.match(xml, /<mod>65<\/mod>/);
  assert.match(xml, /<tpImp>4<\/tpImp>/);
  assert.match(xml, /<indPres>1<\/indPres>/);
  assert.match(xml, /<indFinal>1<\/indFinal>/);
  assert.match(xml, /<tpAmb>2<\/tpAmb>/); // homologação
});

test("homologação: 1º item recebe a descrição SEM VALOR FISCAL", () => {
  const { xml } = buildNfceInfXml(baseInput());
  assert.match(xml, new RegExp(`<xProd>${HOMOLOGATION_ITEM_DESCRIPTION.replace(/[-]/g, "\\-")}</xProd>`));
});

test("Simples Nacional: usa grupo ICMSSN (CSOSN), não ICMS por CST", () => {
  const { xml } = buildNfceInfXml(baseInput());
  assert.match(xml, /<ICMSSN500><orig>0<\/orig><CSOSN>500<\/CSOSN><vBCSTRet>20\.00<\/vBCSTRet><vICMSSTRet>3\.60<\/vICMSSTRet><\/ICMSSN500>/);
  assert.match(xml, /<PIS><PISNT><CST>04<\/CST><\/PISNT><\/PIS>/);
  assert.match(xml, /<COFINS><COFINSNT><CST>04<\/CST><\/COFINSNT><\/COFINS>/);
});

test("regime normal com CST 00 usa grupo ICMS00 com base e alíquota", () => {
  const input = baseInput();
  input.issuer.taxRegimeCode = "3";
  input.items[0].taxes = { origin: "0", cstIcms: "00", icmsBase: 20, icmsRate: 0.18, icmsAmount: 3.6, cstPis: "01", pisBase: 20, pisRate: 0.0165, pisAmount: 0.33, cstCofins: "01", cofinsBase: 20, cofinsRate: 0.076, cofinsAmount: 1.52 };
  const { xml } = buildNfceInfXml(input);
  assert.match(xml, /<ICMS00><orig>0<\/orig><CST>00<\/CST><modBC>3<\/modBC><vBC>20\.00<\/vBC><pICMS>0\.1800<\/pICMS><vICMS>3\.60<\/vICMS><\/ICMS00>/);
  assert.match(xml, /<CRT>3<\/CRT>/);
  assert.match(xml, /<PISAliq>/);
  assert.match(xml, /<COFINSAliq>/);
});

test("totais: vNF = vProd - vDesc e emitente completo", () => {
  const { xml } = buildNfceInfXml(baseInput());
  assert.match(xml, /<vProd>20\.00<\/vProd>/);
  assert.match(xml, /<vDesc>2\.00<\/vDesc>/);
  assert.match(xml, /<vNF>18\.00<\/vNF>/);
  assert.match(xml, /<enderEmit><xLgr>SCS Quadra 2<\/xLgr>/);
  assert.match(xml, /<cPais>1058<\/cPais><xPais>BRASIL<\/xPais>/);
});

test("EAN inválido vira SEM GTIN", () => {
  const input = baseInput();
  input.items[0].ean = "123";
  const { xml } = buildNfceInfXml(input);
  assert.match(xml, /<cEAN>SEM GTIN<\/cEAN>/);
  assert.match(xml, /<cEANTrib>SEM GTIN<\/cEANTrib>/);
});

test("montagem completa: ordem infNFe → infNFeSupl → Signature e assinatura permanece válida", () => {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const attrs = [{ name: "commonName", value: "TESTE:11222333000181" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const certificatePem = forge.pki.certificateToPem(cert);
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

  const { xml, accessKey } = buildNfceInfXml(baseInput());
  const signed = signNfceXml({ xml, certificatePem, privateKeyPem });
  const qr = buildNfceQrCode({
    accessKey,
    environment: "HOMOLOGATION",
    cscId: "000001",
    csc: "ABCDE12345csc",
    baseUrl: "https://www.fazenda.df.gov.br/nfce/qrcode",
    consultationUrl: "https://www.fazenda.df.gov.br/nfce/consulta",
  });
  const finalXml = injectNfceSupl(signed.signedXml, { qrCode: qr.qrCode, urlChave: qr.urlChave });

  // Ordem oficial do documento.
  assert.match(finalXml, /<\/infNFe><infNFeSupl><qrCode>/);
  assert.match(finalXml, /<\/infNFeSupl><Signature/);
  assert.match(finalXml, /<urlChave>https:\/\/www\.fazenda\.df\.gov\.br\/nfce\/consulta<\/urlChave>/);

  // A assinatura precisa continuar válida após inserir o infNFeSupl (fora da Reference).
  const signatureXml = finalXml.match(/<Signature[\s\S]*<\/Signature>/)[0];
  const verifier = new SignedXml({ publicCert: certificatePem });
  verifier.loadSignature(signatureXml);
  assert.equal(verifier.checkSignature(finalXml), true);
});

test("rejeita chave inválida, ausência de itens e de pagamento", () => {
  assert.throws(() => buildNfceInfXml(baseInput({ accessKey: "123" })), /NFCE_LAYOUT_CHAVE_INVALIDA/);
  assert.throws(() => buildNfceInfXml(baseInput({ items: [] })), /NFCE_LAYOUT_SEM_ITENS/);
  assert.throws(() => buildNfceInfXml(baseInput({ payments: [] })), /NFCE_LAYOUT_SEM_PAGAMENTO/);
});
