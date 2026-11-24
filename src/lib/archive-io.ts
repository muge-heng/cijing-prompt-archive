import { blocksToMarkdown, normalizeHeading } from './archive-markdown';
import {
  isBuiltinBlockKind,
  isValidMessageRole,
  uid,
  type ArchiveData,
  type BlockPreset,
  type DebugTestCase,
  type DocRevision,
  type Folder,
  type MessageRole,
  type PromptBlock,
  type PromptDoc,
  type Shelf,
  type ShelfColor,
} from './archive-types';

const VALID_COLORS = new Set<ShelfColor>(['moss', 'walnut', 'slate', 'wine', 'ochre']);
export const MAX_REVISIONS_PER_DOC = 10;
export const MAX_TEST_CASES_PER_DOC = 8;

function cleanColor(value: unknown, fallback: ShelfColor = 'moss'): ShelfColor {
  return typeof value === 'string' && VALID_COLORS.has(value as ShelfColor)
    ? (value as ShelfColor)
    : fallback;
}

function cleanStr(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function sanitizeBlocksList(rawBlocks: unknown): PromptBlock[] {
  if (!Array.isArray(rawBlocks)) return [];
  const seenIds = new Set<string>();
  const out: PromptBlock[] = [];
  for (const raw of rawBlocks) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    if (out.length >= 40) break;
    const cand = raw as Record<string, unknown>;
    let id = cleanStr(cand.id, 100) || uid();
    while (seenIds.has(id)) id = uid();
    seenIds.add(id);

    const body = typeof cand.text === 'string' ? cand.text.slice(0, 30000) : '';
    const messageRole: MessageRole | undefined = isValidMessageRole(cand.messageRole)
      ? cand.messageRole
      : undefined;
    if (isBuiltinBlockKind(cand.kind)) {
      out.push({
        id,
        kind: cand.kind,
        text: body,
        ...(messageRole ? { messageRole } : {}),
      });
    } else if (cand.kind === 'custom') {
      const presetId = cleanStr(cand.presetId, 100);
      out.push({
        id,
        kind: 'custom',
        label: cleanStr(cand.label, 24) || '自定义模块',
        text: body,
        ...(presetId ? { presetId } : {}),
        color: cleanColor(cand.color, 'ochre'),
        ...(messageRole ? { messageRole } : {}),
      });
    }
  }
  return out;
}

export function sanitizeRevisionsMap(
  raw: unknown,
  validDocIds?: Set<string>,
): Record<string, DocRevision[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: Record<string, DocRevision[]> = {};
  for (const [docId, list] of Object.entries(obj)) {
    if (validDocIds && !validDocIds.has(docId)) continue;
    if (!Array.isArray(list)) continue;
    const cleaned: DocRevision[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      if (cleaned.length >= MAX_REVISIONS_PER_DOC) break;
      const cand = item as Record<string, unknown>;
      const blocks = sanitizeBlocksList(cand.blocks);
      const title = cleanStr(cand.title, 100);
      if (!blocks.length || !title) continue;
      cleaned.push({
        id: cleanStr(cand.id, 100) || uid(),
        savedAt: cleanStr(cand.savedAt, 40) || new Date().toISOString(),
        title,
        synopsis: cleanStr(cand.synopsis, 300),
        blocks,
      });
    }
    if (cleaned.length) out[docId] = cleaned;
  }
  return out;
}

export function sanitizeTestCasesMap(
  raw: unknown,
  validDocIds?: Set<string>,
): Record<string, DebugTestCase[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: Record<string, DebugTestCase[]> = {};
  for (const [docId, list] of Object.entries(obj)) {
    if (validDocIds && !validDocIds.has(docId)) continue;
    if (!Array.isArray(list)) continue;
    const cleaned: DebugTestCase[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      if (cleaned.length >= MAX_TEST_CASES_PER_DOC) break;
      const cand = item as Record<string, unknown>;
      const name = cleanStr(cand.name, 24);
      if (!name) continue;
      const values: Record<string, string> = {};
      if (cand.values && typeof cand.values === 'object' && !Array.isArray(cand.values)) {
        for (const [k, v] of Object.entries(cand.values as Record<string, unknown>)) {
          if (typeof v === 'string' && k.trim()) {
            values[k.trim().slice(0, 80)] = v.slice(0, 10000);
          }
        }
      }
      cleaned.push({
        id: cleanStr(cand.id, 100) || uid(),
        name,
        values,
        createdAt: cleanStr(cand.createdAt, 40) || new Date().toISOString(),
      });
    }
    if (cleaned.length) out[docId] = cleaned;
  }
  return out;
}

export function docContentChanged(
  prev: Pick<PromptDoc, 'title' | 'synopsis' | 'blocks'>,
  next: Pick<PromptDoc, 'title' | 'synopsis' | 'blocks'>,
): boolean {
  if (prev.title !== next.title || prev.synopsis !== next.synopsis) return true;
  return JSON.stringify(prev.blocks) !== JSON.stringify(next.blocks);
}

export function prependDocRevision(
  revisions: Record<string, DocRevision[]> | undefined,
  doc: PromptDoc,
  savedAt = new Date().toISOString(),
): Record<string, DocRevision[]> {
  const next: Record<string, DocRevision[]> = { ...(revisions || {}) };
  const snapshot: DocRevision = {
    id: uid(),
    savedAt,
    title: doc.title,
    synopsis: doc.synopsis,
    blocks: doc.blocks.map((b) => ({ ...b })),
  };
  const existing = next[doc.id] || [];
  next[doc.id] = [snapshot, ...existing].slice(0, MAX_REVISIONS_PER_DOC);
  return next;
}

export function removeDocMetaForIds(
  revisions: Record<string, DocRevision[]> | undefined,
  testCases: Record<string, DebugTestCase[]> | undefined,
  removedDocIds: Iterable<string>,
): { revisions: Record<string, DocRevision[]>; testCases: Record<string, DebugTestCase[]> } {
  const nextRevisions = { ...(revisions || {}) };
  const nextTestCases = { ...(testCases || {}) };
  for (const id of removedDocIds) {
    delete nextRevisions[id];
    delete nextTestCases[id];
  }
  return { revisions: nextRevisions, testCases: nextTestCases };
}

export function upsertTestCaseList(
  existingList: DebugTestCase[] | undefined,
  input: { id?: string; name: string; values: Record<string, string> },
): { id: string; list: DebugTestCase[] } {
  const list = [...(existingList || [])].map((item) => ({ ...item, values: { ...item.values } }));
  const cleanValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.values || {})) {
    const cleanKey = k.trim().slice(0, 80);
    if (cleanKey && typeof v === 'string') {
      cleanValues[cleanKey] = v.slice(0, 10000);
    }
  }
  if (input.id) {
    const target = list.find((tc) => tc.id === input.id);
    if (target) {
      target.name = input.name;
      target.values = cleanValues;
      return { id: target.id, list };
    }
  }
  if (list.length >= MAX_TEST_CASES_PER_DOC) {
    throw new Error(`每篇文档最多保存 ${MAX_TEST_CASES_PER_DOC} 组调试样片。`);
  }
  const newId = uid();
  list.unshift({
    id: newId,
    name: input.name,
    values: cleanValues,
    createdAt: new Date().toISOString(),
  });
  return { id: newId, list };
}

export function normalizeArchivePayload(value: unknown): ArchiveData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('馆藏数据结构无效，应为 JSON 对象。');
  }
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.shelves) || !Array.isArray(obj.folders) || !Array.isArray(obj.documents)) {
    throw new Error('缺少必要的 shelves、folders 或 documents 数据字段。');
  }

  const shelfIds = new Set<string>();
  const shelves: Shelf[] = [];
  obj.shelves.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const cand = raw as Record<string, unknown>;
    const name = cleanStr(cand.name, 16);
    if (!name) return;
    let id = cleanStr(cand.id, 100) || uid();
    while (shelfIds.has(id)) id = uid();
    shelfIds.add(id);
    shelves.push({
      id,
      name,
      english: cleanStr(cand.english, 40).toUpperCase() || 'PERSONAL COLLECTION',
      color: cleanColor(cand.color, 'moss'),
      position: typeof cand.position === 'number' && Number.isFinite(cand.position) ? cand.position : i,
    });
  });

  if (!shelves.length) {
    throw new Error('备份文件中没有有效的货架数据。');
  }

  const folderIds = new Set<string>();
  const folders: Folder[] = [];
  obj.folders.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const cand = raw as Record<string, unknown>;
    const shelfId = cleanStr(cand.shelfId, 100);
    const name = cleanStr(cand.name, 30);
    if (!name || !shelfIds.has(shelfId)) return;
    let id = cleanStr(cand.id, 100) || uid();
    while (folderIds.has(id)) id = uid();
    folderIds.add(id);
    folders.push({
      id,
      shelfId,
      name,
      description: cleanStr(cand.description, 160),
      position: typeof cand.position === 'number' && Number.isFinite(cand.position) ? cand.position : i,
    });
  });

  const presetIds = new Set<string>();
  const presetNames = new Set<string>();
  const presets: BlockPreset[] = [];
  if (Array.isArray(obj.presets)) {
    for (const raw of obj.presets) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      if (presets.length >= 60) break;
      const cand = raw as Record<string, unknown>;
      const name = cleanStr(cand.name, 24);
      if (!name) continue;
      const norm = normalizeHeading(name).toLowerCase();
      if (presetNames.has(norm)) continue;
      presetNames.add(norm);
      let id = cleanStr(cand.id, 100) || uid();
      while (presetIds.has(id)) id = uid();
      presetIds.add(id);
      presets.push({
        id,
        name,
        template: typeof cand.template === 'string' ? cand.template.trim().slice(0, 30000) : '',
        color: cleanColor(cand.color, 'ochre'),
        messageRole: isValidMessageRole(cand.messageRole) ? cand.messageRole : 'user',
        createdAt: cleanStr(cand.createdAt, 40) || new Date().toISOString(),
      });
    }
  }

  const docIds = new Set<string>();
  const documents: PromptDoc[] = [];
  const nowIso = new Date().toISOString();
  for (const raw of obj.documents) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const cand = raw as Record<string, unknown>;
    const folderId = cleanStr(cand.folderId, 100);
    const title = cleanStr(cand.title, 100);
    const blocks = sanitizeBlocksList(cand.blocks).map((b) =>
      b.kind === 'custom' && b.presetId && !presetIds.has(b.presetId)
        ? { ...b, presetId: undefined }
        : b,
    );
    if (!title || !folderIds.has(folderId) || !blocks.length || !blocks.some((b) => b.text.trim())) {
      continue;
    }
    let id = cleanStr(cand.id, 100) || uid();
    while (docIds.has(id)) id = uid();
    docIds.add(id);
    documents.push({
      id,
      folderId,
      title,
      synopsis: cleanStr(cand.synopsis, 300),
      blocks,
      favorite: cand.favorite === true,
      updatedAt: cleanStr(cand.updatedAt, 40) || nowIso,
      createdAt: cleanStr(cand.createdAt, 40) || nowIso,
      lastOpened: typeof cand.lastOpened === 'string' && cand.lastOpened.trim() ? cand.lastOpened : null,
    });
  }

  const revisions = sanitizeRevisionsMap(obj.revisions, docIds);
  const testCases = sanitizeTestCasesMap(obj.testCases, docIds);

  return { shelves, folders, documents, presets, revisions, testCases };
}

export function mergeArchives(current: ArchiveData, incoming: ArchiveData): ArchiveData {
  const nextPresets: BlockPreset[] = (current.presets || []).map((p) => ({ ...p }));
  const presetIds = new Set(nextPresets.map((p) => p.id));
  const presetNameToId = new Map(
    nextPresets.map((p) => [normalizeHeading(p.name).toLowerCase(), p.id]),
  );
  const presetIdMap = new Map<string, string>();

  for (const p of incoming.presets || []) {
    const norm = normalizeHeading(p.name).toLowerCase();
    const existingByName = presetNameToId.get(norm);
    if (existingByName) {
      presetIdMap.set(p.id, existingByName);
      continue;
    }
    if (nextPresets.length >= 60) continue;
    const resolvedId = presetIds.has(p.id) ? uid() : p.id;
    presetIds.add(resolvedId);
    presetNameToId.set(norm, resolvedId);
    presetIdMap.set(p.id, resolvedId);
    nextPresets.push({ ...p, id: resolvedId });
  }

  const nextShelves: Shelf[] = current.shelves.map((s) => ({ ...s }));
  const shelfIds = new Set(nextShelves.map((s) => s.id));
  const shelfIdMap = new Map<string, string>();
  let nextPos = nextShelves.reduce((max, s) => Math.max(max, s.position), 0) + 1;

  for (const s of incoming.shelves) {
    let resolvedId = s.id;
    while (shelfIds.has(resolvedId)) resolvedId = uid();
    shelfIds.add(resolvedId);
    shelfIdMap.set(s.id, resolvedId);
    nextShelves.push({ ...s, id: resolvedId, position: nextPos++ });
  }

  const nextFolders: Folder[] = current.folders.map((f) => ({ ...f }));
  const folderIds = new Set(nextFolders.map((f) => f.id));
  const folderIdMap = new Map<string, string>();

  for (const f of incoming.folders) {
    const mappedShelfId = shelfIdMap.get(f.shelfId);
    if (!mappedShelfId) continue;
    let resolvedId = f.id;
    while (folderIds.has(resolvedId)) resolvedId = uid();
    folderIds.add(resolvedId);
    folderIdMap.set(f.id, resolvedId);
    nextFolders.push({ ...f, id: resolvedId, shelfId: mappedShelfId });
  }

  const remapBlocks = (list: PromptBlock[]): PromptBlock[] =>
    list.map((b) => {
      if (b.kind !== 'custom' || !b.presetId) return { ...b, id: uid() };
      const mapped = presetIdMap.get(b.presetId);
      return {
        ...b,
        id: uid(),
        presetId: mapped && presetIds.has(mapped) ? mapped : undefined,
      };
    });

  const nextDocs: PromptDoc[] = current.documents.map((d) => ({
    ...d,
    blocks: d.blocks.map((b) => ({ ...b })),
  }));
  const docIds = new Set(nextDocs.map((d) => d.id));
  const docIdMap = new Map<string, string>();

  for (const d of incoming.documents) {
    const mappedFolderId = folderIdMap.get(d.folderId);
    if (!mappedFolderId) continue;
    let resolvedId = d.id;
    while (docIds.has(resolvedId)) resolvedId = uid();
    docIds.add(resolvedId);
    docIdMap.set(d.id, resolvedId);
    nextDocs.push({
      ...d,
      id: resolvedId,
      folderId: mappedFolderId,
      blocks: remapBlocks(d.blocks),
    });
  }

  const nextRevisions: Record<string, DocRevision[]> = { ...(current.revisions || {}) };
  for (const [oldDocId, list] of Object.entries(incoming.revisions || {})) {
    const newDocId = docIdMap.get(oldDocId);
    if (!newDocId) continue;
    nextRevisions[newDocId] = list.slice(0, MAX_REVISIONS_PER_DOC).map((r) => ({
      ...r,
      id: uid(),
      blocks: remapBlocks(r.blocks),
    }));
  }

  const nextTestCases: Record<string, DebugTestCase[]> = { ...(current.testCases || {}) };
  for (const [oldDocId, list] of Object.entries(incoming.testCases || {})) {
    const newDocId = docIdMap.get(oldDocId);
    if (!newDocId) continue;
    nextTestCases[newDocId] = list.slice(0, MAX_TEST_CASES_PER_DOC).map((tc) => ({
      ...tc,
      id: uid(),
      values: { ...tc.values },
    }));
  }

  return {
    shelves: nextShelves,
    folders: nextFolders,
    documents: nextDocs,
    presets: nextPresets,
    revisions: nextRevisions,
    testCases: nextTestCases,
  };
}

export interface ArchiveBackupEnvelope {
  format: 'prompt-archive-backup';
  version: 1;
  exportedAt: string;
  archive: ArchiveData;
}

export function buildArchiveBackupJson(data: ArchiveData): string {
  const envelope: ArchiveBackupEnvelope = {
    format: 'prompt-archive-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    archive: {
      shelves: data.shelves,
      folders: data.folders,
      documents: data.documents,
      presets: data.presets || [],
      revisions: data.revisions || {},
      testCases: data.testCases || {},
    },
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseArchiveBackupJson(rawText: string): ArchiveData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('无法解析文件：请确认这是一个格式正确的 JSON 备份文件。');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('无效的备份格式。');
  }
  const obj = parsed as Record<string, unknown>;
  const target = obj.format === 'prompt-archive-backup' && obj.archive ? obj.archive : obj;
  return normalizeArchivePayload(target);
}

export function docToMarkdownFile(
  doc: Pick<PromptDoc, 'title' | 'synopsis' | 'blocks'>,
  presets: BlockPreset[] = [],
  markdownBody?: string,
): string {
  const nonEmptyBlocks = doc.blocks.filter((b) => b.text.trim());
  const body =
    markdownBody !== undefined
      ? markdownBody.trim()
      : nonEmptyBlocks.length
        ? blocksToMarkdown(nonEmptyBlocks, presets).trim()
        : '';

  const lines: string[] = [`# ${doc.title.trim() || '未命名提示词'}`];
  if (doc.synopsis.trim()) {
    lines.push('', `> ${doc.synopsis.trim().replace(/\n+/g, ' ')}`);
  }
  if (body) {
    lines.push('', body);
  }
  lines.push('');
  return lines.join('\n');
}

export function parseImportedMarkdownFile(
  filename: string,
  content: string,
): { title: string; synopsis: string; body: string } {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  let cursor = 0;

  while (cursor < lines.length && !lines[cursor].trim()) {
    cursor++;
  }

  let title = '';
  if (cursor < lines.length) {
    const h1 = lines[cursor].match(/^\s{0,3}#\s+(.+?)\s*#*$/);
    if (h1) {
      title = h1[1].trim().slice(0, 100);
      cursor++;
    }
  }
  if (!title) {
    title = filename.replace(/\.[^/.]+$/, '').trim().slice(0, 100) || '导入的提示词';
  }

  while (cursor < lines.length && !lines[cursor].trim()) {
    cursor++;
  }

  const quoteLines: string[] = [];
  let quoteScan = cursor;
  while (quoteScan < lines.length && /^\s*>\s?/.test(lines[quoteScan])) {
    quoteLines.push(lines[quoteScan].replace(/^\s*>\s?/, '').trim());
    quoteScan++;
  }
  let synopsis = '';
  if (quoteLines.length && quoteLines.some(Boolean)) {
    synopsis = quoteLines.filter(Boolean).join(' ').slice(0, 300);
    cursor = quoteScan;
  }

  const body = lines.slice(cursor).join('\n').replace(/^\n+/, '').replace(/\s+$/, '');
  return { title, synopsis, body };
}

export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  text: string;
}

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.replace(/\r\n?/g, '\n').split('\n');
  const b = newText.replace(/\r\n?/g, '\n').split('\n');

  if (a.length * b.length > 160000) {
    let prefix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
    let suffix = 0;
    while (
      suffix < a.length - prefix &&
      suffix < b.length - prefix &&
      a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
    ) {
      suffix++;
    }
    const result: DiffLine[] = [];
    for (let i = 0; i < prefix; i++) result.push({ type: 'same', text: a[i] });
    for (let i = prefix; i < a.length - suffix; i++) result.push({ type: 'removed', text: a[i] });
    for (let i = prefix; i < b.length - suffix; i++) result.push({ type: 'added', text: b[i] });
    for (let i = a.length - suffix; i < a.length; i++) result.push({ type: 'same', text: a[i] });
    return result;
  }

  const m = a.length;
  const n = b.length;
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'removed', text: a[i] });
      i++;
    } else {
      out.push({ type: 'added', text: b[j] });
      j++;
    }
  }
  while (i < m) out.push({ type: 'removed', text: a[i++] });
  while (j < n) out.push({ type: 'added', text: b[j++] });
  return out;
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'application/json;charset=utf-8',
) {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

export interface ArchiveCardOptions {
  title: string;
  synopsis: string;
  shelfName: string;
  folderName: string;
  shelfColor: ShelfColor;
  promptText: string;
  blockCount: number;
  charCount: number;
  tokenCount: number;
  theme: 'light' | 'dark';
  dateLabel: string;
}

const TONE_SWATCH: Record<ShelfColor, string> = {
  moss: '#637652',
  walnut: '#9a714c',
  slate: '#5c727e',
  wine: '#88534b',
  ochre: '#9e7c44',
};

function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): { lines: string[]; truncated: boolean } {
  const rawParagraphs = text.replace(/\r\n?/g, '\n').split('\n');
  const lines: string[] = [];
  let truncated = false;

  for (const para of rawParagraphs) {
    if (!para) {
      if (lines.length && lines.length < maxLines) {
        lines.push('');
      }
      continue;
    }
    let current = '';
    for (const ch of para) {
      const test = current + ch;
      if (current && ctx.measureText(test).width > maxWidth) {
        lines.push(current);
        current = ch;
        if (lines.length >= maxLines) {
          truncated = true;
          break;
        }
      } else {
        current = test;
      }
    }
    if (truncated) break;
    if (current) {
      lines.push(current);
      if (lines.length >= maxLines) {
        if (para !== rawParagraphs[rawParagraphs.length - 1]) truncated = true;
        break;
      }
    }
  }

  if (truncated && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}……`;
  }

  return { lines, truncated };
}

function drawCornerMarks(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  const r = 7;
  const corners: [number, number][] = [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ];
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();
  }
}

export async function renderArchiveCardPng(
  options: ArchiveCardOptions,
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const scale = 2;
  const width = 820;
  const padX = 56;
  const contentWidth = width - padX * 2;
  const dark = options.theme === 'dark';

  const palette = dark
    ? {
        bgOuter: '#1c201b',
        paper: '#282d26',
        inset: '#222620',
        border: '#495042',
        borderInner: '#3a4035',
        ink: '#ebe9dc',
        muted: '#adb2a2',
        faint: '#7f8677',
        brass: '#c5a66f',
        accent: '#b7c79f',
        codeBg: '#232721',
      }
    : {
        bgOuter: '#ebe9dd',
        paper: '#faf8f0',
        inset: '#f1efe3',
        border: '#cfcbb8',
        borderInner: '#e0ddd0',
        ink: '#2f352c',
        muted: '#6f7366',
        faint: '#969789',
        brass: '#9d7c49',
        accent: '#4d5b40',
        codeBg: '#f4f2e7',
      };

  const serif = "'Archive Serif', 'Noto Serif SC', 'Songti SC', Georgia, serif";
  const sans = "Arial, 'Archive Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  const mono = "'SFMono-Regular', Consolas, monospace";

  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = 10;
  measureCanvas.height = 10;
  const mctx = measureCanvas.getContext('2d');
  if (!mctx) throw new Error('无法初始化画布上下文。');

  mctx.font = `600 32px ${serif}`;
  const titleLines = wrapCanvasLines(mctx, options.title || '未命名提示词', contentWidth - 40, 2).lines;

  mctx.font = `400 14px ${sans}`;
  const synopsisLines = options.synopsis.trim()
    ? wrapCanvasLines(mctx, options.synopsis.trim(), contentWidth - 40, 2).lines
    : [];

  mctx.font = `400 13.5px ${sans}`;
  const bodyWrap = wrapCanvasLines(mctx, options.promptText.trim() || '（暂无正文内容）', contentWidth - 88, 28);

  const headerH = 74;
  const titleBlockH = titleLines.length * 42 + (synopsisLines.length ? synopsisLines.length * 22 + 12 : 0) + 28;
  const bodyBoxH = Math.max(180, bodyWrap.lines.length * 24 + 48);
  const footerH = 78;
  const totalHeight = Math.min(1240, 36 + headerH + titleBlockH + bodyBoxH + footerH + 36);

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = totalHeight * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法初始化画布上下文。');
  ctx.scale(scale, scale);

  // Outer warm archival desk mat
  ctx.fillStyle = palette.bgOuter;
  ctx.fillRect(0, 0, width, totalHeight);

  // Inner archival card paper
  const cardX = 24;
  const cardY = 24;
  const cardW = width - 48;
  const cardH = totalHeight - 48;

  ctx.fillStyle = palette.paper;
  ctx.fillRect(cardX, cardY, cardW, cardH);

  // Outer & inner hairline rule
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cardX, cardY, cardW, cardH);
  ctx.strokeStyle = palette.borderInner;
  ctx.lineWidth = 1;
  ctx.strokeRect(cardX + 9, cardY + 9, cardW - 18, cardH - 18);

  // Subtle procedural paper fiber speckles
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.018)' : 'rgba(53,59,50,0.022)';
  for (let i = 0; i < 420; i++) {
    const px = cardX + 14 + ((i * 197) % (cardW - 28));
    const py = cardY + 14 + ((i * 313) % (cardH - 28));
    ctx.fillRect(px, py, (i % 3) + 1, 1);
  }

  drawCornerMarks(ctx, cardX + 22, cardY + 22, cardW - 44, cardH - 44, palette.brass);

  // Header eyebrow & shelf breadcrumb pill
  let y = cardY + 48;
  ctx.font = `600 10.5px ${mono}`;
  ctx.fillStyle = palette.brass;
  ctx.fillText('FIG. / PROMPT ARCHIVE CARD', padX, y);

  const pathLabel = `${options.shelfName}  /  ${options.folderName}`;
  ctx.font = `500 11.5px ${sans}`;
  const pathWidth = ctx.measureText(pathLabel).width + 30;
  const pillX = width - padX - pathWidth;
  ctx.fillStyle = palette.inset;
  ctx.fillRect(pillX, y - 16, pathWidth, 24);
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(pillX, y - 16, pathWidth, 24);

  ctx.fillStyle = TONE_SWATCH[options.shelfColor] || palette.brass;
  ctx.beginPath();
  ctx.arc(pillX + 12, y - 4, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.muted;
  ctx.fillText(pathLabel, pillX + 21, y);

  // Title & synopsis
  y += 46;
  ctx.font = `650 31px ${serif}`;
  ctx.fillStyle = palette.ink;
  for (const line of titleLines) {
    ctx.fillText(line, padX, y);
    y += 42;
  }

  if (synopsisLines.length) {
    y += 2;
    ctx.font = `400 13.5px ${sans}`;
    ctx.fillStyle = palette.muted;
    for (const line of synopsisLines) {
      ctx.fillText(line, padX, y);
      y += 21;
    }
  }

  // Hairline rule with brass accent
  y += 14;
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, y);
  ctx.lineTo(width - padX, y);
  ctx.stroke();
  ctx.strokeStyle = palette.brass;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, y);
  ctx.lineTo(padX + 54, y);
  ctx.stroke();

  // Prompt manuscript paper box
  y += 20;
  const remainingForBody = cardY + cardH - footerH - y;
  const boxH = Math.max(150, remainingForBody);
  ctx.fillStyle = palette.codeBg;
  ctx.fillRect(padX, y, contentWidth, boxH);
  ctx.strokeStyle = palette.borderInner;
  ctx.lineWidth = 1;
  ctx.strokeRect(padX, y, contentWidth, boxH);

  // Ruled faint paper lines inside manuscript box
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.035)' : 'rgba(53,59,50,0.045)';
  ctx.beginPath();
  for (let ly = y + 36; ly < y + boxH - 12; ly += 24) {
    ctx.moveTo(padX + 16, ly);
    ctx.lineTo(padX + contentWidth - 16, ly);
  }
  ctx.stroke();

  // Manuscript body text (with ## headings tinted brass)
  let ty = y + 30;
  for (const line of bodyWrap.lines) {
    if (ty > y + boxH - 16) break;
    const isHeading = /^#{1,6}\s/.test(line) || /^\[(System|User)\]$/.test(line);
    ctx.font = isHeading ? `600 13.5px ${sans}` : `400 13.5px ${sans}`;
    ctx.fillStyle = isHeading ? palette.brass : palette.ink;
    ctx.fillText(line, padX + 22, ty);
    ty += 24;
  }

  // Footer archival stamp & barcode
  const fy = cardY + cardH - 42;
  ctx.strokeStyle = palette.border;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padX, fy - 24);
  ctx.lineTo(width - padX, fy - 24);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = `500 10.5px ${mono}`;
  ctx.fillStyle = palette.muted;
  const stats = `${options.blockCount} BLOCKS  ·  ${options.charCount} CHARS  ·  ~${options.tokenCount} TOKENS  ·  ${options.dateLabel}`;
  ctx.fillText(stats, padX, fy);

  // Archival barcode on bottom right
  const barWidths = [2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2, 3, 1, 2, 1];
  let bx = width - padX - 44;
  ctx.fillStyle = palette.faint;
  for (let i = 0; i < barWidths.length; i++) {
    const bw = barWidths[i];
    if (i % 2 === 0) {
      ctx.fillRect(bx, fy - 12, bw, 13);
    }
    bx += bw + 1.5;
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('生成馆藏卡片失败。'))),
      'image/png',
    );
  });

  return {
    blob,
    dataUrl: canvas.toDataURL('image/png'),
    width: width * scale,
    height: totalHeight * scale,
  };
}
