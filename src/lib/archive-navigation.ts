import type { ArchiveData } from './archive-types';

export type ArchiveView = {
  kind: 'overview' | 'all' | 'favorites' | 'recent' | 'shelf' | 'folder';
  id?: string;
};

export const viewTitles: Record<ArchiveView['kind'], string> = {
  overview: '仓库总览',
  all: '全部提示词',
  favorites: '我的收藏',
  recent: '最近访问',
  shelf: '我的货架',
  folder: '文件夹',
};

/** The server and the browser resolve the same shareable archive location. */
export function resolveView(kind: unknown, id?: unknown, data?: ArchiveData): ArchiveView {
  if (typeof kind !== 'string' || !Object.hasOwn(viewTitles, kind)) return { kind: 'overview' };
  if (kind === 'shelf' || kind === 'folder') {
    if (
      typeof id !== 'string' ||
      !id ||
      (data && !(kind === 'shelf' ? data.shelves : data.folders).some((item) => item.id === id))
    )
      return { kind: 'overview' };
    return { kind, id };
  }
  return { kind: kind as ArchiveView['kind'] };
}

export function viewFromLocation(url: URL): ArchiveView {
  if (url.searchParams.has('view'))
    return resolveView(url.searchParams.get('view'), url.searchParams.get('id'));
  // Keep old hash-based bookmarks usable without requiring a server redirect.
  try {
    const [kind, id] = decodeURIComponent(url.hash.slice(1)).split('/');
    return resolveView(kind, id);
  } catch {
    return { kind: 'overview' };
  }
}

export function viewHref(view: ArchiveView, base: string): string {
  const url = new URL(base);
  url.hash = '';
  url.searchParams.delete('view');
  url.searchParams.delete('id');
  if (view.kind !== 'overview') url.searchParams.set('view', view.kind);
  if (view.id && (view.kind === 'shelf' || view.kind === 'folder')) url.searchParams.set('id', view.id);
  return url.pathname + url.search;
}
