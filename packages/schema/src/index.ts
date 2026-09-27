import { z } from 'zod';

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number().optional(),
  zIndex: z.number(),
});
export type Position = z.infer<typeof PositionSchema>;

export const TextStyleSchema = z.object({
  fontFamily: z.string(),
  fontSize: z.number(),
  fontWeight: z.union([z.number(), z.string()]).optional(),
  color: z.string(),
  lineHeight: z.number().optional(),
  letterSpacing: z.number().optional(),
  textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

export const TextContentSchema = z.object({
  kind: z.literal('text'),
  markdown: z.string(),
  style: TextStyleSchema,
});
export type TextContent = z.infer<typeof TextContentSchema>;

export const ImageContentSchema = z.object({
  kind: z.literal('image'),
  assetId: z.string(),
  alt: z.string(),
  fit: z.enum(['cover', 'contain']),
});
export type ImageContent = z.infer<typeof ImageContentSchema>;

export const VectorContentSchema = z.object({
  kind: z.literal('vector'),
  assetId: z.string(),
  tint: z.string().optional(),
});
export type VectorContent = z.infer<typeof VectorContentSchema>;

export const TextureContentSchema = z.object({
  kind: z.literal('texture'),
  assetId: z.string(),
  repeat: z.boolean().optional(),
  opacity: z.number().optional(),
});
export type TextureContent = z.infer<typeof TextureContentSchema>;

export const GroupContentSchema = z.object({
  kind: z.literal('group'),
  blockIds: z.array(z.string()),
});
export type GroupContent = z.infer<typeof GroupContentSchema>;

export const BlockContentSchema = z.discriminatedUnion('kind', [
  TextContentSchema,
  ImageContentSchema,
  VectorContentSchema,
  TextureContentSchema,
  GroupContentSchema,
]);

export const BlockTypeSchema = z.enum(['text', 'image', 'vector', 'texture', 'group']);
export type BlockType = z.infer<typeof BlockTypeSchema>;

export const BlockSchema = z.object({
  id: z.string(),
  type: BlockTypeSchema,
  position: PositionSchema,
  readingOrder: z.number(),
  content: BlockContentSchema,
});
export type Block = z.infer<typeof BlockSchema>;

export const PageSchema = z.object({
  id: z.string(),
  number: z.number(),
  chapterId: z.string(),
  backgroundAssetId: z.string().optional(),
  blocks: z.array(BlockSchema),
  version: z.number(),
});
export type Page = z.infer<typeof PageSchema>;

export const ChapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number(),
  pageIds: z.array(z.string()),
});
export type Chapter = z.infer<typeof ChapterSchema>;

export const BookSchema = z.object({
  id: z.string(),
  title: z.string(),
  version: z.string(),
  chapters: z.array(ChapterSchema),
});
export type Book = z.infer<typeof BookSchema>;

// --- Errata ---
export const ErrataEntrySchema = z.object({
  id: z.string(),
  bookVersion: z.string(),
  pageId: z.string(),
  blockId: z.string().optional(),
  changeType: z.enum(['text', 'position', 'asset', 'new_block', 'removed_block']),
  before: z.unknown().optional(),
  after: z.unknown(),
  publishedAt: z.string(),
  changelogNote: z.string(),
});
export type ErrataEntry = z.infer<typeof ErrataEntrySchema>;

// --- Translations ---
export const TranslationSchema = z.object({
  blockId: z.string(),
  locale: z.string(),
  markdown: z.string(),
});
export type Translation = z.infer<typeof TranslationSchema>;
