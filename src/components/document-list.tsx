'use client';
import type { CSSProperties } from 'react';
import { assemble, type ArchiveData, type PromptDoc } from '@/lib/archive-types';
import { Icon } from './icons';
export function since(iso: string, now: number) {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  if (mins < 1440) return `${Math.floor(mins / 60)} 小时前`;
  if (mins < 10080) return `${Math.floor(mins / 1440)} 天前`;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(iso));
}
export function PaperGlyph({ color = 'moss' }: { color?: string }) {
  return (
    <span className={`paper-glyph tone-${color}`} aria-hidden="true">
      <svg viewBox="0 0 30 36" fill="none">
        <path d="M4 2.5h15.4L26 9v24H4z" fill="var(--glyph-paper)" stroke="currentColor" strokeWidth="1.2" />
        <path d="M19 3v6.4h6.5" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M8.5 13.5h12 M8.5 17.5h12 M8.5 21.5h8 M8.5 25.5h10.5"
          stroke="currentColor"
          strokeWidth="1.15"
          opacity=".8"
        />
      </svg>
    </span>
  );
}
export function DocumentList({
  docs,
  data,
  now,
  onOpen,
  onFavorite,
  onMenu,
  onCopy,
  emptyTitle = '这里还没有提示词',
  emptyText = '新建一篇提示词，开始整理你的第一份灵感。',
  onCreate,
  recent = false,
}: {
  docs: PromptDoc[];
  data: ArchiveData;
  now: number;
  onOpen: (doc: PromptDoc) => void;
  onFavorite: (doc: PromptDoc) => void;
  onMenu: (doc: PromptDoc, rect: DOMRect) => void;
  onCopy: (value: string) => Promise<void>;
  emptyTitle?: string;
  emptyText?: string;
  onCreate?: () => void;
  recent?: boolean;
}) {
  if (!docs.length)
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <Icon name="drawer" size={36} />
        </div>
        <h3>{emptyTitle}</h3>
        <p>{emptyText}</p>
        {onCreate && (
          <button className="button" onClick={onCreate}>
            <Icon name="plus" size={15} />
            新建提示词
          </button>
        )}
      </div>
    );
  return (
    <div className="document-table" role="table" aria-label="提示词文档列表">
      <div className="document-head" role="row">
        <span role="columnheader">文档名称</span>
        <span role="columnheader">所属货架</span>
        <span role="columnheader">{recent ? '访问时间' : '最近编辑'}</span>
        <span role="columnheader" className="action-column-title">
          操作
        </span>
      </div>
      {docs.map((doc, index) => {
        const folder = data.folders.find((f) => f.id === doc.folderId);
        const shelf = data.shelves.find((s) => s.id === folder?.shelfId);
        return (
          <div
            className="document-row"
            role="row"
            key={doc.id}
            style={{ '--row-index': Math.min(index, 12) } as CSSProperties}
          >
            <div role="cell" className="document-title-cell">
              <button className="document-open" onClick={() => onOpen(doc)}>
                <PaperGlyph color={shelf?.color} />
                <span className="document-name">
                  <strong>{doc.title}</strong>
                  <small>
                    <Icon name="folder" size={11} />
                    {folder?.name || '未归档'}
                  </small>
                </span>
              </button>
            </div>
            <div role="cell" className="shelf-cell">
              <span className={`shelf-tag tone-${shelf?.color}`}>
                <i />
                {shelf?.name}
              </span>
            </div>
            <span role="cell" className="document-date">
              {since(recent && doc.lastOpened ? doc.lastOpened : doc.updatedAt, now)}
            </span>
            <div role="cell" className="row-actions">
              <button
                className="icon-button quick-copy"
                title="一键复制提示词"
                aria-label={`复制${doc.title}`}
                onClick={() => void onCopy(assemble(doc.blocks))}
              >
                <Icon name="copy" size={14} />
              </button>
              <button
                className={`icon-button star-button ${doc.favorite ? 'is-favorite' : ''}`}
                aria-label={`${doc.favorite ? '取消收藏' : '收藏'}${doc.title}`}
                aria-pressed={doc.favorite}
                onClick={() => onFavorite(doc)}
              >
                <Icon name="star" size={16} />
              </button>
              <button
                className="icon-button"
                aria-label={`${doc.title}的更多操作`}
                onClick={(e) => onMenu(doc, e.currentTarget.getBoundingClientRect())}
              >
                <Icon name="more" size={17} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
