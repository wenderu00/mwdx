CREATE TABLE `recomendacoes` (
	`run_id` text NOT NULL,
	`tipo` text NOT NULL,
	`repo` text NOT NULL,
	`motivo` text NOT NULL,
	PRIMARY KEY(`run_id`, `tipo`, `repo`)
);
--> statement-breakpoint
ALTER TABLE `achados` ADD `repos_json` text;