import { pgTable, text, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import type { PromptBlock, ShelfColor } from '@/lib/archive-types';

export const archiveMeta = pgTable('archive_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const shelves = pgTable('archive_shelves', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  english: text('english').notNull().default('PERSONAL COLLECTION'),
  color: text('color').$type<ShelfColor>().notNull().default('moss'),
  position: integer('position').notNull().default(0),
});
export const folders = pgTable(
  'archive_folders',
  {
    id: text('id').primaryKey(),
    shelfId: text('shelf_id')
      .notNull()
      .references(() => shelves.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    position: integer('position').notNull().default(0),
  },
  (table) => [index('archive_folders_shelf_idx').on(table.shelfId)],
);
export const documents = pgTable(
  'archive_documents',
  {
    id: text('id').primaryKey(),
    folderId: text('folder_id')
      .notNull()
      .references(() => folders.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    synopsis: text('synopsis').notNull().default(''),
    blocks: jsonb('blocks').$type<PromptBlock[]>().notNull(),
    favorite: boolean('favorite').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    lastOpened: timestamp('last_opened', { withTimezone: true, mode: 'string' }),
  },
  (table) => [index('archive_documents_folder_idx').on(table.folderId)],
);
