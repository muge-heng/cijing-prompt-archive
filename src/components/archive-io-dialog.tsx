'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildArchiveBackupJson,
  computeLineDiff,
  docToMarkdownFile,
  downloadBlob,
  downloadTextFile,
  parseArchiveBackupJson,
  parseImportedMarkdownFile,
  renderArchiveCardPng,
} from '@/lib/archive-io';
import {
  estimateTokens,
  type ArchiveData,
  type BlockPreset,
  type DocRevision,
  type PromptBlock,
  type ShelfColor,
} from '@/lib/archive-types';
import { Dialog } from './dialog';
import { Icon } from './icons';
import type { ArchiveMutation } from './editor';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sanitizeFilename(name: string, fallback: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return cleaned || fallback;
}

export function ArchiveBackupDialog({
  data,
  isStaticMode,
  localBytes,
  mutate,
  onClose,
  onImportMarkdownFile,
  notify,
}: {
  data: ArchiveData;
  isStaticMode: boolean;
  localBytes: number;
  mutate: ArchiveMutation;
  onClose: () => void;
  onImportMarkdownFile: (parsed: { title: string; synopsis: string; body: string }) => void;
  notify: (message: string) => void;
}) {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const mdInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [importPreview, setImportPreview] = useState<{ filename: string; archive: ArchiveData } | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleExportJson = () => {
    const today = new Date().toISOString().slice(0, 10);
    downloadTextFile(
      `prompt-archive-backup-${today}.json`,
      buildArchiveBackupJson(data),
      'application/json;charset=utf-8',
    );
    notify('馆藏快照已导出为 JSON');
  };

  const handleJsonFile = async (file: File) => {
    setError('');
    try {
      const text = await file.text();
      const parsed = parseArchiveBackupJson(text);
      setImportPreview({ filename: file.name, archive: parsed });
    } catch (err) {
      setImportPreview(null);
      setError(err instanceof Error ? err.message : '读取备份文件失败。');
    }
  };

  const handleMdFile = async (file: File) => {
    setError('');
    try {
      const text = await file.text();
      const parsed = parseImportedMarkdownFile(file.name, text);
      onImportMarkdownFile(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取 Markdown 文件失败。');
    }
  };

  const applyImport = async () => {
    if (!importPreview || busy) return;
    setBusy(true);
    setError('');
    try {
      await mutate({
        action: 'importArchive',
        mode: importMode,
        archive: importPreview.archive,
      });
      notify(
        importMode === 'replace'
          ? `已覆盖恢复 ${importPreview.archive.documents.length} 篇提示词`
          : `已合并导入 ${importPreview.archive.documents.length} 篇提示词`,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败，请检查数据格式。');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (busy) return;
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await mutate({ action: 'resetArchive' });
      notify('已恢复为初始示例馆藏');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置仓库失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="馆藏备份与迁移"
      eyebrow="ARCHIVE BACKUP & PORTABILITY"
      className="backup-dialog"
      onClose={() => !busy && onClose()}
    >
      <div className="backup-body">
        <div className="backup-summary-strip">
          <div>
            <b>{data.shelves.length}</b>
            <span>货架</span>
          </div>
          <div>
            <b>{data.folders.length}</b>
            <span>文件夹</span>
          </div>
          <div>
            <b>{data.documents.length}</b>
            <span>提示词</span>
          </div>
          <div>
            <b>{(data.presets || []).length}</b>
            <span>预设</span>
          </div>
          {isStaticMode && (
            <div>
              <b>{formatBytes(localBytes)}</b>
              <span>本地缓存</span>
            </div>
          )}
        </div>

        <section className="backup-section">
          <div className="backup-section-head">
            <div>
              <h3>导出完整快照（JSON）</h3>
              <p>完整保留货架、文件夹、提示词、自定义预设、修订历史与调试样片，便于跨设备迁移。</p>
            </div>
            <button type="button" className="button primary" onClick={handleExportJson} disabled={busy}>
              <Icon name="download" size={14} />
              导出快照
            </button>
          </div>
        </section>

        <section className="backup-section">
          <div className="backup-section-head">
            <div>
              <h3>导入或恢复馆藏</h3>
              <p>选择或拖入此前导出的 `.json` 备份文件，支持无损合并与整仓覆盖。</p>
            </div>
            <button
              type="button"
              className="button small"
              onClick={() => mdInputRef.current?.click()}
              disabled={busy}
            >
              <Icon name="file" size={13} />
              导入 .md 新建
            </button>
          </div>

          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleJsonFile(file);
              e.target.value = '';
            }}
          />
          <input
            ref={mdInputRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleMdFile(file);
              e.target.value = '';
            }}
          />

          <div
            className={`import-dropzone ${dragActive ? 'is-dragover' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const file = e.dataTransfer.files?.[0];
              if (!file) return;
              if (/\.(md|markdown|txt)$/i.test(file.name)) {
                void handleMdFile(file);
              } else {
                void handleJsonFile(file);
              }
            }}
          >
            <Icon name="upload" size={20} />
            <strong>点击选择备份文件，或将 .json / .md 拖放到此处</strong>
            <span>单篇 .md 文件将直接送入智能解析工作台新建提示词</span>
            <button
              type="button"
              className="button small"
              disabled={busy}
              onClick={() => jsonInputRef.current?.click()}
            >
              选择 .json 备份文件
            </button>
          </div>

          {importPreview && (
            <div className="import-preview-card">
              <div className="import-preview-head">
                <strong>已解析：{importPreview.filename}</strong>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setImportPreview(null)}
                >
                  清除
                </button>
              </div>
              <p className="import-preview-stats">
                包含 {importPreview.archive.shelves.length} 个货架 · {importPreview.archive.folders.length} 个文件夹 ·{' '}
                {importPreview.archive.documents.length} 篇提示词 · {(importPreview.archive.presets || []).length}{' '}
                个自定义预设
              </p>
              <div className="import-mode-group" role="radiogroup" aria-label="导入模式">
                <button
                  type="button"
                  role="radio"
                  aria-checked={importMode === 'merge'}
                  className={importMode === 'merge' ? 'selected' : ''}
                  onClick={() => setImportMode('merge')}
                >
                  合并到现有仓库（保留当前条目，冲突自动重编）
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={importMode === 'replace'}
                  className={importMode === 'replace' ? 'selected' : ''}
                  onClick={() => setImportMode('replace')}
                >
                  覆盖当前仓库（完整还原为备份内容）
                </button>
              </div>
              <div className="import-confirm-row">
                <button
                  type="button"
                  className="button primary"
                  disabled={busy}
                  onClick={() => void applyImport()}
                >
                  {busy ? '正在导入…' : importMode === 'replace' ? '确认覆盖恢复' : '确认合并导入'}
                </button>
              </div>
            </div>
          )}
        </section>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="dialog-footer">
        <button
          type="button"
          className="text-button danger left-action"
          disabled={busy}
          onClick={() => void handleReset()}
        >
          <Icon name="refresh" size={13} />
          {confirmReset ? '再次点击确认恢复默认示例' : '重置示例仓库'}
        </button>
        <button type="button" className="button primary" disabled={busy} onClick={onClose}>
          完成
        </button>
      </div>
    </Dialog>
  );
}

export function RevisionHistoryDialog({
  docId,
  revisions,
  currentTitle,
  currentSynopsis,
  currentBlocks,
  presets,
  mutate,
  onClose,
  onRestored,
  notify,
}: {
  docId: string;
  revisions: DocRevision[];
  currentTitle: string;
  currentSynopsis: string;
  currentBlocks: PromptBlock[];
  presets: BlockPreset[];
  mutate: ArchiveMutation;
  onClose: () => void;
  onRestored: (rev: DocRevision) => void;
  notify: (message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(revisions[0]?.id || '');
  const [tab, setTab] = useState<'diff' | 'snapshot'>('diff');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selected = revisions.find((r) => r.id === selectedId) || revisions[0];

  const currentMd = useMemo(
    () =>
      docToMarkdownFile(
        { title: currentTitle, synopsis: currentSynopsis, blocks: currentBlocks },
        presets,
      ).trim(),
    [currentTitle, currentSynopsis, currentBlocks, presets],
  );

  const revisionMd = useMemo(
    () =>
      selected
        ? docToMarkdownFile(
            { title: selected.title, synopsis: selected.synopsis, blocks: selected.blocks },
            presets,
          ).trim()
        : '',
    [selected, presets],
  );

  const diffLines = useMemo(
    () => (selected ? computeLineDiff(revisionMd, currentMd) : []),
    [selected, revisionMd, currentMd],
  );

  const handleRestore = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      await mutate({ action: 'restoreRevision', docId, revisionId: selected.id });
      onRestored(selected);
      notify('已回滚至所选修订版本（并自动保留当前草稿为新修订）');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复修订失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="档案修订签"
      eyebrow="REVISION HISTORY"
      className="revision-dialog"
      onClose={() => !busy && onClose()}
    >
      <div className="revision-body">
        {revisions.length && selected ? (
          <div className="revision-layout">
            <aside className="revision-timeline" aria-label="历史修订版本列表">
              {revisions.map((rev, idx) => (
                <button
                  type="button"
                  key={rev.id}
                  className={`revision-item ${rev.id === selected.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(rev.id)}
                >
                  <div className="revision-item-top">
                    <span>#{revisions.length - idx}</span>
                    <time>{formatDateTime(rev.savedAt)}</time>
                  </div>
                  <strong>{rev.title}</strong>
                  <small>{rev.blocks.length} 个模块</small>
                </button>
              ))}
            </aside>
            <div className="revision-detail">
              <div className="revision-detail-bar">
                <div className="revision-tabs" role="tablist" aria-label="修订对比模式">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'diff'}
                    className={tab === 'diff' ? 'selected' : ''}
                    onClick={() => setTab('diff')}
                  >
                    变更对比（旧 → 当前）
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'snapshot'}
                    className={tab === 'snapshot' ? 'selected' : ''}
                    onClick={() => setTab('snapshot')}
                  >
                    当时完整正文
                  </button>
                </div>
                <span className="revision-meta-time">保存于 {formatDateTime(selected.savedAt)}</span>
              </div>
              {tab === 'diff' ? (
                <div className="revision-diff-box">
                  {diffLines.map((line, i) => (
                    <div key={i} className={`diff-line diff-${line.type}`}>
                      <span className="diff-gutter">
                        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                      </span>
                      <span className="diff-text">{line.text || ' '}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="preview-paper revision-snapshot-paper">{revisionMd}</pre>
              )}
            </div>
          </div>
        ) : (
          <div className="preset-manager-empty">
            <Icon name="history" size={26} />
            <strong>暂未留存历史修订签</strong>
            <p>每次保存对现有文档的内容改动时，系统会自动留存改动前快照（单篇最多保存 10 次）。</p>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="dialog-footer">
        <button type="button" className="button" disabled={busy} onClick={onClose}>
          关闭
        </button>
        {selected && (
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => void handleRestore()}
          >
            {busy ? '恢复中…' : '恢复到此版本'}
          </button>
        )}
      </div>
    </Dialog>
  );
}

export function ArchiveCardDialog({
  initialTheme,
  title,
  synopsis,
  shelfName,
  folderName,
  shelfColor,
  templateText,
  compiledText,
  blockCount,
  onClose,
  notify,
}: {
  initialTheme: 'light' | 'dark';
  title: string;
  synopsis: string;
  shelfName: string;
  folderName: string;
  shelfColor: ShelfColor;
  templateText: string;
  compiledText: string;
  blockCount: number;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const hasCompiledDiff = compiledText.trim() !== templateText.trim();
  const [cardTheme, setCardTheme] = useState<'light' | 'dark'>(initialTheme);
  const [sourceMode, setSourceMode] = useState<'template' | 'compiled'>(
    hasCompiledDiff ? 'compiled' : 'template',
  );
  const [rendered, setRendered] = useState<{ key: string; dataUrl: string; blob: Blob } | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null);

  const activeText = sourceMode === 'compiled' ? compiledText : templateText;
  const dateLabel = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const renderKey = `${cardTheme}|${sourceMode}|${title}|${synopsis}|${shelfName}|${folderName}|${shelfColor}|${blockCount}|${activeText}`;
  const error = errorState?.key === renderKey ? errorState.message : '';
  const currentRendered = rendered?.key === renderKey ? rendered : null;
  const rendering = !currentRendered && !error;

  useEffect(() => {
    let cancelled = false;
    renderArchiveCardPng({
      title,
      synopsis,
      shelfName,
      folderName,
      shelfColor,
      promptText: activeText,
      blockCount,
      charCount: activeText.length,
      tokenCount: estimateTokens(activeText),
      theme: cardTheme,
      dateLabel,
    })
      .then((res) => {
        if (!cancelled) {
          setRendered({ key: renderKey, dataUrl: res.dataUrl, blob: res.blob });
          setErrorState(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorState({
            key: renderKey,
            message: err instanceof Error ? err.message : '生成馆藏卡片失败。',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [renderKey, title, synopsis, shelfName, folderName, shelfColor, activeText, blockCount, cardTheme, dateLabel]);

  const handleCopyImage = async () => {
    if (!currentRendered) return;
    try {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        notify('当前浏览器不支持直接复制图片，请点击「下载 PNG」');
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': currentRendered.blob })]);
      notify('馆藏卡片图片已复制到剪贴板');
    } catch {
      notify('未获得剪贴板图片权限，请直接点击「下载 PNG」');
    }
  };

  const handleDownload = () => {
    if (!currentRendered) return;
    downloadBlob(`${sanitizeFilename(title, 'prompt-archive')}-card.png`, currentRendered.blob);
    notify('馆藏卡片 PNG 已开始下载');
  };

  return (
    <Dialog
      title="生成馆藏卡片"
      eyebrow="ARCHIVE CARD EXPORT"
      className="archive-card-dialog"
      onClose={onClose}
    >
      <div className="archive-card-body">
        <div className="archive-card-controls">
          <div className="compose-mode-switch" role="radiogroup" aria-label="卡片主题">
            <button
              type="button"
              role="radio"
              aria-checked={cardTheme === 'light'}
              className={cardTheme === 'light' ? 'selected' : ''}
              onClick={() => setCardTheme('light')}
            >
              <Icon name="sun" size={13} />
              暖纸日光
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={cardTheme === 'dark'}
              className={cardTheme === 'dark' ? 'selected' : ''}
              onClick={() => setCardTheme('dark')}
            >
              <Icon name="moon" size={13} />
              深夜书房
            </button>
          </div>
          {hasCompiledDiff && (
            <div className="compose-mode-switch" role="radiogroup" aria-label="卡片内容">
              <button
                type="button"
                role="radio"
                aria-checked={sourceMode === 'compiled'}
                className={sourceMode === 'compiled' ? 'selected' : ''}
                onClick={() => setSourceMode('compiled')}
              >
                调试成稿
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={sourceMode === 'template'}
                className={sourceMode === 'template' ? 'selected' : ''}
                onClick={() => setSourceMode('template')}
              >
                原始模板
              </button>
            </div>
          )}
        </div>

        <div className="archive-card-preview">
          {rendering ? (
            <div className="archive-card-loading">正在绘制双倍精度馆藏卡片…</div>
          ) : currentRendered ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentRendered.dataUrl} alt={`${title || '提示词'}馆藏卡片预览`} />
          ) : null}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="dialog-footer">
        <button
          type="button"
          className="button"
          onClick={() => void handleCopyImage()}
          disabled={!currentRendered}
        >
          <Icon name="copy" size={14} />
          复制图片
        </button>
        <button
          type="button"
          className="button primary"
          onClick={handleDownload}
          disabled={!currentRendered}
        >
          <Icon name="download" size={14} />
          下载 PNG 卡片
        </button>
      </div>
    </Dialog>
  );
}
