import PDFDocument from "pdfkit";
import QRCode from "qrcode";

/**
 * Geração do DANFE NFC-e (cupom) em PDF no formato de bobina 80mm, conforme o
 * "Manual de Especificações Técnicas do DANFE NFC-e e QR Code".
 *
 * Presentation-only: recebe os dados já calculados e o conteúdo do QR Code
 * (buildNfceQrCode) e devolve o PDF. Não acessa banco, rede nem segredos.
 *
 * Observação: o layout visual atende aos elementos obrigatórios; o ajuste fino
 * (fonte/medidas exatas exigidas por cada SEFAZ) é refinado na homologação.
 */

export type NfceDanfeItem = {
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
};

export type NfceDanfePayment = { label: string; amount: number };

export type NfceDanfeInput = {
  environment: "HOMOLOGATION" | "PRODUCTION";
  issuer: { legalName: string; cnpj: string; stateRegistration?: string | null; addressLine?: string | null };
  number: number;
  series: number;
  issuedAt: Date;
  accessKey: string;
  /** Conteúdo textual do QR Code (mesmo string do infNFeSupl/qrCode). */
  qrCode: string;
  /** URL de consulta por chave (infNFeSupl/urlChave). */
  consultationUrl?: string | null;
  items: NfceDanfeItem[];
  totalItems: number;
  totalAmount: number;
  discount?: number | null;
  amountDue: number;
  payments: NfceDanfePayment[];
  change?: number | null;
  customerTaxId?: string | null;
  /** Protocolo de autorização, quando já autorizada. */
  protocol?: string | null;
  authorizedAt?: Date | null;
  /** Valor aproximado dos tributos (Lei 12.741/2012). */
  approximateTaxes?: number | null;
  /** Desativa a compressão do PDF (usado em testes para inspeção). */
  compress?: boolean;
};

const brl = (value: number | null | undefined) =>
  (value ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatAccessKey(key: string): string {
  return (key.match(/.{1,4}/g) ?? [key]).join(" ");
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/** Gera o PDF do DANFE NFC-e e resolve com o Buffer completo. */
export async function buildNfceDanfe(input: NfceDanfeInput): Promise<Buffer> {
  const width = 226.77; // ~80mm
  const margin = 12;
  const contentWidth = width - margin * 2;
  const estimatedHeight = 520 + input.items.length * 24 + input.payments.length * 12;

  const doc = new PDFDocument({
    size: [width, estimatedHeight],
    margins: { top: margin, bottom: margin, left: margin, right: margin },
    compress: input.compress ?? true,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const center = (t: string, size = 7, bold = false) =>
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).text(t, margin, doc.y, { width: contentWidth, align: "center" });
  const left = (t: string, size = 7, bold = false) =>
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).text(t, margin, doc.y, { width: contentWidth, align: "left" });
  const rule = () => {
    doc.moveTo(margin, doc.y + 1).lineTo(width - margin, doc.y + 1).lineWidth(0.4).stroke();
    doc.moveDown(0.4);
  };

  // Cabeçalho do emitente
  center(input.issuer.legalName, 8, true);
  center(`CNPJ ${input.issuer.cnpj}${input.issuer.stateRegistration ? `  IE ${input.issuer.stateRegistration}` : ""}`);
  if (input.issuer.addressLine) center(input.issuer.addressLine);
  doc.moveDown(0.3);
  center("Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica", 6);
  rule();

  // Itens
  left("#  COD  DESCRICAO", 6, true);
  left("   QTD x UNIT           TOTAL", 6, true);
  doc.moveDown(0.2);
  input.items.forEach((item, index) => {
    left(`${index + 1} ${item.code} ${item.description}`, 6.5);
    left(`   ${item.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${item.unit} x ${brl(item.unitPrice)}          ${brl(item.total)}`, 6.5);
  });
  rule();

  // Totais
  left(`Qtde. total de itens: ${input.totalItems}`);
  left(`Valor total R$: ${brl(input.totalAmount)}`);
  if (input.discount && input.discount > 0) left(`Descontos R$: ${brl(input.discount)}`);
  doc.font("Helvetica-Bold").fontSize(8).text(`VALOR A PAGAR R$: ${brl(input.amountDue)}`, margin, doc.y, { width: contentWidth });
  doc.moveDown(0.2);
  left("FORMA DE PAGAMENTO           VALOR PAGO", 6, true);
  input.payments.forEach((payment) => left(`${payment.label}                 ${brl(payment.amount)}`, 6.5));
  if (input.change && input.change > 0) left(`Troco R$: ${brl(input.change)}`);
  rule();

  // Consumidor
  center(input.customerTaxId ? `Consumidor CPF/CNPJ: ${input.customerTaxId}` : "CONSUMIDOR NAO IDENTIFICADO", 6.5);
  if (input.approximateTaxes != null) center(`Valor aproximado dos tributos R$ ${brl(input.approximateTaxes)} (Lei 12.741)`, 6);
  rule();

  // Identificação da NFC-e
  center(`NFC-e no. ${input.number}  Serie ${input.series}`, 6.5, true);
  center(`Emissao: ${formatDateTime(input.issuedAt)}`, 6.5);
  if (input.protocol) center(`Protocolo de autorizacao: ${input.protocol}`, 6.5);
  if (input.authorizedAt) center(formatDateTime(input.authorizedAt), 6);
  doc.moveDown(0.2);
  center("Consulte pela Chave de Acesso em:", 6);
  if (input.consultationUrl) center(input.consultationUrl, 6);
  center(formatAccessKey(input.accessKey), 6.5, true);
  rule();

  if (input.environment === "HOMOLOGATION") {
    center("EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL", 7, true);
    doc.moveDown(0.2);
  }

  // QR Code
  const qrPng = await QRCode.toBuffer(input.qrCode, { margin: 1, width: 170, errorCorrectionLevel: "M" });
  const qrSize = 130;
  doc.image(qrPng, (width - qrSize) / 2, doc.y, { width: qrSize, height: qrSize });

  doc.end();
  return finished;
}
