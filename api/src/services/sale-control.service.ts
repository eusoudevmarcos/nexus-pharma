import { validateBrazilianTaxId } from "./nfce.service.js";

export type BuyerContext = {
  taxId?: string | null;
  name?: string | null;
  birthDate?: Date | null;
};

export type PrescriptionContext = {
  number?: string | null;
  prescriberName?: string | null;
  prescriberRegistration?: string | null;
  prescriberState?: string | null;
  issuedAt?: Date | null;
  retained?: boolean;
};

export type SaleControlPolicy = {
  controlLevel: "NONE" | "PRESCRIPTION_PRESENTATION" | "PRESCRIPTION_RETENTION" | "SPECIAL_CONTROL";
  requiresBuyerId: boolean;
  requiresPrescription: boolean;
  requiresPharmacist: boolean;
  retainsPrescription: boolean;
  minimumBuyerAge: number | null;
  controlRuleVersion: string | null;
  controlLegalBasis: string | null;
};

export const onlyDigits = (value: string) => value.replace(/\D/g, "");

export function ageOnDate(birthDate: Date, reference: Date) {
  let age = reference.getUTCFullYear() - birthDate.getUTCFullYear();
  const month = reference.getUTCMonth() - birthDate.getUTCMonth();
  if (month < 0 || (month === 0 && reference.getUTCDate() < birthDate.getUTCDate())) age -= 1;
  return age;
}

export function validateControlledSaleLine(input: {
  policy: SaleControlPolicy;
  buyer?: BuyerContext | null;
  prescription?: PrescriptionContext | null;
  hasVerifiedPharmacist: boolean;
  now?: Date;
}) {
  const { policy } = input;
  const now = input.now ?? new Date();
  const errors: string[] = [];
  const hasControlRequirements = policy.controlLevel !== "NONE" || policy.requiresBuyerId || policy.requiresPrescription || policy.requiresPharmacist || policy.retainsPrescription || policy.minimumBuyerAge !== null;
  if (hasControlRequirements && (!policy.controlRuleVersion?.trim() || (policy.controlLegalBasis?.trim().length ?? 0) < 10)) {
    errors.push("POLITICA_DE_CONTROLE_SEM_FONTE_OU_VERSAO");
  }
  if (policy.requiresBuyerId || policy.minimumBuyerAge !== null) {
    if (!input.buyer?.taxId || !validateBrazilianTaxId(input.buyer.taxId)) errors.push("COMPRADOR_IDENTIFICADO_OBRIGATORIO");
    if (!input.buyer?.name?.trim()) errors.push("NOME_DO_COMPRADOR_OBRIGATORIO");
  }
  if (policy.minimumBuyerAge !== null) {
    if (!input.buyer?.birthDate) errors.push("DATA_DE_NASCIMENTO_DO_COMPRADOR_OBRIGATORIA");
    else if (ageOnDate(input.buyer.birthDate, now) < policy.minimumBuyerAge) errors.push(`IDADE_MINIMA_NAO_ATENDIDA:${policy.minimumBuyerAge}`);
  }
  if (policy.requiresPharmacist && !input.hasVerifiedPharmacist) errors.push("FARMACEUTICO_VERIFICADO_OBRIGATORIO");
  if (policy.requiresPrescription) {
    const prescription = input.prescription;
    if (!prescription?.number?.trim()) errors.push("NUMERO_DA_PRESCRICAO_OBRIGATORIO");
    if (!prescription?.prescriberName?.trim()) errors.push("PRESCRITOR_OBRIGATORIO");
    if (!prescription?.prescriberRegistration?.trim()) errors.push("REGISTRO_DO_PRESCRITOR_OBRIGATORIO");
    if (!prescription?.prescriberState || !/^[A-Z]{2}$/.test(prescription.prescriberState)) errors.push("UF_DO_PRESCRITOR_OBRIGATORIA");
    if (!prescription?.issuedAt) errors.push("DATA_DA_PRESCRICAO_OBRIGATORIA");
    else if (prescription.issuedAt > now) errors.push("PRESCRICAO_COM_DATA_FUTURA");
  }
  if (policy.retainsPrescription && !input.prescription?.retained) errors.push("RETENCAO_DA_PRESCRICAO_DEVE_SER_CONFIRMADA");
  return errors;
}
