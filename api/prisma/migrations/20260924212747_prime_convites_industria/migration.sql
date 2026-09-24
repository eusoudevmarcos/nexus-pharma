-- Convite de usuário da indústria/distribuição (Painel Prime): organização + perfil.
-- Aditivo: colunas anuláveis, convites existentes não mudam.
ALTER TABLE "invitations" ADD COLUMN "prime_organization_id" UUID,
ADD COLUMN "prime_role" "PrimeRole";

CREATE INDEX "invitations_prime_organization_id_email_idx" ON "invitations"("prime_organization_id", "email");

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_prime_organization_id_fkey" FOREIGN KEY ("prime_organization_id") REFERENCES "prime_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
