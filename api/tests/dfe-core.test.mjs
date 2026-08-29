import assert from "node:assert/strict";
import test from "node:test";
import {
  certificateEncryptionKey,
  decryptCertificatePayload,
  encryptCertificatePayload,
} from "../dist/services/dfe-certificate.service.js";
import { parseDistributionResponse, parseNfeXml } from "../dist/services/nfe-xml.service.js";

const fullNfe = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe53123456789012345678901234567890123456789012" versao="4.00">
    <ide><cUF>53</cUF><nNF>123</nNF><dhEmi>2026-08-28T10:00:00-03:00</dhEmi><mod>55</mod><serie>1</serie></ide>
    <emit><CNPJ>12345678000199</CNPJ><xNome>Fornecedor Teste</xNome><enderEmit><UF>GO</UF></enderEmit></emit>
    <dest><CNPJ>99887766000155</CNPJ><enderDest><UF>DF</UF></enderDest></dest>
    <det nItem="1"><prod><cProd>BATOM-1</cProd><cEAN>7891234567890</cEAN><xProd>Batom líquido matte</xProd><NCM>33041000</NCM><CEST>2001500</CEST><CFOP>5102</CFOP><uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>15.5000</vUnCom><vProd>31.00</vProd></prod>
      <imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>31.00</vBC><pICMS>18.00</pICMS><vICMS>5.58</vICMS></ICMS00></ICMS><PIS><PISAliq><CST>01</CST><pPIS>0.65</pPIS></PISAliq></PIS><COFINS><COFINSAliq><CST>01</CST><pCOFINS>3.00</pCOFINS></COFINSAliq></COFINS></imposto>
    </det><total><ICMSTot><vNF>31.00</vNF></ICMSTot></total>
  </infNFe></NFe><protNFe><infProt><chNFe>53123456789012345678901234567890123456789012</chNFe><nProt>123456789</nProt></infProt></protNFe>
</nfeProc>`;

test("parses full NF-e without trusting supplier tax classification", () => {
  const parsed = parseNfeXml(fullNfe);
  assert.equal(parsed.documentType, "NFE");
  assert.equal(parsed.accessKey, "53123456789012345678901234567890123456789012");
  assert.equal(parsed.destinationState, "DF");
  assert.equal(parsed.items.length, 1);
  assert.deepEqual(parsed.items[0] && {
    ncm: parsed.items[0].ncm,
    cfop: parsed.items[0].cfop,
    cstIcms: parsed.items[0].cstIcms,
    cstPis: parsed.items[0].cstPis,
    cstCofins: parsed.items[0].cstCofins,
  }, { ncm: "33041000", cfop: "5102", cstIcms: "00", cstPis: "01", cstCofins: "01" });
});

test("parses distribution summary and SOAP docZip metadata", () => {
  const summary = parseNfeXml(`<resNFe versao="1.01"><chNFe>53123456789012345678901234567890123456789012</chNFe><CNPJ>12345678000199</CNPJ><xNome>Fornecedor</xNome><dhEmi>2026-08-28T10:00:00-03:00</dhEmi><vNF>44.90</vNF></resNFe>`);
  assert.equal(summary.documentType, "NFE_SUMMARY");
  assert.equal(summary.totalAmount, 44.9);

  const response = parseDistributionResponse(`<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeDistDFeInteresseResponse><nfeDistDFeInteresseResult><retDistDFeInt><cStat>138</cStat><xMotivo>Documento localizado</xMotivo><ultNSU>000000000000123</ultNSU><maxNSU>000000000000123</maxNSU><loteDistDFeInt><docZip NSU="000000000000123" schema="resNFe_v1.01.xsd">H4sIAAAAAA==</docZip></loteDistDFeInt></retDistDFeInt></nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>`);
  assert.equal(response.statusCode, "138");
  assert.equal(response.documents[0]?.nsu, "000000000000123");
  assert.equal(response.documents[0]?.schemaName, "resNFe_v1.01.xsd");
});

test("encrypts A1 payload using authenticated encryption", () => {
  const key = certificateEncryptionKey(Buffer.alloc(32, 7).toString("base64"));
  const encrypted = encryptCertificatePayload({ pfxBase64: "ZmFrZS1wZng=", passphrase: "segredo" }, key);
  assert.notEqual(encrypted.includes("segredo"), true);
  assert.deepEqual(decryptCertificatePayload(encrypted, key), { pfxBase64: "ZmFrZS1wZng=", passphrase: "segredo" });
  const parts = encrypted.split(".");
  parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
  assert.throws(() => decryptCertificatePayload(parts.join("."), key));
});
