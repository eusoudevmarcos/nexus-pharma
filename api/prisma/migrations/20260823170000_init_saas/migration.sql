-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('CUSTOMER', 'INTERNAL_ADMIN', 'DEVELOPER', 'HELPDESK', 'FINANCE', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFICATION');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('LEAD', 'ONBOARDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'FINANCE', 'PHARMACIST', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL');

-- CreateEnum
CREATE TYPE "FiscalClassification" AS ENUM ('LISTA_POSITIVA', 'LISTA_NEGATIVA', 'LISTA_NEUTRA', 'MONOFASICO', 'TRIBUTACAO_NORMAL');

-- CreateEnum
CREATE TYPE "FiscalRuleStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TicketArea" AS ENUM ('SUPPORT', 'FISCAL', 'FINANCE', 'COMMERCIAL', 'TECHNICAL');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "ApprovalArea" AS ENUM ('PRODUCT', 'TECHNICAL', 'SUPPORT', 'FINANCE', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('ENTRY', 'SALE', 'ADJUSTMENT', 'LOSS', 'RETURN', 'TRANSFER');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceModel" AS ENUM ('NF55', 'NFC65');

-- CreateEnum
CREATE TYPE "ReorderAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'ORDERED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "TaxAnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(255),
    "name" VARCHAR(160) NOT NULL,
    "system_role" "SystemRole" NOT NULL DEFAULT 'CUSTOMER',
    "status" "AccountStatus" NOT NULL DEFAULT 'INVITED',
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(255) NOT NULL,
    "user_agent" VARCHAR(500),
    "ip_address" VARCHAR(64),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "one_time_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "one_time_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "cnpj" CHAR(14),
    "legal_name" VARCHAR(180) NOT NULL,
    "trade_name" VARCHAR(180) NOT NULL,
    "branch_name" VARCHAR(120) NOT NULL DEFAULT 'Matriz',
    "tax_regime" "TaxRegime" NOT NULL DEFAULT 'SIMPLES_NACIONAL',
    "state" CHAR(2),
    "city" VARCHAR(120),
    "status" "CompanyStatus" NOT NULL DEFAULT 'ONBOARDING',
    "onboarding_step" INTEGER NOT NULL DEFAULT 1,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "TenantRole" NOT NULL DEFAULT 'OPERATOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" "TenantRole" NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500) NOT NULL DEFAULT '',
    "monthly_price" DECIMAL(12,2) NOT NULL,
    "yearly_price" DECIMAL(12,2) NOT NULL,
    "limits" JSONB NOT NULL DEFAULT '{}',
    "features" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "provider" VARCHAR(40),
    "provider_customer_id" VARCHAR(120),
    "provider_contract_id" VARCHAR(120),
    "trial_ends_at" TIMESTAMPTZ(3),
    "current_period_start" TIMESTAMPTZ(3),
    "current_period_end" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "amount" DECIMAL(12,2) NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "provider_reference" VARCHAR(120),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_categories" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500) NOT NULL DEFAULT '',
    "ncm" CHAR(8) NOT NULL,
    "cest" CHAR(7),
    "classification" "FiscalClassification" NOT NULL,
    "rule_version" VARCHAR(30) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "status" "FiscalRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "source_references" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fiscal_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_rules" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "regime" "TaxRegime" NOT NULL,
    "cfop" CHAR(4) NOT NULL,
    "cst_icms" VARCHAR(3) NOT NULL,
    "csosn" CHAR(3),
    "icms_rate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "mva_rate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "cst_pis" CHAR(2) NOT NULL,
    "cst_cofins" CHAR(2) NOT NULL,
    "revenue_nature" VARCHAR(20),
    "pis_rate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "cofins_rate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "cst_ibs_cbs" VARCHAR(5) NOT NULL,
    "tax_classification" VARCHAR(60) NOT NULL,
    "cbs_rate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "ibs_rate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "cbs_reduction" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "ibs_reduction" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "offset_cbs_pis_cofins" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fiscal_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "ean" VARCHAR(14) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "active_ingredient" VARCHAR(180) NOT NULL DEFAULT '',
    "laboratory" VARCHAR(120) NOT NULL DEFAULT '',
    "current_cost" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "sale_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "stock_quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "minimum_stock" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "daily_sales_average" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_lots" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "manufactured_at" DATE NOT NULL,
    "expires_at" DATE NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(15,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "lot_id" UUID,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit_cost" DECIMAL(15,4),
    "origin_type" VARCHAR(40),
    "origin_id" VARCHAR(80),
    "notes" VARCHAR(500),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "invoice_model" "InvoiceModel" NOT NULL DEFAULT 'NFC65',
    "status" "SaleStatus" NOT NULL DEFAULT 'PENDING',
    "gross_amount" DECIMAL(15,2) NOT NULL,
    "cost_amount" DECIMAL(15,2) NOT NULL,
    "icms_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "pis_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cofins_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cbs_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "ibs_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "net_profit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "sold_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "product_id" UUID,
    "ean" VARCHAR(14) NOT NULL,
    "product_name" VARCHAR(180) NOT NULL,
    "category_code" VARCHAR(50) NOT NULL,
    "category_name" VARCHAR(120) NOT NULL,
    "ncm" CHAR(8) NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "unit_cost" DECIMAL(15,4) NOT NULL,
    "cfop" CHAR(4) NOT NULL,
    "cst_icms" VARCHAR(3) NOT NULL,
    "csosn" CHAR(3),
    "cst_pis" CHAR(2) NOT NULL,
    "cst_cofins" CHAR(2) NOT NULL,
    "revenue_nature" VARCHAR(20),
    "cst_ibs_cbs" VARCHAR(5) NOT NULL,
    "tax_classification" VARCHAR(60) NOT NULL,
    "icms_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "pis_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cofins_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cbs_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "ibs_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "profit_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "rule_version" VARCHAR(30) NOT NULL,
    "fiscal_snapshot" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_provisions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "period" DATE NOT NULL,
    "gross_revenue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "exempt_revenue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cost_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "net_profit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "monthly_provisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reorder_alerts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "status" "ReorderAlertStatus" NOT NULL DEFAULT 'OPEN',
    "stock_at_trigger" DECIMAL(15,3) NOT NULL,
    "suggested_quantity" DECIMAL(15,3) NOT NULL,
    "estimated_margin" DECIMAL(9,6),
    "reason" VARCHAR(300) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "reorder_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_analyses" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "product_id" UUID,
    "category_id" UUID,
    "requested_by_id" UUID NOT NULL,
    "reviewed_by_id" UUID,
    "status" "TaxAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "origin_state" CHAR(2),
    "destination_state" CHAR(2),
    "operation_type" VARCHAR(60),
    "product_composition" JSONB NOT NULL DEFAULT '{}',
    "current_classification" JSONB NOT NULL DEFAULT '{}',
    "suggested_classification" JSONB NOT NULL DEFAULT '{}',
    "legal_reasoning" TEXT,
    "confidence" DECIMAL(5,4),
    "estimated_savings" DECIMAL(15,2),
    "review_notes" TEXT,
    "model_version" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tax_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_evidence" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "source_type" VARCHAR(40) NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "source_url" VARCHAR(1000),
    "jurisdiction" VARCHAR(80),
    "published_at" DATE,
    "effective_from" DATE,
    "excerpt_hash" VARCHAR(128),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "company_id" UUID,
    "created_by_id" UUID NOT NULL,
    "assigned_to_id" UUID,
    "area" "TicketArea" NOT NULL DEFAULT 'SUPPORT',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "subject" VARCHAR(180) NOT NULL,
    "description" TEXT NOT NULL,
    "sla_due_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "internal_only" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releases" (
    "id" UUID NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "notes" TEXT NOT NULL,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "environment" VARCHAR(40) NOT NULL DEFAULT 'production',
    "created_by_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_approvals" (
    "id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "area" "ApprovalArea" NOT NULL,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_releases" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "enabled_by_id" UUID NOT NULL,
    "enabled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ(3),

    CONSTRAINT "customer_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_credentials" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "key_prefix" VARCHAR(20) NOT NULL,
    "key_hash" VARCHAR(255) NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "last_used_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "user_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity" VARCHAR(80) NOT NULL,
    "entity_id" VARCHAR(80),
    "request_id" VARCHAR(80),
    "ip_address" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_expires_at_idx" ON "auth_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "one_time_tokens_token_hash_key" ON "one_time_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "one_time_tokens_user_id_purpose_expires_at_idx" ON "one_time_tokens"("user_id", "purpose", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "companies_cnpj_key" ON "companies"("cnpj");

-- CreateIndex
CREATE INDEX "companies_status_idx" ON "companies"("status");

-- CreateIndex
CREATE INDEX "memberships_user_id_active_idx" ON "memberships"("user_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_company_id_user_id_key" ON "memberships"("company_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_company_id_email_idx" ON "invitations"("company_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "plans_active_position_idx" ON "plans"("active", "position");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_contract_id_key" ON "subscriptions"("provider_contract_id");

-- CreateIndex
CREATE INDEX "subscriptions_company_id_status_idx" ON "subscriptions"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_provider_reference_key" ON "invoices"("provider_reference");

-- CreateIndex
CREATE INDEX "invoices_status_due_at_idx" ON "invoices"("status", "due_at");

-- CreateIndex
CREATE INDEX "fiscal_categories_company_id_ncm_active_idx" ON "fiscal_categories"("company_id", "ncm", "active");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_categories_company_id_code_key" ON "fiscal_categories"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_rules_category_id_regime_key" ON "fiscal_rules"("category_id", "regime");

-- CreateIndex
CREATE INDEX "products_company_id_name_idx" ON "products"("company_id", "name");

-- CreateIndex
CREATE INDEX "products_company_id_category_id_active_idx" ON "products"("company_id", "category_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "products_company_id_ean_key" ON "products"("company_id", "ean");

-- CreateIndex
CREATE INDEX "inventory_lots_expires_at_quantity_idx" ON "inventory_lots"("expires_at", "quantity");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_lots_product_id_code_key" ON "inventory_lots"("product_id", "code");

-- CreateIndex
CREATE INDEX "stock_movements_company_id_occurred_at_idx" ON "stock_movements"("company_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_occurred_at_idx" ON "stock_movements"("product_id", "occurred_at");

-- CreateIndex
CREATE INDEX "sales_company_id_sold_at_idx" ON "sales"("company_id", "sold_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_company_id_idempotency_key_key" ON "sales"("company_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "sale_items_ncm_idx" ON "sale_items"("ncm");

-- CreateIndex
CREATE INDEX "monthly_provisions_company_id_period_idx" ON "monthly_provisions"("company_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_provisions_company_id_period_key" ON "monthly_provisions"("company_id", "period");

-- CreateIndex
CREATE INDEX "reorder_alerts_company_id_status_created_at_idx" ON "reorder_alerts"("company_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "tax_analyses_company_id_status_created_at_idx" ON "tax_analyses"("company_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "tax_evidence_analysis_id_idx" ON "tax_evidence"("analysis_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_code_key" ON "support_tickets"("code");

-- CreateIndex
CREATE INDEX "support_tickets_area_status_priority_created_at_idx" ON "support_tickets"("area", "status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_company_id_status_idx" ON "support_tickets"("company_id", "status");

-- CreateIndex
CREATE INDEX "ticket_messages_ticket_id_created_at_idx" ON "ticket_messages"("ticket_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "releases_version_key" ON "releases"("version");

-- CreateIndex
CREATE INDEX "releases_status_created_at_idx" ON "releases"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "release_approvals_release_id_area_key" ON "release_approvals"("release_id", "area");

-- CreateIndex
CREATE INDEX "customer_releases_company_id_enabled_at_idx" ON "customer_releases"("company_id", "enabled_at");

-- CreateIndex
CREATE UNIQUE INDEX "customer_releases_company_id_release_id_key" ON "customer_releases"("company_id", "release_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_credentials_key_hash_key" ON "api_credentials"("key_hash");

-- CreateIndex
CREATE INDEX "api_credentials_company_id_revoked_at_idx" ON "api_credentials"("company_id", "revoked_at");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_created_at_idx" ON "audit_logs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_time_tokens" ADD CONSTRAINT "one_time_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_categories" ADD CONSTRAINT "fiscal_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_rules" ADD CONSTRAINT "fiscal_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "fiscal_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "fiscal_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_provisions" ADD CONSTRAINT "monthly_provisions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_alerts" ADD CONSTRAINT "reorder_alerts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_alerts" ADD CONSTRAINT "reorder_alerts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_analyses" ADD CONSTRAINT "tax_analyses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_analyses" ADD CONSTRAINT "tax_analyses_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_analyses" ADD CONSTRAINT "tax_analyses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "fiscal_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_analyses" ADD CONSTRAINT "tax_analyses_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_analyses" ADD CONSTRAINT "tax_analyses_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_evidence" ADD CONSTRAINT "tax_evidence_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "tax_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_approvals" ADD CONSTRAINT "release_approvals_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_approvals" ADD CONSTRAINT "release_approvals_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_releases" ADD CONSTRAINT "customer_releases_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_releases" ADD CONSTRAINT "customer_releases_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_releases" ADD CONSTRAINT "customer_releases_enabled_by_id_fkey" FOREIGN KEY ("enabled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_credentials" ADD CONSTRAINT "api_credentials_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_credentials" ADD CONSTRAINT "api_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain integrity that Prisma cannot currently express in the schema.
ALTER TABLE "companies"
  ADD CONSTRAINT "companies_cnpj_format_check" CHECK ("cnpj" IS NULL OR "cnpj" ~ '^[0-9]{14}$'),
  ADD CONSTRAINT "companies_onboarding_step_check" CHECK ("onboarding_step" >= 1);

ALTER TABLE "fiscal_categories"
  ADD CONSTRAINT "fiscal_categories_ncm_format_check" CHECK ("ncm" ~ '^[0-9]{8}$'),
  ADD CONSTRAINT "fiscal_categories_cest_format_check" CHECK ("cest" IS NULL OR "cest" ~ '^[0-9]{7}$'),
  ADD CONSTRAINT "fiscal_categories_validity_check" CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from");

ALTER TABLE "fiscal_rules"
  ADD CONSTRAINT "fiscal_rules_cfop_format_check" CHECK ("cfop" ~ '^[0-9]{4}$'),
  ADD CONSTRAINT "fiscal_rules_rates_check" CHECK (
    "icms_rate" BETWEEN 0 AND 1 AND "pis_rate" BETWEEN 0 AND 1 AND
    "cofins_rate" BETWEEN 0 AND 1 AND "cbs_rate" BETWEEN 0 AND 1 AND
    "ibs_rate" BETWEEN 0 AND 1 AND "cbs_reduction" BETWEEN 0 AND 1 AND
    "ibs_reduction" BETWEEN 0 AND 1 AND "mva_rate" >= 0
  );

ALTER TABLE "products"
  ADD CONSTRAINT "products_ean_format_check" CHECK ("ean" ~ '^[0-9]{8,14}$'),
  ADD CONSTRAINT "products_values_check" CHECK (
    "current_cost" >= 0 AND "sale_price" >= 0 AND "stock_quantity" >= 0 AND
    "minimum_stock" >= 0 AND "daily_sales_average" >= 0
  );

ALTER TABLE "inventory_lots"
  ADD CONSTRAINT "inventory_lots_dates_check" CHECK ("expires_at" > "manufactured_at"),
  ADD CONSTRAINT "inventory_lots_values_check" CHECK ("quantity" >= 0 AND "unit_cost" >= 0);

ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_values_check" CHECK (
    "quantity" > 0 AND "unit_price" >= 0 AND "unit_cost" >= 0 AND
    "icms_amount" >= 0 AND "pis_amount" >= 0 AND "cofins_amount" >= 0 AND
    "cbs_amount" >= 0 AND "ibs_amount" >= 0 AND "tax_amount" >= 0
  );

ALTER TABLE "tax_analyses"
  ADD CONSTRAINT "tax_analyses_confidence_check" CHECK ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1);

CREATE UNIQUE INDEX "subscriptions_one_current_per_company_uidx"
  ON "subscriptions" ("company_id")
  WHERE "status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED');
