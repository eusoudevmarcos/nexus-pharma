import test from "node:test";
import assert from "node:assert/strict";
import { buildNfceDanfe } from "../dist/services/nfce-danfe.service.js";

const chave = "53260811222333000181650010000001231123456782";

// O pdfkit grava o texto como tokens hex dentro de arrays TJ. Para inspecionar
// o conteúdo, decodificamos todos os tokens <hex> do stream não comprimido e
// concatenamos — o kerning parte o texto, mas a concatenação o reconstitui.
function pdfText(buffer) {
  const raw = buffer.toString("latin1");
  return (raw.match(/<([0-9A-Fa-f]+)>/g) ?? [])
    .map((token) => Buffer.from(token.slice(1, -1), "hex").toString("latin1"))
    .join("");
}

function baseInput(overrides = {}) {
  return {
    environment: "HOMOLOGATION",
    issuer: { legalName: "FARMACIA NEXUS LTDA", cnpj: "11222333000181", stateRegistration: "0730000100109", addressLine: "SCS Q2, 10 - Brasilia/DF" },
    number: 123,
    series: 1,
    issuedAt: new Date("2026-08-29T15:00:00-03:00"),
    accessKey: chave,
    qrCode: "https://www.fazenda.df.gov.br/nfce/qrcode?p=" + chave + "|2|2|000001|8DCF7081EDEB0FBDE0C23A0C179DE5E8B2477C28",
    consultationUrl: "https://www.fazenda.df.gov.br/nfce/consulta",
    items: [{ code: "MED-001", description: "DIPIRONA 500MG", quantity: 2, unit: "UN", unitPrice: 9, total: 18 }],
    totalItems: 1,
    totalAmount: 20,
    discount: 2,
    amountDue: 18,
    payments: [{ label: "Dinheiro", amount: 20 }],
    change: 2,
    approximateTaxes: 1.2,
    compress: false,
    ...overrides,
  };
}

test("gera um PDF válido (%PDF), não vazio e com o QR Code embutido", async () => {
  const pdf = await buildNfceDanfe(baseInput());
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 4).toString("latin1"), "%PDF");
  assert.ok(pdf.length > 2000);
  // O QR entra como XObject de imagem no PDF.
  assert.match(pdf.toString("latin1"), /\/Subtype \/Image/);
});

test("homologação estampa o aviso SEM VALOR FISCAL e a razão social", async () => {
  const text = pdfText(await buildNfceDanfe(baseInput()));
  assert.match(text, /HOMOLOGACAO - SEM VALOR FISCAL/);
  assert.match(text, /FARMACIA NEXUS LTDA/);
});

test("produção não estampa o aviso de homologação e mostra o protocolo", async () => {
  const text = pdfText(await buildNfceDanfe(baseInput({ environment: "PRODUCTION", protocol: "153260000123456", authorizedAt: new Date("2026-08-29T15:00:05-03:00") })));
  assert.doesNotMatch(text, /SEM VALOR FISCAL/);
  assert.match(text, /153260000123456/);
});

test("sem consumidor identificado mostra CONSUMIDOR NAO IDENTIFICADO", async () => {
  const text = pdfText(await buildNfceDanfe(baseInput()));
  assert.match(text, /CONSUMIDOR NAO IDENTIFICADO/);
});
