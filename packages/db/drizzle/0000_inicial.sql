CREATE TABLE `achado_eventos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`achado_id` text NOT NULL,
	`de` text,
	`para` text NOT NULL,
	`origem` text NOT NULL,
	`motivo` text,
	`run_id` text,
	`em` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `eventos_achado` ON `achado_eventos` (`achado_id`);--> statement-breakpoint
CREATE TABLE `achados` (
	`id` text PRIMARY KEY NOT NULL,
	`repo` text NOT NULL,
	`dimensao` text NOT NULL,
	`tipo` text NOT NULL,
	`titulo` text NOT NULL,
	`evidencias_json` text NOT NULL,
	`impacto` integer NOT NULL,
	`esforco` integer NOT NULL,
	`acao` text NOT NULL,
	`status` text NOT NULL,
	`criado_run` text NOT NULL,
	`atualizado_run` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `achados_repo` ON `achados` (`repo`,`dimensao`,`status`);--> statement-breakpoint
CREATE TABLE `notas` (
	`run_id` text NOT NULL,
	`dimensao` text NOT NULL,
	`valor` integer NOT NULL,
	`justificativa` text NOT NULL,
	PRIMARY KEY(`run_id`, `dimensao`)
);
--> statement-breakpoint
CREATE TABLE `repos` (
	`nome` text PRIMARY KEY NOT NULL,
	`privado` integer NOT NULL,
	`arquivado` integer NOT NULL,
	`vazio` integer NOT NULL,
	`linguagem` text,
	`descricao` text,
	`branch_padrao` text,
	`pushed_at` text,
	`github_json` text NOT NULL,
	`sincronizado_em` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`repo` text NOT NULL,
	`head_sha` text,
	`run_dir` text NOT NULL,
	`status` text NOT NULL,
	`iniciado` text NOT NULL,
	`fim` text,
	`custo_usd` real,
	`duracao_s` real,
	`execucao_json` text,
	`resumo` text,
	`erro` text
);
--> statement-breakpoint
CREATE INDEX `runs_repo` ON `runs` (`repo`,`iniciado`);