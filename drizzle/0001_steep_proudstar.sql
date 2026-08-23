CREATE TABLE `categorias` (
	`empresa_id` text NOT NULL,
	`id` text NOT NULL,
	`nome` text NOT NULL,
	`codigo` text NOT NULL,
	`ncm` text NOT NULL,
	`cest` text DEFAULT '' NOT NULL,
	`classe` text NOT NULL,
	`descricao` text DEFAULT '' NOT NULL,
	`versao` text NOT NULL,
	`vigencia` text NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`empresa_id`, `id`),
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categorias_empresa_codigo_uidx` ON `categorias` (`empresa_id`,`codigo`);--> statement-breakpoint
CREATE INDEX `categorias_empresa_nome_idx` ON `categorias` (`empresa_id`,`nome`);--> statement-breakpoint
CREATE TABLE `produtos` (
	`empresa_id` text NOT NULL,
	`ean` text NOT NULL,
	`nome` text NOT NULL,
	`laboratorio` text DEFAULT '' NOT NULL,
	`principio_ativo` text DEFAULT '' NOT NULL,
	`categoria_id` text NOT NULL,
	`lote` text DEFAULT '' NOT NULL,
	`quantidade_entrada` integer DEFAULT 0 NOT NULL,
	`custo_centavos` integer DEFAULT 0 NOT NULL,
	`estoque` integer DEFAULT 0 NOT NULL,
	`minimo` integer DEFAULT 0 NOT NULL,
	`fabricacao` text NOT NULL,
	`vencimento` text NOT NULL,
	`preco_centavos` integer DEFAULT 0 NOT NULL,
	`vendas_30d` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`empresa_id`, `ean`),
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `produtos_empresa_nome_idx` ON `produtos` (`empresa_id`,`nome`);--> statement-breakpoint
CREATE INDEX `produtos_empresa_categoria_idx` ON `produtos` (`empresa_id`,`categoria_id`);--> statement-breakpoint
CREATE TABLE `regras_fiscais` (
	`empresa_id` text NOT NULL,
	`categoria_id` text NOT NULL,
	`regime` text NOT NULL,
	`cfop` text NOT NULL,
	`cst_icms` text NOT NULL,
	`csosn` text NOT NULL,
	`icms` real DEFAULT 0 NOT NULL,
	`mva` real DEFAULT 0 NOT NULL,
	`cst_pis` text NOT NULL,
	`cst_cofins` text NOT NULL,
	`natureza_receita` text DEFAULT '' NOT NULL,
	`pis` real DEFAULT 0 NOT NULL,
	`cofins` real DEFAULT 0 NOT NULL,
	`cst_reforma` text NOT NULL,
	`classificacao` text NOT NULL,
	`cbs` real DEFAULT 0 NOT NULL,
	`ibs` real DEFAULT 0 NOT NULL,
	`reducao` real DEFAULT 0 NOT NULL,
	`compensar_cbs` integer DEFAULT false NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`empresa_id`, `categoria_id`, `regime`),
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `regras_fiscais_empresa_categoria_idx` ON `regras_fiscais` (`empresa_id`,`categoria_id`);
--> statement-breakpoint
PRAGMA optimize;
