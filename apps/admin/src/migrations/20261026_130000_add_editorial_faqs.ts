import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-sqlite'

const upStatements = [
  "ALTER TABLE `payload_locked_documents_rels` ADD COLUMN `editorial_faqs_id` integer",
  "CREATE TABLE `editorial_faqs` (\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`faq_id` text,\n\t`language` text DEFAULT 'pt-BR',\n\t`question` text,\n\t`answer` text,\n\t`english_question` text,\n\t`english_answer` text,\n\t`category` text,\n\t`source_version` text DEFAULT 'Middara Rulebook 1.2 / 2023',\n\t`primary_source_page` numeric,\n\t`source_page_search` text,\n\t`rule_scope` text DEFAULT 'base',\n\t`spoiler_level` text DEFAULT 'none',\n\t`review_status` text DEFAULT 'pending',\n\t`reviewed_at` text,\n\t`reviewed_by` text,\n\t`source_entry_hash` text,\n\t`imported_content_hash` text,\n\t`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,\n\t`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,\n\t`_status` text DEFAULT 'draft'\n)",
  "CREATE TABLE `editorial_faqs_source_pages` (\n\t`_order` integer NOT NULL,\n\t`_parent_id` integer NOT NULL,\n\t`id` text PRIMARY KEY NOT NULL,\n\t`page` numeric,\n\tFOREIGN KEY (`_parent_id`) REFERENCES `editorial_faqs`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE `editorial_faqs_source_unit_ids` (\n\t`_order` integer NOT NULL,\n\t`_parent_id` integer NOT NULL,\n\t`id` text PRIMARY KEY NOT NULL,\n\tFOREIGN KEY (`_parent_id`) REFERENCES `editorial_faqs`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE `editorial_faqs_keywords` (\n\t`_order` integer NOT NULL,\n\t`_parent_id` integer NOT NULL,\n\t`id` text PRIMARY KEY NOT NULL,\n\t`value` text,\n\tFOREIGN KEY (`_parent_id`) REFERENCES `editorial_faqs`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE `editorial_faqs_synonyms` (\n\t`_order` integer NOT NULL,\n\t`_parent_id` integer NOT NULL,\n\t`id` text PRIMARY KEY NOT NULL,\n\t`value` text,\n\tFOREIGN KEY (`_parent_id`) REFERENCES `editorial_faqs`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE `_editorial_faqs_v` (\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`parent_id` integer,\n\t`version_faq_id` text,\n\t`version_language` text DEFAULT 'pt-BR',\n\t`version_question` text,\n\t`version_answer` text,\n\t`version_english_question` text,\n\t`version_english_answer` text,\n\t`version_category` text,\n\t`version_source_version` text DEFAULT 'Middara Rulebook 1.2 / 2023',\n\t`version_primary_source_page` numeric,\n\t`version_source_page_search` text,\n\t`version_rule_scope` text DEFAULT 'base',\n\t`version_spoiler_level` text DEFAULT 'none',\n\t`version_review_status` text DEFAULT 'pending',\n\t`version_reviewed_at` text,\n\t`version_reviewed_by` text,\n\t`version_source_entry_hash` text,\n\t`version_imported_content_hash` text,\n\t`version_updated_at` text,\n\t`version_created_at` text,\n\t`version__status` text DEFAULT 'draft',\n\t`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,\n\t`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,\n\t`latest` integer,\n\tFOREIGN KEY (`parent_id`) REFERENCES `editorial_faqs`(`id`) ON UPDATE no action ON DELETE set null\n)",
  "CREATE TABLE `_editorial_faqs_v_version_source_pages` (\n\t`_order` integer NOT NULL,\n\t`_parent_id` integer NOT NULL,\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`page` numeric,\n\t`_uuid` text,\n\tFOREIGN KEY (`_parent_id`) REFERENCES `_editorial_faqs_v`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE `_editorial_faqs_v_version_source_unit_ids` (\n\t`_order` integer NOT NULL,\n\t`_parent_id` integer NOT NULL,\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`_uuid` text,\n\tFOREIGN KEY (`_parent_id`) REFERENCES `_editorial_faqs_v`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE `_editorial_faqs_v_version_keywords` (\n\t`_order` integer NOT NULL,\n\t`_parent_id` integer NOT NULL,\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`value` text,\n\t`_uuid` text,\n\tFOREIGN KEY (`_parent_id`) REFERENCES `_editorial_faqs_v`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE `_editorial_faqs_v_version_synonyms` (\n\t`_order` integer NOT NULL,\n\t`_parent_id` integer NOT NULL,\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`value` text,\n\t`_uuid` text,\n\tFOREIGN KEY (`_parent_id`) REFERENCES `_editorial_faqs_v`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE INDEX `_editorial_faqs_v_created_at_idx` ON `_editorial_faqs_v` (`created_at`)",
  "CREATE INDEX `_editorial_faqs_v_latest_idx` ON `_editorial_faqs_v` (`latest`)",
  "CREATE INDEX `_editorial_faqs_v_parent_idx` ON `_editorial_faqs_v` (`parent_id`)",
  "CREATE INDEX `_editorial_faqs_v_updated_at_idx` ON `_editorial_faqs_v` (`updated_at`)",
  "CREATE INDEX `_editorial_faqs_v_version_keywords_order_idx` ON `_editorial_faqs_v_version_keywords` (`_order`)",
  "CREATE INDEX `_editorial_faqs_v_version_keywords_parent_id_idx` ON `_editorial_faqs_v_version_keywords` (`_parent_id`)",
  "CREATE INDEX `_editorial_faqs_v_version_source_pages_order_idx` ON `_editorial_faqs_v_version_source_pages` (`_order`)",
  "CREATE INDEX `_editorial_faqs_v_version_source_pages_parent_id_idx` ON `_editorial_faqs_v_version_source_pages` (`_parent_id`)",
  "CREATE INDEX `_editorial_faqs_v_version_source_unit_ids_order_idx` ON `_editorial_faqs_v_version_source_unit_ids` (`_order`)",
  "CREATE INDEX `_editorial_faqs_v_version_source_unit_ids_parent_id_idx` ON `_editorial_faqs_v_version_source_unit_ids` (`_parent_id`)",
  "CREATE INDEX `_editorial_faqs_v_version_synonyms_order_idx` ON `_editorial_faqs_v_version_synonyms` (`_order`)",
  "CREATE INDEX `_editorial_faqs_v_version_synonyms_parent_id_idx` ON `_editorial_faqs_v_version_synonyms` (`_parent_id`)",
  "CREATE INDEX `_editorial_faqs_v_version_version__status_idx` ON `_editorial_faqs_v` (`version__status`)",
  "CREATE INDEX `_editorial_faqs_v_version_version_category_idx` ON `_editorial_faqs_v` (`version_category`)",
  "CREATE INDEX `_editorial_faqs_v_version_version_created_at_idx` ON `_editorial_faqs_v` (`version_created_at`)",
  "CREATE INDEX `_editorial_faqs_v_version_version_faq_id_idx` ON `_editorial_faqs_v` (`version_faq_id`)",
  "CREATE INDEX `_editorial_faqs_v_version_version_primary_source_page_idx` ON `_editorial_faqs_v` (`version_primary_source_page`)",
  "CREATE INDEX `_editorial_faqs_v_version_version_review_status_idx` ON `_editorial_faqs_v` (`version_review_status`)",
  "CREATE INDEX `_editorial_faqs_v_version_version_rule_scope_idx` ON `_editorial_faqs_v` (`version_rule_scope`)",
  "CREATE INDEX `_editorial_faqs_v_version_version_source_page_search_idx` ON `_editorial_faqs_v` (`version_source_page_search`)",
  "CREATE INDEX `_editorial_faqs_v_version_version_spoiler_level_idx` ON `_editorial_faqs_v` (`version_spoiler_level`)",
  "CREATE INDEX `_editorial_faqs_v_version_version_updated_at_idx` ON `_editorial_faqs_v` (`version_updated_at`)",
  "CREATE INDEX `editorial_faqs__status_idx` ON `editorial_faqs` (`_status`)",
  "CREATE INDEX `editorial_faqs_category_idx` ON `editorial_faqs` (`category`)",
  "CREATE INDEX `editorial_faqs_created_at_idx` ON `editorial_faqs` (`created_at`)",
  "CREATE UNIQUE INDEX `editorial_faqs_faq_id_idx` ON `editorial_faqs` (`faq_id`)",
  "CREATE INDEX `editorial_faqs_keywords_order_idx` ON `editorial_faqs_keywords` (`_order`)",
  "CREATE INDEX `editorial_faqs_keywords_parent_id_idx` ON `editorial_faqs_keywords` (`_parent_id`)",
  "CREATE INDEX `editorial_faqs_primary_source_page_idx` ON `editorial_faqs` (`primary_source_page`)",
  "CREATE INDEX `editorial_faqs_review_status_idx` ON `editorial_faqs` (`review_status`)",
  "CREATE INDEX `editorial_faqs_rule_scope_idx` ON `editorial_faqs` (`rule_scope`)",
  "CREATE INDEX `editorial_faqs_source_page_search_idx` ON `editorial_faqs` (`source_page_search`)",
  "CREATE INDEX `editorial_faqs_source_pages_order_idx` ON `editorial_faqs_source_pages` (`_order`)",
  "CREATE INDEX `editorial_faqs_source_pages_parent_id_idx` ON `editorial_faqs_source_pages` (`_parent_id`)",
  "CREATE INDEX `editorial_faqs_source_unit_ids_order_idx` ON `editorial_faqs_source_unit_ids` (`_order`)",
  "CREATE INDEX `editorial_faqs_source_unit_ids_parent_id_idx` ON `editorial_faqs_source_unit_ids` (`_parent_id`)",
  "CREATE INDEX `editorial_faqs_spoiler_level_idx` ON `editorial_faqs` (`spoiler_level`)",
  "CREATE INDEX `editorial_faqs_synonyms_order_idx` ON `editorial_faqs_synonyms` (`_order`)",
  "CREATE INDEX `editorial_faqs_synonyms_parent_id_idx` ON `editorial_faqs_synonyms` (`_parent_id`)",
  "CREATE INDEX `editorial_faqs_updated_at_idx` ON `editorial_faqs` (`updated_at`)",
  "CREATE INDEX `payload_locked_documents_rels_editorial_faqs_id_idx` ON `payload_locked_documents_rels` (`editorial_faqs_id`)"
]

const downStatements = [
  "DROP INDEX IF EXISTS `payload_locked_documents_rels_editorial_faqs_id_idx`",
  "ALTER TABLE `payload_locked_documents_rels` DROP COLUMN `editorial_faqs_id`",
  "DROP TABLE `_editorial_faqs_v_version_synonyms`",
  "DROP TABLE `_editorial_faqs_v_version_keywords`",
  "DROP TABLE `_editorial_faqs_v_version_source_unit_ids`",
  "DROP TABLE `_editorial_faqs_v_version_source_pages`",
  "DROP TABLE `_editorial_faqs_v`",
  "DROP TABLE `editorial_faqs_synonyms`",
  "DROP TABLE `editorial_faqs_keywords`",
  "DROP TABLE `editorial_faqs_source_unit_ids`",
  "DROP TABLE `editorial_faqs_source_pages`",
  "DROP TABLE `editorial_faqs`"
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const statement of upStatements) await db.run(sql.raw(statement))
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const statement of downStatements) await db.run(sql.raw(statement))
}
