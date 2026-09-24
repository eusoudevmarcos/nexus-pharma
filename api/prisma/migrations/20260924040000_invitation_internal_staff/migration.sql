-- Permite convite de equipe interna Nexus (Helpdesk/Financeiro/Comercial/
-- Developer/Admin interno), reaproveitando o modelo de convite de tenant:
-- companyId e role passam a ser opcionais, e ganha um system_role opcional.
ALTER TABLE "invitations"
  ALTER COLUMN "company_id" DROP NOT NULL,
  ALTER COLUMN "role" DROP NOT NULL,
  ADD COLUMN "system_role" "SystemRole";

CREATE INDEX "invitations_system_role_email_idx" ON "invitations" ("system_role", "email");
