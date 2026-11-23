import { initialArchive } from './archive-seed';
import {
  blockLabels,
  uid,
  type ArchiveData,
  type PromptBlock,
  type ShelfColor,
} from './archive-types';

const STORAGE_KEY = 'archive-data-v1';

let memoryStore: ArchiveData | null = null;

export class LocalInputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function compareId(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortArchive(data: ArchiveData): ArchiveData {
  return {
    shelves: [...data.shelves].sort((a, b) => a.position - b.position || compareId(a.id, b.id)),
    folders: [...data.folders].sort((a, b) => a.position - b.position || compareId(a.id, b.id)),
    documents: [...data.documents].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    ),
  };
}

function cloneArchive(data: ArchiveData): ArchiveData {
  return {
    shelves: data.shelves.map((s) => ({ ...s })),
    folders: data.folders.map((f) => ({ ...f })),
    documents: data.documents.map((d) => ({
      ...d,
      blocks: d.blocks.map((b) => ({ ...b })),
    })),
  };
}

function isValidArchive(value: unknown): value is ArchiveData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return Array.isArray(obj.shelves) && Array.isArray(obj.folders) && Array.isArray(obj.documents);
}

function persistArchive(data: ArchiveData): ArchiveData {
  const sorted = sortArchive(cloneArchive(data));
  memoryStore = sorted;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
    } catch {
      // Fall back to in-memory persistence if localStorage is unavailable or full.
    }
  }
  return cloneArchive(sorted);
}

export function readLocalArchive(): ArchiveData {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isValidArchive(parsed)) {
          const sorted = sortArchive(cloneArchive(parsed));
          memoryStore = sorted;
          return cloneArchive(sorted);
        }
      }
    } catch {
      // Ignore malformed storage or restricted access and fall back cleanly.
    }
  }

  if (memoryStore) {
    return cloneArchive(memoryStore);
  }

  return persistArchive(initialArchive());
}

function text(value: unknown, label: string, max = 80, optional = false) {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > max) {
    throw new LocalInputError(`${label}不能为空，且不能超过 ${max} 个字符。`);
  }
  return value.trim();
}

function color(value: unknown): ShelfColor {
  if (!['moss', 'walnut', 'slate', 'wine', 'ochre'].includes(String(value))) {
    throw new LocalInputError('请选择有效的货架颜色。');
  }
  return value as ShelfColor;
}

function blocks(value: unknown): PromptBlock[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) {
    throw new LocalInputError('每篇文档应包含 1 至 40 个模块。');
  }
  const out = value.map((item) => {
    if (typeof item !== 'object' || !item || !Object.hasOwn(blockLabels, (item as { kind?: string }).kind ?? '')) {
      throw new LocalInputError('模块类型无效。');
    }
    const candidate = item as { id: unknown; kind: PromptBlock['kind']; text: unknown };
    return {
      id: text(candidate.id, '模块编号', 100),
      kind: candidate.kind,
      text: text(candidate.text, '模块内容', 30000, true),
    };
  });
  if (new Set(out.map((b) => b.id)).size !== out.length) {
    throw new LocalInputError('模块编号不能重复。');
  }
  if (!out.some((b) => b.text.trim())) {
    throw new LocalInputError('请至少填写一个模块的内容。');
  }
  return out;
}

function assertExists<T>(item: T | undefined, label: string): T {
  if (!item) {
    throw new LocalInputError(`${label}不存在或已移除。`, 404);
  }
  return item;
}

export function mutateLocalArchive(value: unknown): { id: string | null; archive: ArchiveData } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LocalInputError('无效的请求。');
  }
  const b = value as Record<string, unknown>;
  const data = readLocalArchive();

  if (b.action === 'createShelf') {
    const id = uid();
    const name = text(b.name, '货架名称', 16);
    const tone = color(b.color);
    const english = text(b.english, '英文索引名', 40, true).toUpperCase() || 'PERSONAL COLLECTION';
    data.shelves.push({
      id,
      name,
      english,
      color: tone,
      position: Math.floor(Date.now() / 1000),
    });
    data.folders.push({
      id: uid(),
      shelfId: id,
      name: '收件夹',
      description: '尚待整理的新灵感',
      position: 0,
    });
    return { id, archive: persistArchive(data) };
  }

  if (b.action === 'createFolder') {
    const id = uid();
    const shelfId = text(b.shelfId, '所属货架', 100);
    assertExists(
      data.shelves.find((s) => s.id === shelfId),
      '货架',
    );
    data.folders.push({
      id,
      shelfId,
      name: text(b.name, '文件夹名称', 30),
      description: text(b.description, '文件夹说明', 160, true),
      position: Math.floor(Date.now() / 1000),
    });
    return { id, archive: persistArchive(data) };
  }

  if (b.action === 'saveDoc') {
    const folderId = text(b.folderId, '所属文件夹', 100);
    assertExists(
      data.folders.find((f) => f.id === folderId),
      '文件夹',
    );
    const nowIso = new Date().toISOString();
    const docFields = {
      folderId,
      title: text(b.title, '文档标题', 100),
      synopsis: text(b.synopsis, '摘要', 300, true),
      blocks: blocks(b.blocks),
      updatedAt: nowIso,
    };
    if (b.id) {
      const id = text(b.id, '文档编号', 100);
      const existing = assertExists(
        data.documents.find((d) => d.id === id),
        '文档',
      );
      Object.assign(existing, docFields);
      return { id, archive: persistArchive(data) };
    }
    const id = uid();
    data.documents.push({
      id,
      ...docFields,
      favorite: false,
      createdAt: nowIso,
      lastOpened: null,
    });
    return { id, archive: persistArchive(data) };
  }

  const id = text(b.id, '编号', 100);
  switch (b.action) {
    case 'favorite': {
      if (typeof b.favorite !== 'boolean') {
        throw new LocalInputError('收藏状态无效。');
      }
      const doc = assertExists(
        data.documents.find((d) => d.id === id),
        '文档',
      );
      doc.favorite = b.favorite;
      return { id, archive: persistArchive(data) };
    }
    case 'open': {
      const doc = assertExists(
        data.documents.find((d) => d.id === id),
        '文档',
      );
      doc.lastOpened = new Date().toISOString();
      return { id, archive: persistArchive(data) };
    }
    case 'duplicate': {
      const doc = assertExists(
        data.documents.find((d) => d.id === id),
        '文档',
      );
      const newId = uid();
      const nowIso = new Date().toISOString();
      data.documents.push({
        id: newId,
        folderId: doc.folderId,
        title: `${doc.title.slice(0, 94)} · 副本`,
        synopsis: doc.synopsis,
        blocks: doc.blocks.map((item) => ({ ...item })),
        favorite: false,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastOpened: null,
      });
      return { id: newId, archive: persistArchive(data) };
    }
    case 'deleteDoc': {
      const idx = data.documents.findIndex((d) => d.id === id);
      assertExists(idx >= 0 ? data.documents[idx] : undefined, '文档');
      data.documents.splice(idx, 1);
      return { id, archive: persistArchive(data) };
    }
    case 'updateShelf': {
      const shelf = assertExists(
        data.shelves.find((s) => s.id === id),
        '货架',
      );
      shelf.name = text(b.name, '货架名称', 16);
      shelf.english = text(b.english, '英文索引名', 40, true).toUpperCase() || 'PERSONAL COLLECTION';
      shelf.color = color(b.color);
      return { id, archive: persistArchive(data) };
    }
    case 'updateFolder': {
      const folder = assertExists(
        data.folders.find((f) => f.id === id),
        '文件夹',
      );
      folder.name = text(b.name, '文件夹名称', 30);
      folder.description = text(b.description, '文件夹说明', 160, true);
      return { id, archive: persistArchive(data) };
    }
    case 'deleteShelf': {
      const idx = data.shelves.findIndex((s) => s.id === id);
      assertExists(idx >= 0 ? data.shelves[idx] : undefined, '货架');
      data.shelves.splice(idx, 1);
      const removedFolderIds = new Set(data.folders.filter((f) => f.shelfId === id).map((f) => f.id));
      data.folders = data.folders.filter((f) => f.shelfId !== id);
      data.documents = data.documents.filter((d) => !removedFolderIds.has(d.folderId));
      return { id, archive: persistArchive(data) };
    }
    case 'deleteFolder': {
      const idx = data.folders.findIndex((f) => f.id === id);
      assertExists(idx >= 0 ? data.folders[idx] : undefined, '文件夹');
      data.folders.splice(idx, 1);
      data.documents = data.documents.filter((d) => d.folderId !== id);
      return { id, archive: persistArchive(data) };
    }
    default:
      throw new LocalInputError('不支持的仓库操作。');
  }
}
