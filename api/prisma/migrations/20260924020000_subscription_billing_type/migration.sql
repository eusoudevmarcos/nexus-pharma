-- Tipo de cobrança da assinatura: pagante, brinde/cortesia ou conta gratuita (piloto/testes).
CREATE TYPE "SubscriptionBillingType" AS ENUM ('PAYING', 'COMPLIMENTARY', 'FREE');

ALTER TABLE "subscriptions"
  ADD COLUMN "billing_type" "SubscriptionBillingType" NOT NULL DEFAULT 'PAYING',
  ADD COLUMN "complimentary_until" TIMESTAMPTZ(3);
