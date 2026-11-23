import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { archiveMeta, shelves, folders, documents } from '@/db/schema';
import { initialArchive } from './archive-seed';
import { blockLabels, uid, type ArchiveData, type PromptBlock, type ShelfColor } from './archive-types';

let initialized: Promise<void> | undefined;
async function seedOnce() {
  if (!initialized)
    initialized = db
      .transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71120317)`);
        if ((await tx.select().from(archiveMeta).where(eq(archiveMeta.key, 'initialized')).limit(1)).length)
          return;
        const initial = initialArchive();
        await tx.insert(shelves).values(initial.shelves).onConflictDoNothing();
        await tx.insert(folders).values(initial.folders).onConflictDoNothing();
        await tx.insert(documents).values(initial.documents).onConflictDoNothing();
        await tx.insert(archiveMeta).values({ key: 'initialized', value: '1' });
      })
      .catch((e) => {
        initialized = undefined;
        throw e;
      });
  return initialized;
}
export async function readArchive(): Promise<ArchiveData> {
  await seedOnce();
  const [s, f, d] = await Promise.all([
    db.select().from(shelves).orderBy(asc(shelves.position), asc(shelves.id)),
    db.select().from(folders).orderBy(asc(folders.position), asc(folders.id)),
    db.select().from(documents).orderBy(desc(documents.updatedAt)),
  ]);
  return { shelves: s, folders: f, documents: d };
}
// Capture the collection and its reference clock together, once per server request.
export async function readWorkspaceSnapshot() {
  const initial = await readArchive();
  return { initial, initialTime: Date.now() };
}
export class InputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function text(value: unknown, label: string, max = 80, optional = false) {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > max)
    throw new InputError(`${label}不能为空，且不能超过 ${max} 个字符。`);
  return value.trim();
}
function color(value: unknown): ShelfColor {
  if (!['moss', 'walnut', 'slate', 'wine', 'ochre'].includes(String(value)))
    throw new InputError('请选择有效的货架颜色。');
  return value as ShelfColor;
}
function blocks(value: unknown): PromptBlock[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40)
    throw new InputError('每篇文档应包含 1 至 40 个模块。');
  const out = value.map((item) => {
    if (typeof item !== 'object' || !item || !Object.hasOwn(blockLabels, item.kind))
      throw new InputError('模块类型无效。');
    return {
      id: text(item.id, '模块编号', 100),
      kind: item.kind,
      text: text(item.text, '模块内容', 30000, true),
    } as PromptBlock;
  });
  if (new Set(out.map((b) => b.id)).size !== out.length) throw new InputError('模块编号不能重复。');
  if (!out.some((b) => b.text.trim())) throw new InputError('请至少填写一个模块的内容。');
  return out;
}
function exists(rows: unknown[], label: string) {
  if (!rows.length) throw new InputError(`${label}不存在或已移除。`, 404);
}
export async function mutateArchive(value: unknown): Promise<string | null> {
  await seedOnce();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('无效的请求。');
  const b = value as Record<string, unknown>;
  if (b.action === 'createShelf') {
    const id = uid(),
      name = text(b.name, '货架名称', 16),
      tone = color(b.color);
    await db.transaction(async (tx) => {
      await tx
        .insert(shelves)
        .values({
          id,
          name,
          english: text(b.english, '英文索引名', 40, true).toUpperCase() || 'PERSONAL COLLECTION',
          color: tone,
          position: Math.floor(Date.now() / 1000),
        });
      await tx
        .insert(folders)
        .values({ id: uid(), shelfId: id, name: '收件夹', description: '尚待整理的新灵感', position: 0 });
    });
    return id;
  }
  if (b.action === 'createFolder') {
    const id = uid(),
      shelfId = text(b.shelfId, '所属货架', 100);
    exists(await db.select({ id: shelves.id }).from(shelves).where(eq(shelves.id, shelfId)).limit(1), '货架');
    await db
      .insert(folders)
      .values({
        id,
        shelfId,
        name: text(b.name, '文件夹名称', 30),
        description: text(b.description, '文件夹说明', 160, true),
        position: Math.floor(Date.now() / 1000),
      });
    return id;
  }
  if (b.action === 'saveDoc') {
    const folderId = text(b.folderId, '所属文件夹', 100);
    exists(
      await db.select({ id: folders.id }).from(folders).where(eq(folders.id, folderId)).limit(1),
      '文件夹',
    );
    const data = {
      folderId,
      title: text(b.title, '文档标题', 100),
      synopsis: text(b.synopsis, '摘要', 300, true),
      blocks: blocks(b.blocks),
      updatedAt: new Date().toISOString(),
    };
    if (b.id) {
      const id = text(b.id, '文档编号', 100);
      exists(
        await db.update(documents).set(data).where(eq(documents.id, id)).returning({ id: documents.id }),
        '文档',
      );
      return id;
    }
    const id = uid();
    await db.insert(documents).values({ ...data, id });
    return id;
  }
  const id = text(b.id, '编号', 100);
  switch (b.action) {
    case 'favorite':
      if (typeof b.favorite !== 'boolean') throw new InputError('收藏状态无效。');
      exists(
        await db
          .update(documents)
          .set({ favorite: b.favorite })
          .where(eq(documents.id, id))
          .returning({ id: documents.id }),
        '文档',
      );
      break;
    case 'open':
      exists(
        await db
          .update(documents)
          .set({ lastOpened: new Date().toISOString() })
          .where(eq(documents.id, id))
          .returning({ id: documents.id }),
        '文档',
      );
      break;
    case 'duplicate': {
      const [doc] = await db.select().from(documents).where(eq(documents.id, id));
      exists(doc ? [doc] : [], '文档');
      const newId = uid();
      await db
        .insert(documents)
        .values({
          id: newId,
          folderId: doc.folderId,
          title: `${doc.title.slice(0, 94)} · 副本`,
          synopsis: doc.synopsis,
          blocks: doc.blocks,
        });
      return newId;
    }
    case 'deleteDoc':
      exists(await db.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id }), '文档');
      break;
    case 'updateShelf':
      exists(
        await db
          .update(shelves)
          .set({
            name: text(b.name, '货架名称', 16),
            english: text(b.english, '英文索引名', 40, true).toUpperCase() || 'PERSONAL COLLECTION',
            color: color(b.color),
          })
          .where(eq(shelves.id, id))
          .returning({ id: shelves.id }),
        '货架',
      );
      break;
    case 'updateFolder':
      exists(
        await db
          .update(folders)
          .set({
            name: text(b.name, '文件夹名称', 30),
            description: text(b.description, '文件夹说明', 160, true),
          })
          .where(eq(folders.id, id))
          .returning({ id: folders.id }),
        '文件夹',
      );
      break;
    case 'deleteShelf':
      exists(await db.delete(shelves).where(eq(shelves.id, id)).returning({ id: shelves.id }), '货架');
      break;
    case 'deleteFolder':
      exists(await db.delete(folders).where(eq(folders.id, id)).returning({ id: folders.id }), '文件夹');
      break;
    default:
      throw new InputError('不支持的仓库操作。');
  }
  return id;
}
