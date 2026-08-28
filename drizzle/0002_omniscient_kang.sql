CREATE TABLE `referencias_fiscais` (
	`catalogo` text NOT NULL,
	`codigo` text NOT NULL,
	`codigo_pai` text,
	`descricao` text NOT NULL,
	`ncm_padroes_json` text DEFAULT '[]' NOT NULL,
	`fonte_url` text NOT NULL,
	`versao_fonte` text NOT NULL,
	`vigencia_inicio` text,
	`ativo` integer DEFAULT true NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`catalogo`, `codigo`, `versao_fonte`)
);
--> statement-breakpoint
CREATE INDEX `referencias_fiscais_catalogo_ativo_idx` ON `referencias_fiscais` (`catalogo`,`ativo`);--> statement-breakpoint
ALTER TABLE `regras_fiscais` ADD `cst_pis_cofins` text DEFAULT '01' NOT NULL;--> statement-breakpoint
UPDATE `regras_fiscais`
SET `cst_pis_cofins` = CASE
	WHEN `cst_pis` = `cst_cofins` THEN `cst_pis`
	ELSE '01'
END;--> statement-breakpoint
ALTER TABLE `regras_fiscais` ADD `cclass_trib` text DEFAULT '000001' NOT NULL;--> statement-breakpoint
UPDATE `regras_fiscais`
SET `cclass_trib` = CASE
	WHEN length(`classificacao`) = 6 AND `classificacao` NOT GLOB '*[^0-9]*' THEN `classificacao`
	ELSE '000001'
END;
