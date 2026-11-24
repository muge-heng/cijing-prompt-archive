import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { archiveMeta, shelves, folders, documents } from '@/db/schema';
import { initialArchive } from './archive-seed';
import { isBuiltinLabelCollision, normalizeHeading } from './archive-markdown';
import {
  docContentChanged,
  mergeArchives,
  normalizeArchivePayload,
  prependDocRevision,
  removeDocMetaForIds,
  sanitizeRevisionsMap,
  sanitizeTestCasesMap,
  upsertTestCaseList,
} from './archive-io';
import {
  isBuiltinBlockKind,
  isValidMessageRole,
  uid,
  type ArchiveData,
  type BlockPreset,
  type MessageRole,
  type PromptBlock,
  type ShelfColor,
} from './archive-types';

const PRESETS_META_KEY = 'block_presets';
const REVISIONS_META_KEY = 'doc_revisions';
const TEST_CASES_META_KEY = 'doc_test_cases';

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
function parseMetaJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function parsePresets(raw: string | undefined): BlockPreset[] {
  const parsed = parseMetaJson<unknown>(raw, []);
  return Array.isArray(parsed) ? (parsed as BlockPreset[]) : [];
}
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function upsertMetaValue(tx: DbTx, key: string, value: unknown) {
  const serialized = JSON.stringify(value);
  await tx
    .insert(archiveMeta)
    .values({ key, value: serialized })
    .onConflictDoUpdate({
      target: archiveMeta.key,
      set: { value: serialized },
    });
}
async function readMetaMap(tx: DbTx, keys: string[]) {
  const rows = await tx.select().from(archiveMeta).where(inArray(archiveMeta.key, keys));
  return new Map(rows.map((r) => [r.key, r.value]));
}
async function applyFullArchiveInTx(tx: DbTx, next: ArchiveData) {
  await tx.delete(documents);
  await tx.delete(folders);
  await tx.delete(shelves);
  if (next.shelves.length) {
    await tx.insert(shelves).values(next.shelves);
  }
  if (next.folders.length) {
    await tx.insert(folders).values(next.folders);
  }
  if (next.documents.length) {
    await tx.insert(documents).values(
      next.documents.map((d) => ({
        id: d.id,
        folderId: d.folderId,
        title: d.title,
        synopsis: d.synopsis,
        blocks: d.blocks,
        favorite: d.favorite,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        lastOpened: d.lastOpened,
      })),
    );
  }
  await upsertMetaValue(tx, PRESETS_META_KEY, next.presets || []);
  await upsertMetaValue(tx, REVISIONS_META_KEY, next.revisions || {});
  await upsertMetaValue(tx, TEST_CASES_META_KEY, next.testCases || {});
}
export async function readArchive(): Promise<ArchiveData> {
  await seedOnce();
  const [s, f, d, metaRows] = await Promise.all([
    db.select().from(shelves).orderBy(asc(shelves.position), asc(shelves.id)),
    db.select().from(folders).orderBy(asc(folders.position), asc(folders.id)),
    db.select().from(documents).orderBy(desc(documents.updatedAt)),
    db
      .select()
      .from(archiveMeta)
      .where(inArray(archiveMeta.key, [PRESETS_META_KEY, REVISIONS_META_KEY, TEST_CASES_META_KEY])),
  ]);
  const metaMap = new Map(metaRows.map((r) => [r.key, r.value]));
  const validDocIds = new Set(d.map((doc) => doc.id));
  return {
    shelves: s,
    folders: f,
    documents: d,
    presets: parsePresets(metaMap.get(PRESETS_META_KEY)),
    revisions: sanitizeRevisionsMap(parseMetaJson(metaMap.get(REVISIONS_META_KEY), {}), validDocIds),
    testCases: sanitizeTestCasesMap(parseMetaJson(metaMap.get(TEST_CASES_META_KEY), {}), validDocIds),
  };
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
function optionalRole(value: unknown): MessageRole | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!isValidMessageRole(value)) throw new InputError('消息角色仅支持 system 或 user。');
  return value;
}
function blocks(value: unknown): PromptBlock[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40)
    throw new InputError('每篇文档应包含 1 至 40 个模块。');
  const out = value.map((item) => {
    if (typeof item !== 'object' || !item) throw new InputError('模块类型无效。');
    const candidate = item as Record<string, unknown>;
    const role = optionalRole(candidate.messageRole);
    if (isBuiltinBlockKind(candidate.kind)) {
      return {
        id: text(candidate.id, '模块编号', 100),
        kind: candidate.kind,
        text: text(candidate.text, '模块内容', 30000, true),
        ...(role ? { messageRole: role } : {}),
      } as PromptBlock;
    }
    if (candidate.kind === 'custom') {
      const presetId =
        candidate.presetId !== undefined && candidate.presetId !== null && candidate.presetId !== ''
          ? text(candidate.presetId, '预设编号', 100)
          : undefined;
      const blockColor =
        candidate.color !== undefined && candidate.color !== null ? color(candidate.color) : 'ochre';
      return {
        id: text(candidate.id, '模块编号', 100),
        kind: 'custom',
        label: text(candidate.label, '自定义模块标题', 24),
        text: text(candidate.text, '模块内容', 30000, true),
        ...(presetId ? { presetId } : {}),
        color: blockColor,
        ...(role ? { messageRole: role } : {}),
      } as PromptBlock;
    }
    throw new InputError('模块类型无效。');
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
    const nowIso = new Date().toISOString();
    const data = {
      folderId,
      title: text(b.title, '文档标题', 100),
      synopsis: text(b.synopsis, '摘要', 300, true),
      blocks: blocks(b.blocks),
      updatedAt: nowIso,
    };
    if (b.id) {
      const id = text(b.id, '文档编号', 100);
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71120319)`);
        const [existing] = await tx.select().from(documents).where(eq(documents.id, id)).limit(1);
        exists(existing ? [existing] : [], '文档');
        if (docContentChanged(existing, data)) {
          const metaMap = await readMetaMap(tx, [REVISIONS_META_KEY]);
          const revisions = sanitizeRevisionsMap(parseMetaJson(metaMap.get(REVISIONS_META_KEY), {}));
          await upsertMetaValue(tx, REVISIONS_META_KEY, prependDocRevision(revisions, existing, nowIso));
        }
        await tx.update(documents).set(data).where(eq(documents.id, id));
      });
      return id;
    }
    const id = uid();
    await db.insert(documents).values({ ...data, id });
    return id;
  }
  if (b.action === 'importArchive') {
    const mode = b.mode === 'replace' ? 'replace' : 'merge';
    let incoming: ArchiveData;
    try {
      incoming = normalizeArchivePayload(b.archive);
    } catch (err) {
      throw new InputError(err instanceof Error ? err.message : '导入数据格式无效。');
    }
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(71120318)`);
      await tx.execute(sql`select pg_advisory_xact_lock(71120319)`);
      if (mode === 'replace') {
        await applyFullArchiveInTx(tx, incoming);
      } else {
        const [s, f, d, metaMap] = await Promise.all([
          tx.select().from(shelves).orderBy(asc(shelves.position), asc(shelves.id)),
          tx.select().from(folders).orderBy(asc(folders.position), asc(folders.id)),
          tx.select().from(documents).orderBy(desc(documents.updatedAt)),
          readMetaMap(tx, [PRESETS_META_KEY, REVISIONS_META_KEY, TEST_CASES_META_KEY]),
        ]);
        const validIds = new Set(d.map((doc) => doc.id));
        const current: ArchiveData = {
          shelves: s,
          folders: f,
          documents: d,
          presets: parsePresets(metaMap.get(PRESETS_META_KEY)),
          revisions: sanitizeRevisionsMap(parseMetaJson(metaMap.get(REVISIONS_META_KEY), {}), validIds),
          testCases: sanitizeTestCasesMap(parseMetaJson(metaMap.get(TEST_CASES_META_KEY), {}), validIds),
        };
        await applyFullArchiveInTx(tx, mergeArchives(current, incoming));
      }
    });
    return null;
  }
  if (b.action === 'resetArchive') {
    const fresh = initialArchive();
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(71120318)`);
      await tx.execute(sql`select pg_advisory_xact_lock(71120319)`);
      await applyFullArchiveInTx(tx, { ...fresh, revisions: {}, testCases: {} });
    });
    return null;
  }
  if (b.action === 'restoreRevision') {
    const docId = text(b.docId, '文档编号', 100);
    const revisionId = text(b.revisionId, '修订版本编号', 100);
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(71120319)`);
      const [doc] = await tx.select().from(documents).where(eq(documents.id, docId)).limit(1);
      exists(doc ? [doc] : [], '文档');
      const metaMap = await readMetaMap(tx, [REVISIONS_META_KEY]);
      const revisions = sanitizeRevisionsMap(parseMetaJson(metaMap.get(REVISIONS_META_KEY), {}));
      const rev = (revisions[docId] || []).find((r) => r.id === revisionId);
      exists(rev ? [rev] : [], '修订记录');
      const nowIso = new Date().toISOString();
      await upsertMetaValue(tx, REVISIONS_META_KEY, prependDocRevision(revisions, doc, nowIso));
      await tx
        .update(documents)
        .set({
          title: rev!.title,
          synopsis: rev!.synopsis,
          blocks: rev!.blocks,
          updatedAt: nowIso,
        })
        .where(eq(documents.id, docId));
    });
    return docId;
  }
  if (b.action === 'saveTestCase') {
    const docId = text(b.docId, '文档编号', 100);
    const name = text(b.name, '样片名称', 24);
    const caseId =
      b.id !== undefined && b.id !== null && b.id !== '' ? text(b.id, '样片编号', 100) : undefined;
    if (!b.values || typeof b.values !== 'object' || Array.isArray(b.values)) {
      throw new InputError('样片参数格式无效。');
    }
    let savedId = '';
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(71120319)`);
      const [doc] = await tx.select({ id: documents.id }).from(documents).where(eq(documents.id, docId)).limit(1);
      exists(doc ? [doc] : [], '文档');
      const metaMap = await readMetaMap(tx, [TEST_CASES_META_KEY]);
      const testCases = sanitizeTestCasesMap(parseMetaJson(metaMap.get(TEST_CASES_META_KEY), {}));
      try {
        const updated = upsertTestCaseList(testCases[docId], {
          id: caseId,
          name,
          values: b.values as Record<string, string>,
        });
        savedId = updated.id;
        await upsertMetaValue(tx, TEST_CASES_META_KEY, { ...testCases, [docId]: updated.list });
      } catch (err) {
        throw new InputError(err instanceof Error ? err.message : '保存样片失败。');
      }
    });
    return savedId;
  }
  if (b.action === 'deleteTestCase') {
    const docId = text(b.docId, '文档编号', 100);
    const caseId = text(b.id, '样片编号', 100);
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(71120319)`);
      const metaMap = await readMetaMap(tx, [TEST_CASES_META_KEY]);
      const testCases = sanitizeTestCasesMap(parseMetaJson(metaMap.get(TEST_CASES_META_KEY), {}));
      const list = testCases[docId] || [];
      exists(list.some((tc) => tc.id === caseId) ? [caseId] : [], '调试样片');
      const nextList = list.filter((tc) => tc.id !== caseId);
      const nextMap = { ...testCases };
      if (nextList.length) nextMap[docId] = nextList;
      else delete nextMap[docId];
      await upsertMetaValue(tx, TEST_CASES_META_KEY, nextMap);
    });
    return caseId;
  }
  if (b.action === 'createPreset') {
    const name = text(b.name, '板块名称', 24);
    if (isBuiltinLabelCollision(name)) throw new InputError('该名称与内置模块名称重复，请换一个名称。');
    const template = text(b.template, '默认模板内容', 30000, true);
    const tone = color(b.color);
    const messageRole = optionalRole(b.messageRole) || 'user';
    const id = uid();
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(71120318)`);
      const rows = await tx.select().from(archiveMeta).where(eq(archiveMeta.key, PRESETS_META_KEY)).limit(1);
      const presets = parsePresets(rows[0]?.value);
      if (presets.length >= 60) throw new InputError('最多可创建 60 个自定义板块预设。');
      const norm = normalizeHeading(name).toLowerCase();
      if (presets.some((p) => normalizeHeading(p.name).toLowerCase() === norm))
        throw new InputError('已存在同名板块预设。');
      const next = [
        ...presets,
        { id, name, template, color: tone, messageRole, createdAt: new Date().toISOString() },
      ];
      await tx
        .insert(archiveMeta)
        .values({ key: PRESETS_META_KEY, value: JSON.stringify(next) })
        .onConflictDoUpdate({
          target: archiveMeta.key,
          set: { value: JSON.stringify(next) },
        });
    });
    return id;
  }
  const id = text(b.id, '编号', 100);
  switch (b.action) {
    case 'updatePreset': {
      const name = text(b.name, '板块名称', 24);
      if (isBuiltinLabelCollision(name)) throw new InputError('该名称与内置模块名称重复，请换一个名称。');
      const template = text(b.template, '默认模板内容', 30000, true);
      const tone = color(b.color);
      const incomingRole = optionalRole(b.messageRole);
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71120318)`);
        const rows = await tx.select().from(archiveMeta).where(eq(archiveMeta.key, PRESETS_META_KEY)).limit(1);
        const presets = parsePresets(rows[0]?.value);
        const idx = presets.findIndex((p) => p.id === id);
        exists(idx >= 0 ? [presets[idx]] : [], '板块预设');
        const norm = normalizeHeading(name).toLowerCase();
        if (presets.some((p) => p.id !== id && normalizeHeading(p.name).toLowerCase() === norm))
          throw new InputError('已存在同名板块预设。');
        const next = presets.map((p) =>
          p.id === id
            ? { ...p, name, template, color: tone, messageRole: incomingRole ?? p.messageRole ?? 'user' }
            : p,
        );
        await tx
          .insert(archiveMeta)
          .values({ key: PRESETS_META_KEY, value: JSON.stringify(next) })
          .onConflictDoUpdate({
            target: archiveMeta.key,
            set: { value: JSON.stringify(next) },
          });
      });
      break;
    }
    case 'deletePreset':
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71120318)`);
        const rows = await tx.select().from(archiveMeta).where(eq(archiveMeta.key, PRESETS_META_KEY)).limit(1);
        const presets = parsePresets(rows[0]?.value);
        exists(presets.some((p) => p.id === id) ? [id] : [], '板块预设');
        const next = presets.filter((p) => p.id !== id);
        await tx
          .insert(archiveMeta)
          .values({ key: PRESETS_META_KEY, value: JSON.stringify(next) })
          .onConflictDoUpdate({
            target: archiveMeta.key,
            set: { value: JSON.stringify(next) },
          });
      });
      break;
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
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71120319)`);
        exists(await tx.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id }), '文档');
        const metaMap = await readMetaMap(tx, [REVISIONS_META_KEY, TEST_CASES_META_KEY]);
        const cleaned = removeDocMetaForIds(
          sanitizeRevisionsMap(parseMetaJson(metaMap.get(REVISIONS_META_KEY), {})),
          sanitizeTestCasesMap(parseMetaJson(metaMap.get(TEST_CASES_META_KEY), {})),
          [id],
        );
        await upsertMetaValue(tx, REVISIONS_META_KEY, cleaned.revisions);
        await upsertMetaValue(tx, TEST_CASES_META_KEY, cleaned.testCases);
      });
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
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71120319)`);
        const shelfFolders = await tx
          .select({ id: folders.id })
          .from(folders)
          .where(eq(folders.shelfId, id));
        const folderIds = shelfFolders.map((f) => f.id);
        const docRows = folderIds.length
          ? await tx.select({ id: documents.id }).from(documents).where(inArray(documents.folderId, folderIds))
          : [];
        exists(await tx.delete(shelves).where(eq(shelves.id, id)).returning({ id: shelves.id }), '货架');
        if (docRows.length) {
          const metaMap = await readMetaMap(tx, [REVISIONS_META_KEY, TEST_CASES_META_KEY]);
          const cleaned = removeDocMetaForIds(
            sanitizeRevisionsMap(parseMetaJson(metaMap.get(REVISIONS_META_KEY), {})),
            sanitizeTestCasesMap(parseMetaJson(metaMap.get(TEST_CASES_META_KEY), {})),
            docRows.map((d) => d.id),
          );
          await upsertMetaValue(tx, REVISIONS_META_KEY, cleaned.revisions);
          await upsertMetaValue(tx, TEST_CASES_META_KEY, cleaned.testCases);
        }
      });
      break;
    case 'deleteFolder':
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71120319)`);
        const docRows = await tx
          .select({ id: documents.id })
          .from(documents)
          .where(eq(documents.folderId, id));
        exists(await tx.delete(folders).where(eq(folders.id, id)).returning({ id: folders.id }), '文件夹');
        if (docRows.length) {
          const metaMap = await readMetaMap(tx, [REVISIONS_META_KEY, TEST_CASES_META_KEY]);
          const cleaned = removeDocMetaForIds(
            sanitizeRevisionsMap(parseMetaJson(metaMap.get(REVISIONS_META_KEY), {})),
            sanitizeTestCasesMap(parseMetaJson(metaMap.get(TEST_CASES_META_KEY), {})),
            docRows.map((d) => d.id),
          );
          await upsertMetaValue(tx, REVISIONS_META_KEY, cleaned.revisions);
          await upsertMetaValue(tx, TEST_CASES_META_KEY, cleaned.testCases);
        }
      });
      break;
    default:
      throw new InputError('不支持的仓库操作。');
  }
  return id;
}
