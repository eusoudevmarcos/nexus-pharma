import "dotenv/config";
import { hash } from "bcryptjs";
import { prisma } from "../src/infra/prisma.js";

const plans = [
  {
    code: "ESSENCIAL",
    name: "Essencial",
    description:
      "Controle fiscal, catálogo, estoque e alertas para uma operação.",
    monthlyPrice: 299,
    yearlyPrice: 2990,
    position: 1,
    limits: { companies: 1, users: 5, products: 5000 },
    features: ["Motor fiscal", "Estoque e validade", "Alertas de reposição"],
  },
  {
    code: "GESTAO",
    name: "Gestão",
    description:
      "Inteligência comercial, suporte prioritário e múltiplos gestores.",
    monthlyPrice: 599,
    yearlyPrice: 5990,
    position: 2,
    limits: { companies: 3, users: 20, products: 25000 },
    features: [
      "Tudo do Essencial",
      "IA fiscal assistida",
      "Indicadores de margem",
      "Suporte prioritário",
    ],
  },
  {
    code: "REDE",
    name: "Rede",
    description:
      "Governança, integrações e operação multiempresa para redes farmacêuticas.",
    monthlyPrice: 1299,
    yearlyPrice: 12990,
    position: 3,
    limits: { companies: 20, users: 100, products: 150000 },
    features: [
      "Tudo do Gestão",
      "API e webhooks",
      "Liberações por empresa",
      "SLA dedicado",
    ],
  },
] as const;

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
