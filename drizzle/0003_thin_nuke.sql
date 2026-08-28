ALTER TABLE `referencias_fiscais` ADD `parametros_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE `regras_fiscais`
SET `pis` = 0, `cofins` = 0
WHERE `cst_pis_cofins` = '04' AND `natureza_receita` IN ('201', '202');--> statement-breakpoint
UPDATE `regras_fiscais`
SET `cst_reforma` = substr(`cclass_trib`, 1, 3),
    `cbs` = 0.009,
    `ibs` = 0.001,
    `reducao` = CASE
      WHEN `cclass_trib` = '200013' THEN 1
      WHEN `cclass_trib` IN ('200032', '200035') THEN 0.6
      ELSE 0
    END
WHERE `cclass_trib` IN ('000001', '200013', '200032', '200035');
--> statement-breakpoint
PRAGMA optimize;
