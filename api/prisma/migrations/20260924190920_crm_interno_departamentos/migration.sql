-- CRM interno: departamento derivado do systemRole (novo valor MARKETING) e
-- senioridade (Diretor/Gestor/Colaborador). commercial_owner_id habilita o
-- escopo "colaborador só vê os próprios clientes" no Comercial.

-- CreateEnum
CREATE TYPE "Seniority" AS ENUM ('DIRETOR', 'GESTOR', 'COLABORADOR');

-- AlterEnum
ALTER TYPE "SystemRole" ADD VALUE 'MARKETING';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN "commercial_owner_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "seniority" "Seniority" NOT NULL DEFAULT 'GESTOR';

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_commercial_owner_id_fkey" FOREIGN KEY ("commercial_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
