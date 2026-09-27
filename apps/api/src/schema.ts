import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const pages = sqliteTable('pages', {
  id: text('id').primaryKey(),
  pageNumber: integer('page_number').notNull().unique(),
  width: real('width').notNull(),
  height: real('height').notNull(),
  backgroundUrl: text('background_url'),
});

export const blocks = sqliteTable('blocks', {
  id: text('id').primaryKey(),
  pageId: text('page_id').references(() => pages.id).notNull(),
  bboxX0: real('bbox_x0').notNull(),
  bboxY0: real('bbox_y0').notNull(),
  bboxX1: real('bbox_x1').notNull(),
  bboxY1: real('bbox_y1').notNull(),
  content: text('content').notNull(),
  font: text('font'),
  size: real('size'),
  isBold: integer('is_bold', { mode: 'boolean' }).default(false),
  isItalic: integer('is_italic', { mode: 'boolean' }).default(false),
});

export const images = sqliteTable('images', {
  id: text('id').primaryKey(),
  pageId: text('page_id').references(() => pages.id).notNull(),
  url: text('url').notNull(),
  bboxX0: real('bbox_x0').notNull(),
  bboxY0: real('bbox_y0').notNull(),
  bboxX1: real('bbox_x1').notNull(),
  bboxY1: real('bbox_y1').notNull(),
  role: text('role'),
  blendMode: text('blend_mode'),
});
