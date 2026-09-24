import test from "node:test";
import assert from "node:assert/strict";
import { buildNfceQrCode } from "../dist/services/nfce-qrcode.service.js";

const key = "35260811222333000181650010000001231123456782";
const csc = "ABCDE12345csc";
const baseUrl = "https://www.fazenda.df.gov.br/nfce/qrcode";

test("QR online: ordem chave|versao|tpAmb|cIdToken|hash e hash SHA-1 conhecido", () => {
  const result = buildNfceQrCode({
    accessKey: key,
    environment: "HOMOLOGATION",
    cscId: "000001",
    csc,
    baseUrl,
  });
  assert.equal(result.hash, "8DCF7081EDEB0FBDE0C23A0C179DE5E8B2477C28");
  assert.equal(
    result.qrCode,
    `${baseUrl}?p=${key}|2|2|000001|8DCF7081EDEB0FBDE0C23A0C179DE5E8B2477C28`,
  );
});

test("QR nunca expõe o segredo CSC na URL", () => {
  const result = buildNfceQrCode({ accessKey: key, environment: "PRODUCTION", cscId: "000001", csc, baseUrl });
  assert.doesNotMatch(result.qrCode, /ABCDE12345csc/);
  assert.match(result.qrCode, /\|1\|000001\|/); // tpAmb=1 em produção
});

test("QR offline (contingência) inclui dia, vNF e digVal e hash conhecido", () => {
  const result = buildNfceQrCode({
    accessKey: key,
    environment: "HOMOLOGATION",
    cscId: "000001",
    csc,
    baseUrl,
    offline: { emissionDay: 29, totalAmount: 18, digestValueHex: "a1b2c3" },
  });
  assert.equal(result.hash, "635380EF249D0059C70DD48BDD4ED2EFF8F03BD4");
  assert.match(result.qrCode, /\|2\|2\|29\|18\.00\|a1b2c3\|000001\|/);
});

test("pad do idCSC para 6 posições por padrão e cru quando desativado", () => {
  const padded = buildNfceQrCode({ accessKey: key, environment: "HOMOLOGATION", cscId: "1", csc, baseUrl });
  assert.match(padded.qrCode, /\|000001\|/);
  const raw = buildNfceQrCode({ accessKey: key, environment: "HOMOLOGATION", cscId: "1", csc, baseUrl, padCscIdTo6: false });
  assert.match(raw.qrCode, /\|2\|1\|[0-9A-F]{40}$/);
});

test("hashCase controla a caixa do hash", () => {
  const lower = buildNfceQrCode({ accessKey: key, environment: "HOMOLOGATION", cscId: "000001", csc, baseUrl, hashCase: "lower" });
  assert.equal(lower.hash, "8dcf7081edeb0fbde0c23a0c179de5e8b2477c28");
});

test("rejeita chave, URL base http e CSC curto", () => {
  assert.throws(() => buildNfceQrCode({ accessKey: "123", environment: "HOMOLOGATION", cscId: "1", csc, baseUrl }), /NFCE_QRCODE_CHAVE_INVALIDA/);
  assert.throws(() => buildNfceQrCode({ accessKey: key, environment: "HOMOLOGATION", cscId: "1", csc, baseUrl: "http://x.gov.br" }), /NFCE_QRCODE_URL_BASE_INVALIDA/);
  assert.throws(() => buildNfceQrCode({ accessKey: key, environment: "HOMOLOGATION", cscId: "1", csc: "123", baseUrl }), /NFCE_QRCODE_CSC_INVALIDO/);
});
