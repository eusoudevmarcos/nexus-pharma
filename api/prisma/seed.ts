import "dotenv/config";
import { hash } from "bcryptjs";
import { prisma } from "../src/infra/prisma.js";

const plans = [
  {
    code: "BASIC",
    name: "Basic",
    description:
      "ERP tradicional para vendas, estoque básico e financeiro.",
    monthlyPrice: 698,
    yearlyPrice: 8376,
    setupPrice: 890,
    successFeeRate: 0,
    hasFineTuning: false,
    includedStores: 1,
    includedPdvsPerStore: 1,
    additionalStorePrice: 1000,
    extraPdvPrice: 280,
    position: 1,
    limits: { stores: 1, pdvsPerStore: 1 },
    features: ["Vendas", "Estoque básico", "Financeiro", "Conversão simples no onboarding"],
  },
  {
    code: "SMART",
    name: "Smart",
    description:
      "ERP com IA de compras, validades e automação de estoque e pedidos.",
    monthlyPrice: 1199,
    yearlyPrice: 14388,
    setupPrice: 890,
    successFeeRate: 0,
    hasFineTuning: false,
    includedStores: 1,
    includedPdvsPerStore: 1,
    additionalStorePrice: 1000,
    extraPdvPrice: 280,
    position: 2,
    limits: { stores: 1, pdvsPerStore: 1 },
    features: [
      "Tudo do Basic",
      "IA de compras",
      "Gestão de validades",
      "Automação de estoque e pedidos",
    ],
  },
  {
    code: "FISCAL_INTELIGENTE",
    name: "Fiscal Inteligente",
    description:
      "ERP, IA de compras e motor tributário em tempo real.",
    monthlyPrice: 1990,
    yearlyPrice: 23880,
    setupPrice: 890,
    successFeeRate: 0.1,
    hasFineTuning: false,
    includedStores: 1,
    includedPdvsPerStore: 1,
    additionalStorePrice: 1000,
    extraPdvPrice: 280,
    position: 3,
    limits: { stores: 1, pdvsPerStore: 1 },
    features: [
      "Tudo do Smart",
      "Motor tributário em tempo real",
      "Success Fee de 10% sobre economia homologada",
    ],
  },
  {
    code: "ULTIMATE",
    name: "Ultimate",
    description: "Operação completa com consultoria inicial de ajuste fino tributário na base de dados.",
    monthlyPrice: 2498,
    yearlyPrice: 29976,
    setupPrice: 10000,
    successFeeRate: 0.1,
    hasFineTuning: true,
    includedStores: 1,
    includedPdvsPerStore: 1,
    additionalStorePrice: 1000,
    extraPdvPrice: 280,
    position: 4,
    limits: { stores: 1, pdvsPerStore: 1, setupEntry: 5000, setupInstallments: 4, setupInstallmentAmount: 1250 },
    features: ["Tudo do Fiscal Inteligente", "Ajuste fino tributário inicial", "Entrada de R$ 5.000 + 4 parcelas de R$ 1.250", "Success Fee de 10% sobre economia homologada"],
  },
] as const;

await prisma.plan.updateMany({
  where: { code: { in: ["ESSENCIAL", "GESTAO", "REDE"] } },
  data: { active: false },
});

for (const plan of plans) {
  await prisma.plan.upsert({
    where: { code: plan.code },
    update: plan,
    create: plan,
  });
}

const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
if (adminEmail && adminPassword) {
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: "Administrador Nexus",
      systemRole: "INTERNAL_ADMIN",
      status: "ACTIVE",
    },
    create: {
      email: adminEmail,
      name: "Administrador Nexus",
      passwordHash: await hash(adminPassword, 12),
      systemRole: "INTERNAL_ADMIN",
      status: "ACTIVE",
    },
  });
}

await prisma.$disconnect();
