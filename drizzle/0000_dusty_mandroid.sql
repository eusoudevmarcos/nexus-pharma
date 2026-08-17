CREATE TABLE `auditoria` (
	`id` text PRIMARY KEY NOT NULL,
	`empresa_id` text NOT NULL,
	`usuario_id` text NOT NULL,
	`acao` text NOT NULL,
	`entidade` text NOT NULL,
	`entidade_id` text NOT NULL,
	`detalhes_json` text DEFAULT '{}' NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `auditoria_empresa_data_idx` ON `auditoria` (`empresa_id`,`criado_em`);--> statement-breakpoint
CREATE TABLE `empresa_membros` (
	`empresa_id` text NOT NULL,
	`usuario_id` text NOT NULL,
	`papel` text DEFAULT 'OPERADOR' NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`empresa_id`, `usuario_id`),
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `empresa_membros_usuario_idx` ON `empresa_membros` (`usuario_id`);--> statement-breakpoint
CREATE TABLE `empresas` (
	`id` text PRIMARY KEY NOT NULL,
	`nome_fantasia` text NOT NULL,
	`filial` text DEFAULT 'Matriz' NOT NULL,
	`cnpj` text,
	`regime_tributario` text DEFAULT 'SIMPLES_NACIONAL' NOT NULL,
	`uf` text,
	`municipio` text,
	`ativa` integer DEFAULT true NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `empresas_cnpj_unique` ON `empresas` (`cnpj`);--> statement-breakpoint
CREATE TABLE `usuarios` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`nome` text NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_email_unique` ON `usuarios` (`email`);