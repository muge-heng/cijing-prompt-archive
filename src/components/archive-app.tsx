'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { assemble, uid, type ArchiveData, type PromptDoc } from '@/lib/archive-types';
import { mutateLocalArchive, readLocalArchive } from '@/lib/archive-local-store';
import { archiveDate } from '@/lib/archive-dates';
import { ArchiveMark, Icon, type IconName } from './icons';
import { ShelfCard } from './shelf-card';
import { DocumentList } from './document-list';
import { DocumentEditor } from './editor';
import { Dialog } from './dialog';
import { EntityDialog, SearchDialog, Settings, type EntityForm, type Preferences } from './archive-dialogs';

import {
  resolveView,
  viewFromLocation,
  viewHref,
  viewTitles as titles,
  type ArchiveView as View,
} from '@/lib/archive-navigation';
type Confirm = { title: string; message: string; run: () => Promise<void> };
const navItems: { kind: 'overview' | 'all' | 'favorites' | 'recent'; icon: IconName }[] = [
  { kind: 'overview', icon: 'overview' },
  { kind: 'all', icon: 'files' },
  { kind: 'favorites', icon: 'star' },
  { kind: 'recent', icon: 'history' },
];
const isStaticMode = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true';
const defaults: Preferences = { theme: 'light', entrance: true, motion: true };
function section(title: string, en: string, action?: ReactNode) {
  return (
    <div className="section-heading">
      <div className="section-titles">
        <h2>{title}</h2>
        <span className="section-english">{en}</span>
      </div>
      {action}
    </div>
  );
}
export function ArchiveApp({
  initial,
  initialTime,
  initialView,
}: {
  initial: ArchiveData;
  initialTime: number;
  initialView: View;
}) {
  const [data, setData] = useState(initial),
    [now, setNow] = useState(initialTime),
    [route, setView] = useState<View>(initialView),
    [mobileNav, setMobileNav] = useState(false);
  const view = resolveView(route.kind, route.id, data);
  const [modal, setModal] = useState<'search' | 'settings' | null>(null),
    [entity, setEntity] = useState<EntityForm | null>(null),
    [editor, setEditor] = useState<{ doc: PromptDoc; isNew: boolean } | null>(null),
    [confirm, setConfirm] = useState<Confirm | null>(null),
    [confirmBusy, setConfirmBusy] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(defaults),
    [entry, setEntry] = useState(0),
    [entering, setEntering] = useState(false);
  const [menu, setMenu] = useState<{ doc: PromptDoc; x: number; y: number } | null>(null),
    [toast, setToast] = useState(''),
    [pending, setPending] = useState(0),
    [syncError, setSyncError] = useState(false);
  const [filter, setFilter] = useState(''),
    [shelfFilter, setShelfFilter] = useState(''),
    [sort, setSort] = useState('updated');
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    sequence = useRef(0),
    lastApplied = useRef(0),
    pendingStars = useRef(new Set<string>());
  const notify = useCallback((message: string) => {
    setToast(message);
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setToast(''), 2900);
  }, []);
  const navigate = useCallback((kind: View['kind'], id?: string) => {
    setView({ kind, id });
    setFilter('');
    setShelfFilter('');
    setSort('updated');
    setMobileNav(false);
    setMenu(null);
    setModal(null);
    const href = viewHref({ kind, id }, window.location.href);
    if (window.location.pathname + window.location.search + window.location.hash !== href)
      window.history.pushState(null, '', href);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  useEffect(() => {
    // Restore device-only state on the first browser frame; the server snapshot stays deterministic.
    const hydrateFrame = window.requestAnimationFrame(() => {
      let p = defaults;
      try {
        const stored = JSON.parse(localStorage.getItem('archive-preferences') || '{}');
        p = {
          theme: stored.theme === 'dark' ? 'dark' : 'light',
          entrance: stored.entrance !== false,
          motion: stored.motion !== false,
        };
      } catch {}
      setPrefs(p);
      document.documentElement.dataset.theme = p.theme;
      document.documentElement.dataset.motion = p.motion ? 'on' : 'off';
      setEntering(p.entrance && p.motion);
      if (isStaticMode) {
        setData(readLocalArchive());
        setNow(Date.now());
      }
      if (window.location.hash || (isStaticMode && window.location.search)) {
        setView(viewFromLocation(new URL(window.location.href)));
      }
    });
    const back = () => {
      setView(viewFromLocation(new URL(window.location.href)));
      setFilter('');
      setShelfFilter('');
      setMobileNav(false);
      setMenu(null);
      setModal(null);
    };
    window.addEventListener('popstate', back);
    window.addEventListener('hashchange', back);
    const clock = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      window.cancelAnimationFrame(hydrateFrame);
      clearInterval(clock);
      window.removeEventListener('popstate', back);
      window.removeEventListener('hashchange', back);
      if (messageTimer.current) clearTimeout(messageTimer.current);
    };
  }, []);
  useEffect(() => {
    if (entering) {
      const timer = setTimeout(() => setEntering(false), 1400);
      return () => clearTimeout(timer);
    }
  }, [entering, entry]);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (editor || entity || confirm) return;
        setModal((m) => (m === 'search' ? null : 'search'));
        setMobileNav(false);
        setMenu(null);
      }
      if (e.key === 'Escape') {
        setMobileNav(false);
        setMenu(null);
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [editor, entity, confirm]);
  useEffect(() => {
    if (!mobileNav) return;
    const old = document.body.style.overflow,
      before = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    const root = document.getElementById('archive-navigation');
    root?.querySelector<HTMLButtonElement>('button')?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !root) return;
      const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter(
        (b) => b.offsetParent !== null,
      );
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    const screen = window.matchMedia('(max-width:900px)'),
      resize = () => {
        if (!screen.matches) setMobileNav(false);
      };
    screen.addEventListener('change', resize);
    document.addEventListener('keydown', trap);
    return () => {
      document.body.style.overflow = old;
      screen.removeEventListener('change', resize);
      document.removeEventListener('keydown', trap);
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [mobileNav]);
  const changePrefs = (p: Preferences) => {
    setPrefs(p);
    document.documentElement.dataset.theme = p.theme;
    document.documentElement.dataset.motion = p.motion ? 'on' : 'off';
    try {
      localStorage.setItem('archive-preferences', JSON.stringify(p));
    } catch {
      notify('当前浏览器无法保存设备偏好');
    }
  };
  const mutate = useCallback(async (body: Record<string, unknown>) => {
    const seq = ++sequence.current;
    setPending((p) => p + 1);
    try {
      if (isStaticMode) {
        const result = mutateLocalArchive(body);
        if (seq >= lastApplied.current) {
          setData(result.archive);
          lastApplied.current = seq;
        }
        setSyncError(false);
        return result.id;
      }
      const response = await fetch('/api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '操作失败，请重试。');
      if (seq >= lastApplied.current) {
        setData(result.archive);
        lastApplied.current = seq;
      }
      setSyncError(false);
      return (result.id || null) as string | null;
    } catch (e) {
      setSyncError(true);
      throw e instanceof Error ? e : new Error('暂时无法连接仓库。');
    } finally {
      setPending((p) => p - 1);
    }
  }, []);
  const act = async (body: Record<string, unknown>, success?: string) => {
    try {
      await mutate(body);
      if (success) notify(success);
    } catch (e) {
      notify(e instanceof Error ? e.message : '操作失败，请重试。');
    }
  };
  const copy = async (value: string, message = '提示词已复制到剪贴板') => {
    if (!value.trim()) {
      notify('还没有可以复制的内容');
      return;
    }
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const el = document.createElement('textarea');
        el.value = value;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand('copy');
        el.remove();
        if (!ok) throw new Error();
      }
      notify(message);
    } catch {
      notify('未获得剪贴板权限，请在编辑器中选中并复制。');
    }
  };
  const openDoc = (doc: PromptDoc) => {
    setMenu(null);
    setModal(null);
    setEditor({ doc, isNew: false });
    void act({ action: 'open', id: doc.id });
  };
  const favorite = async (doc: PromptDoc) => {
    if (pendingStars.current.has(doc.id)) return;
    pendingStars.current.add(doc.id);
    const favorite = !doc.favorite;
    setData((d) => ({ ...d, documents: d.documents.map((p) => (p.id === doc.id ? { ...p, favorite } : p)) }));
    try {
      await mutate({ action: 'favorite', id: doc.id, favorite });
      notify(favorite ? '已加入我的收藏' : '已取消收藏');
    } catch (e) {
      setData((d) => ({
        ...d,
        documents: d.documents.map((p) => (p.id === doc.id ? { ...p, favorite: !favorite } : p)),
      }));
      notify(e instanceof Error ? e.message : '收藏失败');
    } finally {
      pendingStars.current.delete(doc.id);
    }
  };
  const folder = view.kind === 'folder' ? data.folders.find((f) => f.id === view.id) : undefined;
  const shelf =
    view.kind === 'shelf'
      ? data.shelves.find((s) => s.id === view.id)
      : folder
        ? data.shelves.find((s) => s.id === folder.shelfId)
        : undefined;
  const newDoc = () => {
    const target = folder || data.folders.find((f) => f.shelfId === shelf?.id) || data.folders[0];
    if (!target) {
      if (data.shelves.length) setEntity({ kind: 'folder', shelfId: data.shelves[0].id });
      else setEntity({ kind: 'shelf' });
      notify('先准备一个归档位置，再创建提示词');
      return;
    }
    const date = new Date().toISOString();
    setEditor({
      isNew: true,
      doc: {
        id: uid(),
        title: '',
        synopsis: '',
        folderId: target.id,
        blocks: [{ id: uid(), kind: 'task', text: '' }],
        favorite: false,
        updatedAt: date,
        createdAt: date,
        lastOpened: null,
      },
    });
    setMobileNav(false);
  };
  const openMenu = (doc: PromptDoc, rect: DOMRect) =>
    setMenu({
      doc,
      x: Math.max(12, Math.min(window.innerWidth - 190, rect.right - 182)),
      y: Math.max(12, Math.min(window.innerHeight - 205, rect.bottom + 5)),
    });
  const favoriteCount = data.documents.filter((d) => d.favorite).length,
    date = archiveDate(now);
  const shelfFolders = data.folders.filter((f) => f.shelfId === shelf?.id),
    shelfFolderIds = new Set(shelfFolders.map((f) => f.id));
  let visibleDocs = data.documents.filter((d) =>
    view.kind === 'favorites'
      ? d.favorite
      : view.kind === 'recent'
        ? !!d.lastOpened
        : view.kind === 'folder'
          ? d.folderId === folder?.id
          : view.kind === 'shelf'
            ? shelfFolderIds.has(d.folderId)
            : true,
  );
  if (shelfFilter)
    visibleDocs = visibleDocs.filter((d) =>
      data.folders.some((f) => f.id === d.folderId && f.shelfId === shelfFilter),
    );
  if (filter.trim())
    visibleDocs = visibleDocs.filter((d) =>
      (d.title + d.synopsis + assemble(d.blocks)).toLowerCase().includes(filter.trim().toLowerCase()),
    );
  visibleDocs = [...visibleDocs].sort((a, b) =>
    sort === 'name'
      ? a.title.localeCompare(b.title, 'zh-CN')
      : sort === 'oldest'
        ? +new Date(a.updatedAt) - +new Date(b.updatedAt)
        : +new Date(view.kind === 'recent' ? b.lastOpened! : b.updatedAt) -
          +new Date(view.kind === 'recent' ? a.lastOpened! : a.updatedAt),
  );
  const listProps = { data, now, onOpen: openDoc, onFavorite: favorite, onMenu: openMenu, onCopy: copy };
  const pageTitle = folder?.name || shelf?.name || titles[view.kind];
  const openSettings = () => {
    setMobileNav(false);
    setModal('settings');
  };
  const formDelete = () => {
    if (!entity?.id) return;
    const { kind, id } = entity;
    const isShelf = kind === 'shelf',
      label = isShelf ? '货架' : '文件夹';
    const affected = isShelf
      ? data.documents.filter((d) => data.folders.find((f) => f.id === d.folderId)?.shelfId === id).length
      : data.documents.filter((d) => d.folderId === id).length;
    setConfirm({
      title: `移除这个${label}？`,
      message: `${label}及其中的 ${affected} 篇提示词将被永久删除，无法撤销。`,
      run: async () => {
        await mutate({ action: isShelf ? 'deleteShelf' : 'deleteFolder', id });
        setEntity(null);
        navigate(isShelf ? 'overview' : 'shelf', isShelf ? undefined : entity.shelfId || folder?.shelfId);
        notify(`${label}已移除`);
      },
    });
  };
  return (
    <div className={`archive-app ${entering ? 'room-entering' : ''}`}>
      {mobileNav && (
        <button className="mobile-scrim" aria-label="关闭导航" onClick={() => setMobileNav(false)} />
      )}
      <aside
        id="archive-navigation"
        className={`sidebar ${mobileNav ? 'is-open' : ''}`}
        aria-label="仓库导航"
      >
        <div className="brand">
          <button onClick={() => navigate('overview')} aria-label="词境仓库首页">
            <ArchiveMark />
            <span>
              <strong>词境仓库</strong>
              <small>PROMPT ARCHIVE</small>
            </span>
          </button>
          <button
            className="mobile-close icon-button"
            onClick={() => setMobileNav(false)}
            aria-label="关闭导航"
          >
            <Icon name="close" size={17} />
          </button>
        </div>
        <div className="sidebar-nav">
          <div className="nav-label">
            <span>工作空间</span>
            <small>WORKSPACE</small>
          </div>
          <nav>
            {navItems.map((item) => (
              <button
                className={`nav-item ${view.kind === item.kind ? 'active' : ''}`}
                key={item.kind}
                onClick={() => navigate(item.kind)}
                aria-current={view.kind === item.kind ? 'page' : undefined}
              >
                <Icon name={item.icon} size={17} />
                <span>{titles[item.kind]}</span>
                {item.kind === 'all' ? (
                  <small>{data.documents.length}</small>
                ) : item.kind === 'favorites' ? (
                  <small>{favoriteCount}</small>
                ) : null}
              </button>
            ))}
          </nav>
          <div className="nav-divider" />
          <div className="nav-label shelves-label">
            <span>我的货架</span>
            <small>SHELVES</small>
            <button
              className="icon-button"
              onClick={() => {
                setEntity({ kind: 'shelf' });
                setMobileNav(false);
              }}
              title="新建货架"
              aria-label="新建货架"
            >
              <Icon name="plus" size={14} />
            </button>
          </div>
          <nav className="shelf-navigation">
            {data.shelves.map((s) => (
              <button
                key={s.id}
                className={`nav-item ${s.id === shelf?.id ? 'active' : ''}`}
                onClick={() => navigate('shelf', s.id)}
              >
                <span className={`shelf-nav-icon tone-${s.color}`}>
                  <Icon name="shelf" size={15} />
                </span>
                <span>{s.name}</span>
                <Icon name="chevron" size={12} className="nav-chevron" />
              </button>
            ))}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="index-ticket">
            <div className="ticket-heading">
              <Icon name="layers" size={13} />
              <strong>馆藏索引</strong>
              <span>INDEX</span>
            </div>
            <div className="ticket-stats">
              {[
                [data.shelves.length, '货架'],
                [data.folders.length, '文件夹'],
                [data.documents.length, '提示词'],
              ].map(([v, l]) => (
                <div key={l}>
                  <b>{String(v).padStart(2, '0')}</b>
                  <small>{l}</small>
                </div>
              ))}
            </div>
            <div className="ticket-foot">
              <span>PRIVATE COLLECTION</span>
              <i className="barcode" />
            </div>
          </div>
          <button className="settings-link" onClick={openSettings}>
            <Icon name="settings" size={17} />
            仓库设置
            <Icon name="chevron" size={13} />
          </button>
          <button className="workspace-profile" onClick={openSettings}>
            <span className="profile-mark">
              A<span>.</span>
            </span>
            <span>
              <strong>私人工作空间</strong>
              <small>Personal workspace</small>
            </span>
            <Icon name="down" size={13} />
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu-button icon-button"
              aria-label="打开导航"
              aria-expanded={mobileNav}
              aria-controls="archive-navigation"
              onClick={() => setMobileNav(true)}
            >
              <Icon name="menu" size={20} />
            </button>
            <button className="breadcrumb-home" onClick={() => navigate('overview')}>
              <Icon name="panel" size={15} />
              <span>工作台</span>
            </button>
            <span className="crumb-sep">/</span>
            {folder && shelf && (
              <>
                <button className="parent-crumb" onClick={() => navigate('shelf', shelf.id)}>
                  {shelf.name}
                </button>
                <span className="crumb-sep">/</span>
              </>
            )}
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-actions">
            <button className="global-search" onClick={() => setModal('search')} aria-label="搜索仓库">
              <Icon name="search" size={15} />
              <span>搜索仓库…</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="theme-button icon-button"
              aria-label={prefs.theme === 'light' ? '切换深色主题' : '切换浅色主题'}
              title="切换主题"
              onClick={() => changePrefs({ ...prefs, theme: prefs.theme === 'light' ? 'dark' : 'light' })}
            >
              <Icon name={prefs.theme === 'light' ? 'sun' : 'moon'} size={18} />
            </button>
            <span className="header-rule" />
            <button className="button primary new-doc-button" onClick={newDoc}>
              <Icon name="plus" size={16} />
              <span>新建提示词</span>
            </button>
          </div>
        </header>
        <div className="main-content" key={`${view.kind}-${view.id || ''}-${entry}`}>
          {view.kind === 'overview' ? (
            <>
              <section className="welcome-hero">
                <div className="hero-art" role="img" aria-label="铜版画风格的木质档案柜、书籍与阅读灯" />
                <div className="hero-copy">
                  <div className="hero-overline">
                    <span className="open-badge">
                      <i />
                      仓库开放中
                    </span>
                    <span>PERSONAL ARCHIVE</span>
                  </div>
                  <h1>
                    {date.greeting}，欢迎回仓<span>。</span>
                  </h1>
                  <p>一方有序的空间，安放每一次灵感。</p>
                  <div className="hero-date">
                    <Icon name="calendar" size={14} />
                    <span>{date.formatted}</span>
                    <b>·</b>
                    <span>{date.weekday}</span>
                    <i />
                    <span className="lunar">{date.lunar}</span>
                  </div>
                </div>
                <div className="hero-plate">
                  FIG. 01 <i /> THE ARCHIVE ROOM
                </div>
                <span className="hero-register reg-top" />
                <span className="hero-register reg-bottom" />
              </section>
              <section className="shelf-section">
                {section(
                  '我的货架',
                  'MY SHELVES',
                  <button className="button small" onClick={() => setEntity({ kind: 'shelf' })}>
                    <Icon name="plus" size={14} />
                    新建货架
                  </button>,
                )}
                <div className="shelf-grid">
                  {data.shelves.map((s, i) => {
                    const fs = data.folders.filter((f) => f.shelfId === s.id);
                    return (
                      <ShelfCard
                        key={s.id}
                        shelf={s}
                        number={i + 1}
                        folders={fs.length}
                        documents={data.documents.filter((d) => fs.some((f) => f.id === d.folderId)).length}
                        onClick={() => navigate('shelf', s.id)}
                      />
                    );
                  })}
                  {!data.shelves.length && (
                    <button className="empty-shelf" onClick={() => setEntity({ kind: 'shelf' })}>
                      <Icon name="plus" />
                      建立第一个货架
                    </button>
                  )}
                </div>
              </section>
              <section className="recent-section">
                {section(
                  '最近编辑',
                  'RECENT DOCUMENTS',
                  <button className="text-button see-all" onClick={() => navigate('all')}>
                    查看全部
                    <Icon name="arrow" size={14} />
                  </button>,
                )}
                <DocumentList {...listProps} docs={data.documents.slice(0, 4)} onCreate={newDoc} />
              </section>
            </>
          ) : (
            <>
              <section className={`collection-heading ${shelf ? 'tone-' + shelf.color : ''}`}>
                <div className="collection-heading-copy">
                  <div className="eyebrow">
                    <span className="tiny-line" />
                    {view.kind === 'shelf'
                      ? `SHELF Nº ${String(data.shelves.findIndex((s) => s.id === shelf?.id) + 1).padStart(2, '0')} / ${shelf?.english || 'COLLECTION'}`
                      : view.kind === 'folder'
                        ? 'FOLDER / DOCUMENT INDEX'
                        : view.kind === 'favorites'
                          ? 'STARRED COLLECTION'
                          : view.kind === 'recent'
                            ? 'READING HISTORY'
                            : 'COMPLETE COLLECTION'}
                  </div>
                  <h1>
                    {pageTitle}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {view.kind === 'all'
                      ? '每一份归档的灵感，都在这里。'
                      : view.kind === 'favorites'
                        ? '为值得反复使用的提示词，留一个专属位置。'
                        : view.kind === 'recent'
                          ? '循着阅读的痕迹，继续上一次的思考。'
                          : view.kind === 'folder'
                            ? folder?.description || '这个文件夹中收藏的提示词文档。'
                            : `${shelfFolders.length} 个文件夹 · ${data.documents.filter((d) => shelfFolderIds.has(d.folderId)).length} 篇提示词`}
                  </p>
                </div>
                <div className="collection-actions">
                  {(view.kind === 'shelf' || view.kind === 'folder') && (
                    <button
                      className="button small"
                      onClick={() =>
                        setEntity({
                          kind: view.kind === 'shelf' ? 'shelf' : 'folder',
                          id: view.id,
                          shelfId: shelf?.id,
                        })
                      }
                    >
                      <Icon name="edit" size={14} />
                      编辑{view.kind === 'shelf' ? '货架' : '文件夹'}
                    </button>
                  )}
                  <div className="collection-stamp">
                    <Icon
                      name={
                        view.kind === 'shelf'
                          ? 'shelf'
                          : view.kind === 'folder'
                            ? 'folderOpen'
                            : view.kind === 'favorites'
                              ? 'star'
                              : view.kind === 'recent'
                                ? 'history'
                                : 'files'
                      }
                      size={40}
                    />
                  </div>
                </div>
              </section>
              {view.kind === 'shelf' && (
                <section className="folder-section">
                  {section(
                    '归档文件夹',
                    'FOLDER INDEX',
                    <button
                      className="button small"
                      onClick={() => setEntity({ kind: 'folder', shelfId: shelf?.id })}
                    >
                      <Icon name="plus" size={14} />
                      新建文件夹
                    </button>,
                  )}
                  <div className="folder-grid">
                    {shelfFolders.map((f, i) => (
                      <button
                        key={f.id}
                        className={`folder-card tone-${shelf?.color}`}
                        onClick={() => navigate('folder', f.id)}
                      >
                        <span className="folder-tab">F — {String(i + 1).padStart(2, '0')}</span>
                        <div className="folder-sheet">
                          <div className="folder-card-top">
                            <Icon name="folder" size={23} />
                            <span>FILE FOLDER</span>
                          </div>
                          <strong>{f.name}</strong>
                          <p>{f.description || '私人归档文件夹'}</p>
                          <div className="folder-card-bottom">
                            {data.documents.filter((d) => d.folderId === f.id).length} 篇提示词
                            <Icon name="arrow" size={14} />
                          </div>
                        </div>
                      </button>
                    ))}
                    {!shelfFolders.length && (
                      <button
                        className="empty-shelf"
                        onClick={() => setEntity({ kind: 'folder', shelfId: shelf?.id })}
                      >
                        <Icon name="plus" />
                        添加第一个文件夹
                      </button>
                    )}
                  </div>
                </section>
              )}
              <section className="library-section">
                {section(
                  view.kind === 'shelf' ? '货架中的文档' : view.kind === 'folder' ? '文件夹文档' : '文档目录',
                  `${String(visibleDocs.length).padStart(2, '0')} DOCUMENTS`,
                )}
                <div className="library-filters">
                  <label className="list-search">
                    <Icon name="search" size={15} />
                    <input
                      aria-label="筛选当前文档"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="筛选当前文档…"
                    />
                    {filter && (
                      <button className="icon-button" aria-label="清空筛选" onClick={() => setFilter('')}>
                        <Icon name="close" size={12} />
                      </button>
                    )}
                  </label>
                  <div className="filter-selects">
                    {view.kind !== 'shelf' && view.kind !== 'folder' && (
                      <select
                        className="compact-select"
                        aria-label="按货架筛选"
                        value={shelfFilter}
                        onChange={(e) => setShelfFilter(e.target.value)}
                      >
                        <option value="">全部货架</option>
                        {data.shelves.map((s) => (
                          <option value={s.id} key={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <label className="sort-select">
                      <Icon name="sort" size={14} />
                      <select aria-label="文档排序" value={sort} onChange={(e) => setSort(e.target.value)}>
                        <option value="updated">{view.kind === 'recent' ? '最近访问' : '最近编辑'}</option>
                        <option value="oldest">最早编辑</option>
                        <option value="name">标题顺序</option>
                      </select>
                    </label>
                  </div>
                </div>
                <DocumentList
                  {...listProps}
                  docs={visibleDocs}
                  recent={view.kind === 'recent'}
                  emptyTitle={
                    filter || shelfFilter
                      ? '没有匹配的文档'
                      : view.kind === 'favorites'
                        ? '收藏夹等待第一颗星'
                        : view.kind === 'recent'
                          ? '还没有访问记录'
                          : '这里还没有提示词'
                  }
                  emptyText={
                    filter || shelfFilter
                      ? '尝试其他关键词，或调整货架筛选。'
                      : view.kind === 'favorites'
                        ? '点击文档旁的星标，即可在这里快速找到它。'
                        : view.kind === 'recent'
                          ? '打开一篇提示词，它就会出现在这里。'
                          : '新建一篇提示词，开始记录你的灵感。'
                  }
                  onCreate={
                    !filter && !shelfFilter && view.kind !== 'recent' && view.kind !== 'favorites'
                      ? newDoc
                      : undefined
                  }
                />
              </section>
            </>
          )}
          <footer className="workspace-footer">
            <span className={syncError ? 'sync-error' : ''}>
              <i />
              {pending ? '正在同步更改…' : syncError ? '上次同步未完成' : '所有更改已同步'}
            </span>
            <small>
              PROMPT ARCHIVE <b>/</b> VOL. 01
            </small>
          </footer>
        </div>
      </main>
      {modal === 'settings' && (
        <Settings
          prefs={prefs}
          change={changePrefs}
          onClose={() => setModal(null)}
          replay={() => {
            setModal(null);
            navigate('overview');
            setEntry((v) => v + 1);
            setEntering(true);
          }}
        />
      )}
      {modal === 'search' && (
        <SearchDialog
          data={data}
          onClose={() => setModal(null)}
          onDoc={openDoc}
          onShelf={(id) => navigate('shelf', id)}
          onFolder={(id) => navigate('folder', id)}
        />
      )}
      {entity && (
        <EntityDialog
          key={`${entity.kind}-${entity.id || 'new'}`}
          form={entity}
          data={data}
          mutate={mutate}
          onClose={() => setEntity(null)}
          onSaved={(id) => {
            setEntity(null);
            notify(entity.id ? '归档信息已更新' : entity.kind === 'shelf' ? '新货架已就位' : '文件夹已建立');
            if (!entity.id) navigate(entity.kind, id);
          }}
          onDelete={formDelete}
        />
      )}
      {editor && (
        <DocumentEditor
          key={editor.doc.id}
          {...editor}
          data={data}
          mutate={mutate}
          notify={notify}
          copy={copy}
          onClose={() => setEditor(null)}
        />
      )}
      {menu && (
        <>
          <button className="menu-scrim" aria-label="关闭文档菜单" onClick={() => setMenu(null)} />
          <div className="context-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
            <span className="menu-label">文档操作</span>
            <button
              role="menuitem"
              onClick={() => {
                void copy(assemble(menu.doc.blocks));
                setMenu(null);
              }}
            >
              <Icon name="copy" size={15} />
              复制提示词
            </button>
            <button
              role="menuitem"
              onClick={() => {
                void act({ action: 'duplicate', id: menu.doc.id }, '文档副本已归档');
                setMenu(null);
              }}
            >
              <Icon name="files" size={15} />
              创建副本
            </button>
            <button role="menuitem" onClick={() => openDoc(menu.doc)}>
              <Icon name="edit" size={15} />
              编辑与移动
            </button>
            <div className="menu-divider" />
            <button
              className="danger"
              role="menuitem"
              onClick={() => {
                const doc = menu.doc;
                setMenu(null);
                setConfirm({
                  title: '删除这篇文档？',
                  message: `「${doc.title}」将从仓库中永久移除。此操作无法撤销。`,
                  run: async () => {
                    await mutate({ action: 'deleteDoc', id: doc.id });
                    notify('文档已删除');
                  },
                });
              }}
            >
              <Icon name="trash" size={15} />
              删除文档
            </button>
          </div>
        </>
      )}
      {confirm && (
        <Dialog
          title={confirm.title}
          eyebrow="ARCHIVE CONFIRMATION"
          onClose={() => {
            if (!confirmBusy) setConfirm(null);
          }}
        >
          <p className="dialog-copy">{confirm.message}</p>
          <div className="dialog-footer">
            <button className="button" disabled={confirmBusy} onClick={() => setConfirm(null)}>
              取消
            </button>
            <button
              className="button danger-button"
              disabled={confirmBusy}
              onClick={async () => {
                setConfirmBusy(true);
                try {
                  await confirm.run();
                  setConfirm(null);
                } catch (e) {
                  notify(e instanceof Error ? e.message : '操作失败');
                } finally {
                  setConfirmBusy(false);
                }
              }}
            >
              {confirmBusy ? '正在移除…' : '确认删除'}
            </button>
          </div>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="info" size={15} />
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast('')}>
            <Icon name="close" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
