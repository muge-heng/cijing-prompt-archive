'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  assemble,
  assembleFormatted,
  blockLabels,
  blockTemplates,
  blockTitle,
  estimateTokens,
  parseVariables,
  renderPrompt,
  renderPromptSegments,
  uid,
  type ArchiveData,
  type BlockPreset,
  type BuiltinBlockKind,
  type CopyFormat,
  type DocRevision,
  type PromptBlock,
  type PromptDoc,
  type ShelfColor,
} from '@/lib/archive-types';
import {
  applyHeadingResolutions,
  blocksToMarkdown,
  isBuiltinLabelCollision,
  normalizeHeading,
  parseFullTextPrompt,
  type FullTextParseResult,
  type HeadingResolution,
} from '@/lib/archive-markdown';
import { docToMarkdownFile, downloadTextFile } from '@/lib/archive-io';
import { Icon } from './icons';
import { Dialog, Overlay } from './dialog';
import { ArchiveSelect, type SelectOption } from './archive-select';
import { PresetDialog, PresetManagerDialog, UnmatchedBlocksDialog } from './preset-dialog';
import { ArchiveCardDialog, RevisionHistoryDialog } from './archive-io-dialog';

export type ArchiveMutation = (body: Record<string, unknown>) => Promise<string | null>;
export type CopyText = (text: string, message?: string) => Promise<void>;
type WorkbenchMode = 'split' | 'edit' | 'test';
type ComposeMode = 'blocks' | 'fulltext';

const copyFormatOptions: { value: CopyFormat; label: string }[] = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'plain', label: '纯文本' },
  { value: 'messages', label: 'System / User' },
];

export function DocumentEditor({
  doc,
  isNew,
  data,
  theme,
  initialComposeMode = 'blocks',
  initialFullText,
  mutate,
  onClose,
  notify,
  copy,
}: {
  doc: PromptDoc;
  isNew: boolean;
  data: ArchiveData;
  theme: 'light' | 'dark';
  initialComposeMode?: ComposeMode;
  initialFullText?: string;
  mutate: ArchiveMutation;
  onClose: () => void;
  notify: (message: string) => void;
  copy: CopyText;
}) {
  const presets = data.presets || [];
  const docRevisions = data.revisions?.[doc.id] || [];
  const docTestCases = data.testCases?.[doc.id] || [];

  const [savedDoc, setSavedDoc] = useState<PromptDoc>(doc),
    [title, setTitle] = useState(doc.title),
    [synopsis, setSynopsis] = useState(doc.synopsis),
    [folderId, setFolderId] = useState(doc.folderId),
    [blocks, setBlocks] = useState<PromptBlock[]>(doc.blocks.map((b) => ({ ...b })));
  const [mode, setMode] = useState<WorkbenchMode>(() =>
      typeof window !== 'undefined' && window.innerWidth < 1024 ? 'edit' : 'split',
    ),
    [composeMode, setComposeMode] = useState<ComposeMode>(initialComposeMode),
    [fullText, setFullText] = useState(
      () => initialFullText ?? blocksToMarkdown(doc.blocks, data.presets || []),
    ),
    [fullTextDirty, setFullTextDirty] = useState(Boolean(initialComposeMode === 'fulltext' && initialFullText));
  const [adding, setAdding] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [discard, setDiscard] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({}),
    [tested, setTested] = useState(false),
    [copyFormat, setCopyFormat] = useState<CopyFormat>('markdown');
  const [savingCase, setSavingCase] = useState(false),
    [caseName, setCaseName] = useState(''),
    [caseBusy, setCaseBusy] = useState(false);

  const [dragArmedId, setDragArmedId] = useState<string | null>(null),
    [draggingId, setDraggingId] = useState<string | null>(null),
    [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null);

  const [revisionModalOpen, setRevisionModalOpen] = useState(false),
    [cardModalOpen, setCardModalOpen] = useState(false);

  const blockTextareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map()),
    fulltextTextareaRef = useRef<HTMLTextAreaElement>(null),
    lastFocusTarget = useRef<string | null>(null);

  const [presetForm, setPresetForm] = useState<{
    preset?: BlockPreset;
    initialName?: string;
    initialTemplate?: string;
    initialColor?: ShelfColor;
    allowInsert?: boolean;
    bindBlockId?: string;
  } | null>(null);
  const [presetManagerOpen, setPresetManagerOpen] = useState(false);
  const [unmatchedModal, setUnmatchedModal] = useState<{
    parsed: FullTextParseResult;
    saveAfter: boolean;
  } | null>(null);
  const [unmatchedBusy, setUnmatchedBusy] = useState(false);
  const [unmatchedError, setUnmatchedError] = useState('');

  const parsedFullText = composeMode === 'fulltext' ? parseFullTextPrompt(fullText, blocks, presets) : null;
  const effectiveBlocks = parsedFullText ? parsedFullText.previewBlocks : blocks;

  const raw = assemble(effectiveBlocks, presets),
    rawFormatted = assembleFormatted(effectiveBlocks, presets, copyFormat),
    varSpecs = parseVariables(raw),
    keys = varSpecs.map((v) => v.name),
    compiled = renderPrompt(rawFormatted, values, true),
    compiledMarkdown = renderPrompt(raw, values, true),
    previewSegments = renderPromptSegments(rawFormatted, values, true),
    tokenCount = estimateTokens(compiled),
    missingSpecs = varSpecs.filter((s) => !values[s.name]?.trim() && !s.defaultValue),
    defaultUsedCount = varSpecs.filter((s) => !values[s.name]?.trim() && Boolean(s.defaultValue)).length,
    hasValues = keys.some((k) => Boolean(values[k]));

  const dirty =
    title !== savedDoc.title ||
    synopsis !== savedDoc.synopsis ||
    folderId !== savedDoc.folderId ||
    JSON.stringify(effectiveBlocks) !== JSON.stringify(savedDoc.blocks) ||
    (composeMode === 'fulltext' &&
      fullTextDirty &&
      fullText.trim() !== blocksToMarkdown(savedDoc.blocks, presets).trim());

  const close = () => {
    if (saving || unmatchedBusy) return;
    if (dirty) setDiscard(true);
    else onClose();
  };

  const performSave = async (blocksToSave: PromptBlock[]) => {
    if (!title.trim()) {
      setError('请先为文档填写标题。');
      setMode((m) => (m === 'test' ? 'edit' : m));
      return;
    }
    if (!blocksToSave.some((b) => b.text.trim())) {
      setError('请至少填写一个模块的内容。');
      setMode((m) => (m === 'test' ? 'edit' : m));
      return;
    }
    if (!folderId) {
      setError('请选择一个归档文件夹。');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await mutate({
        action: 'saveDoc',
        id: isNew ? undefined : doc.id,
        title: title.trim(),
        folderId,
        blocks: blocksToSave,
        synopsis: synopsis.trim(),
      });
      notify(isNew ? '新文档已归档' : '文档更改已保存');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请重试。');
    } finally {
      setSaving(false);
    }
  };

  const resolveAndSyncFullText = (saveAfter: boolean) => {
    const parsed = parseFullTextPrompt(fullText, blocks, presets);
    if (parsed.unmatched.length > 0) {
      setUnmatchedError('');
      setUnmatchedModal({ parsed, saveAfter });
      return;
    }
    const nextBlocks = parsed.blocks;
    setBlocks(nextBlocks);
    setFullTextDirty(false);
    setComposeMode('blocks');
    if (saveAfter) {
      void performSave(nextBlocks);
    } else {
      notify(parsed.overflowMerged ? '已同步为模块（超出 40 个部分已自动合并）' : '已智能解析并同步为模块');
    }
  };

  const handleConfirmUnmatched = async (resolutions: HeadingResolution[]) => {
    if (!unmatchedModal) return;
    const createTargets = resolutions.filter((r) => r.mode === 'create-preset');
    for (const r of resolutions) {
      if (r.mode !== 'keep-text' && !r.name.trim()) {
        setUnmatchedError('请为每个需要新建的模块填写名称。');
        return;
      }
    }
    const seenNew = new Set<string>();
    for (const r of createTargets) {
      const norm = normalizeHeading(r.name).toLowerCase();
      if (isBuiltinLabelCollision(r.name)) {
        setUnmatchedError(`「${r.name.trim()}」与内置模块名称重复，请改名或选择「仅本文档模块」。`);
        return;
      }
      if (presets.some((p) => normalizeHeading(p.name).toLowerCase() === norm)) {
        setUnmatchedError(`预设库中已存在「${r.name.trim()}」，请改名或选择「仅本文档模块」。`);
        return;
      }
      if (seenNew.has(norm)) {
        setUnmatchedError(`本次新建的预设名称「${r.name.trim()}」存在重复。`);
        return;
      }
      seenNew.add(norm);
    }

    setUnmatchedBusy(true);
    setUnmatchedError('');
    try {
      const createdPresetsByIndex: Record<number, BlockPreset> = {};
      for (const r of createTargets) {
        const name = r.name.trim();
        const template = r.template.trim();
        const id = await mutate({
          action: 'createPreset',
          name,
          template,
          color: r.color,
        });
        createdPresetsByIndex[r.index] = {
          id: id || uid(),
          name,
          template,
          color: r.color,
          createdAt: new Date().toISOString(),
        };
      }
      const finalBlocks = applyHeadingResolutions(
        unmatchedModal.parsed,
        resolutions,
        createdPresetsByIndex,
        blocks,
      );
      const shouldSave = unmatchedModal.saveAfter;
      setBlocks(finalBlocks);
      setFullTextDirty(false);
      setUnmatchedModal(null);
      setComposeMode('blocks');
      if (shouldSave) {
        await performSave(finalBlocks);
      } else {
        notify(
          createTargets.length
            ? `已同步模块并新增 ${createTargets.length} 个板块预设`
            : '已完成模块解析并同步',
        );
      }
    } catch (err) {
      setUnmatchedError(err instanceof Error ? err.message : '同步失败，请重试。');
    } finally {
      setUnmatchedBusy(false);
    }
  };

  const switchToFullText = () => {
    if (composeMode === 'fulltext') return;
    setFullText(blocksToMarkdown(blocks, presets));
    setFullTextDirty(false);
    setAdding(false);
    setComposeMode('fulltext');
  };

  const switchToBlocks = () => {
    if (composeMode === 'blocks') return;
    if (!fullTextDirty) {
      setComposeMode('blocks');
      return;
    }
    resolveAndSyncFullText(false);
  };

  const save = async () => {
    if (saving || unmatchedBusy) return;
    if (composeMode === 'fulltext') {
      if (!title.trim()) {
        setError('请先为文档填写标题。');
        setMode((m) => (m === 'test' ? 'edit' : m));
        return;
      }
      if (fullTextDirty) {
        resolveAndSyncFullText(true);
        return;
      }
    }
    await performSave(blocks);
  };

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const onResize = () => {
      if (media.matches) {
        setMode((m) => (m === 'split' ? 'edit' : m));
      }
    };
    media.addEventListener('change', onResize);
    return () => media.removeEventListener('change', onResize);
  }, []);

  useEffect(() => {
    if (!dragArmedId) return;
    const disarm = () => setDragArmedId(null);
    window.addEventListener('pointerup', disarm);
    return () => window.removeEventListener('pointerup', disarm);
  }, [dragArmedId]);

  const reorderBlock = (sourceId: string, targetId: string, position: 'before' | 'after') => {
    if (sourceId === targetId) return;
    setBlocks((prev) => {
      const fromIndex = prev.findIndex((b) => b.id === sourceId);
      if (fromIndex < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      const targetIndex = next.findIndex((b) => b.id === targetId);
      if (targetIndex < 0) return prev;
      next.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, moved);
      return next;
    });
    setTested(false);
  };

  const insertVariableToken = (token: string, selectInner?: { startOffset: number; endOffset: number }) => {
    if (composeMode === 'fulltext') {
      const el = fulltextTextareaRef.current;
      const currentVal = fullText;
      const start = el && typeof el.selectionStart === 'number' ? el.selectionStart : currentVal.length;
      const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd : start;
      const nextVal = `${currentVal.slice(0, start)}${token}${currentVal.slice(end)}`;
      setFullText(nextVal);
      setFullTextDirty(true);
      setTested(false);
      window.requestAnimationFrame(() => {
        const target = fulltextTextareaRef.current;
        if (!target) return;
        target.focus();
        const selStart = selectInner ? start + selectInner.startOffset : start + token.length;
        const selEnd = selectInner ? start + selectInner.endOffset : start + token.length;
        target.setSelectionRange(selStart, selEnd);
      });
      return;
    }

    const fallbackId = blocks[blocks.length - 1]?.id;
    const targetId =
      (lastFocusTarget.current && blocks.some((b) => b.id === lastFocusTarget.current)
        ? lastFocusTarget.current
        : fallbackId) || '';
    if (!targetId) return;
    const el = blockTextareaRefs.current.get(targetId);
    const currentBlock = blocks.find((b) => b.id === targetId);
    if (!currentBlock) return;
    const currentVal = currentBlock.text;
    const start = el && typeof el.selectionStart === 'number' ? el.selectionStart : currentVal.length;
    const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd : start;
    const nextVal = `${currentVal.slice(0, start)}${token}${currentVal.slice(end)}`;
    update(targetId, nextVal);
    window.requestAnimationFrame(() => {
      const target = blockTextareaRefs.current.get(targetId);
      if (!target) return;
      target.focus();
      const selStart = selectInner ? start + selectInner.startOffset : start + token.length;
      const selEnd = selectInner ? start + selectInner.endOffset : start + token.length;
      target.setSelectionRange(selStart, selEnd);
    });
  };

  const handleSaveTestCase = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = caseName.trim();
    if (!trimmed || isNew || caseBusy) return;
    setCaseBusy(true);
    setError('');
    try {
      await mutate({
        action: 'saveTestCase',
        docId: doc.id,
        name: trimmed,
        values,
      });
      setCaseName('');
      setSavingCase(false);
      notify(`已保存样片「${trimmed}」`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存样片失败。');
    } finally {
      setCaseBusy(false);
    }
  };

  const handleDeleteTestCase = async (caseId: string, name: string) => {
    if (isNew || caseBusy) return;
    setCaseBusy(true);
    try {
      await mutate({ action: 'deleteTestCase', docId: doc.id, id: caseId });
      notify(`已移除样片「${name}」`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除样片失败。');
    } finally {
      setCaseBusy(false);
    }
  };

  const handleExportMd = () => {
    const markdown = docToMarkdownFile(
      {
        title: title.trim() || '未命名提示词',
        synopsis: synopsis.trim(),
        blocks: effectiveBlocks,
      },
      presets,
    );
    const filename = `${(title.trim() || 'prompt').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60)}.md`;
    downloadTextFile(filename, markdown, 'text/markdown;charset=utf-8');
    notify('已导出为 Markdown 文件');
  };

  const handleRestoredRevision = (rev: DocRevision) => {
    const clonedBlocks = rev.blocks.map((b) => ({ ...b }));
    setSavedDoc((prev) => ({
      ...prev,
      title: rev.title,
      synopsis: rev.synopsis,
      blocks: clonedBlocks.map((b) => ({ ...b })),
    }));
    setTitle(rev.title);
    setSynopsis(rev.synopsis);
    setBlocks(clonedBlocks);
    setFullText(blocksToMarkdown(clonedBlocks, presets));
    setFullTextDirty(false);
    setTested(false);
  };

  const update = (id: string, text: string) => {
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, text } : b)));
    setTested(false);
  };
  const move = (i: number, delta: number) =>
    setBlocks((bs) => {
      const n = [...bs];
      [n[i], n[i + delta]] = [n[i + delta], n[i]];
      return n;
    });
  const addBuiltin = (kind: BuiltinBlockKind) => {
    if (blocks.length >= 40) {
      notify('每篇提示词最多包含 40 个模块');
      return;
    }
    setBlocks((bs) => [...bs, { id: uid(), kind, text: blockTemplates[kind] }]);
    setAdding(false);
  };
  const addPresetBlock = (preset: BlockPreset) => {
    if (blocks.length >= 40) {
      notify('每篇提示词最多包含 40 个模块');
      return;
    }
    setBlocks((bs) => [
      ...bs,
      {
        id: uid(),
        kind: 'custom',
        presetId: preset.id,
        label: preset.name,
        color: preset.color,
        text: preset.template,
      },
    ]);
    setAdding(false);
  };

  const folder = data.folders.find((f) => f.id === folderId),
    shelf = data.shelves.find((s) => s.id === folder?.shelfId);
  const folderOptions: SelectOption[] = data.shelves.flatMap((s) =>
    data.folders
      .filter((f) => f.shelfId === s.id)
      .map((f) => ({
        value: f.id,
        label: f.name,
        group: s.name,
        tone: s.color,
      })),
  );

  return (
    <>
      <Overlay label={isNew ? '新建提示词' : '提示词工作台'} className="editor-overlay" onClose={close}>
        <header className="editor-header">
          <div className="editor-top">
            <div className="editor-top-left">
              <span className="eyebrow">
                <Icon name="notebook" size={14} /> DOCUMENT WORKBENCH
              </span>
              <span className="editor-path-sep" aria-hidden="true">
                /
              </span>
              <div className="editor-path">
                <Icon name="shelf" size={13} />
                <span>{shelf?.name}</span>
                <Icon name="chevron" size={11} />
                <span>{folder?.name}</span>
              </div>
              <span className={`save-state ${dirty || isNew ? 'unsaved' : ''}`}>
                <i />
                {dirty ? '尚未保存' : isNew ? '新草稿' : '已归档'}
              </span>
              {!isNew && (
                <button
                  type="button"
                  className="revision-trigger-btn"
                  onClick={() => setRevisionModalOpen(true)}
                  title="查看历史修订签与版本对比"
                >
                  <Icon name="history" size={12} />
                  <span>修订签</span>
                  {docRevisions.length > 0 && <small>{docRevisions.length}</small>}
                </button>
              )}
            </div>

            <div className="editor-top-right">
              <div className="editor-tabs" role="tablist" aria-label="工作台视图">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'edit'}
                  className={mode === 'edit' ? 'selected' : ''}
                  onClick={() => setMode('edit')}
                >
                  <Icon name="pen" size={14} />
                  <span>仅编辑</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'split'}
                  className={`split-only-tab ${mode === 'split' ? 'selected' : ''}`}
                  onClick={() => setMode('split')}
                >
                  <Icon name="panel" size={14} />
                  <span>双栏对照</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'test'}
                  className={mode === 'test' ? 'selected' : ''}
                  onClick={() => setMode('test')}
                >
                  <Icon name="test" size={14} />
                  <span>仅调试</span>
                  {keys.length > 0 && <small>{keys.length}</small>}
                </button>
              </div>
              <button type="button" className="icon-button" aria-label="关闭编辑器" onClick={close}>
                <Icon name="close" />
              </button>
            </div>
          </div>

          <div className="editor-meta-row">
            <div className="editor-title-stack">
              <input
                data-autofocus={isNew ? true : undefined}
                className="editor-title-input"
                aria-label="文档标题"
                placeholder="为这份灵感命名…"
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <input
                className="editor-synopsis-input"
                aria-label="文档摘要"
                placeholder="写一句简短说明或适用场景…"
                maxLength={300}
                value={synopsis}
                onChange={(e) => setSynopsis(e.target.value)}
              />
            </div>

            <div className="editor-location-control">
              <span className="editor-location-label">归档位置</span>
              <ArchiveSelect
                ariaLabel="归档位置"
                icon="folder"
                align="right"
                compact
                value={folderId}
                onChange={setFolderId}
                options={folderOptions}
              />
            </div>
          </div>
        </header>

        <div className={`editor-body mode-${mode}`}>
          {mode !== 'test' && (
            <section className="workbench-compose" aria-label="提示词模块编辑区">
              <div className="workbench-compose-inner">
                <div className="compose-toolbar">
                  <div className="compose-mode-switch" role="tablist" aria-label="编写方式">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={composeMode === 'blocks'}
                      className={composeMode === 'blocks' ? 'selected' : ''}
                      onClick={switchToBlocks}
                    >
                      <Icon name="layers" size={13} />
                      模块拼装
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={composeMode === 'fulltext'}
                      className={composeMode === 'fulltext' ? 'selected' : ''}
                      onClick={switchToFullText}
                    >
                      <Icon name="file" size={13} />
                      完整输入
                    </button>
                  </div>
                  <button
                    type="button"
                    className="button small"
                    onClick={() => setPresetManagerOpen(true)}
                  >
                    <Icon name="settings" size={13} />
                    预设库
                    {presets.length > 0 && <span className="preset-count-pill">{presets.length}</span>}
                  </button>
                </div>

                <div className="var-quick-bar" aria-label="快捷变量插入">
                  <span className="var-quick-label">
                    <Icon name="variable" size={12} />
                    快捷变量
                  </span>
                  <div className="var-quick-pills">
                    {varSpecs.map((spec) => (
                      <button
                        type="button"
                        key={spec.name}
                        className="var-pill"
                        title={spec.defaultValue ? `默认值：${spec.defaultValue}` : `插入 {{${spec.name}}}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertVariableToken(`{{${spec.name}}}`)}
                      >
                        {`{{${spec.name}}}`}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="var-pill is-add"
                      title="在光标处插入带默认值的占位变量"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertVariableToken('{{变量名:默认值}}', { startOffset: 2, endOffset: 9 })}
                    >
                      + 新变量
                    </button>
                  </div>
                </div>

                {composeMode === 'blocks' ? (
                  <>
                    <div className="mini-section">
                      <h3>
                        提示词模块 <span>{String(blocks.length).padStart(2, '0')}</span>
                      </h3>
                      <span className="subtle">使用 {'{{变量}}'} 创建可替换字段</span>
                    </div>
                    <div className="blocks">
                      {blocks.map((block, i) => {
                        const label = blockTitle(block, presets);
                        const isCustom = block.kind === 'custom';
                        const normLabel = normalizeHeading(label).toLowerCase();
                        const canPromoteToPreset =
                          isCustom &&
                          !isBuiltinLabelCollision(label) &&
                          !presets.some((p) => p.id === block.presetId || normalizeHeading(p.name).toLowerCase() === normLabel);

                        const isDropBefore =
                          dropTarget?.id === block.id && dropTarget.position === 'before';
                        const isDropAfter =
                          dropTarget?.id === block.id && dropTarget.position === 'after';

                        return (
                          <section
                            className={`prompt-block block-${block.kind} ${isCustom ? `tone-${block.color || 'ochre'}` : ''} ${draggingId === block.id ? 'is-dragging' : ''} ${isDropBefore ? 'is-drop-before' : ''} ${isDropAfter ? 'is-drop-after' : ''}`}
                            key={block.id}
                            draggable={dragArmedId === block.id}
                            onDragStart={(e) => {
                              setDraggingId(block.id);
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', block.id);
                            }}
                            onDragOver={(e) => {
                              if (!draggingId || draggingId === block.id) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              const rect = e.currentTarget.getBoundingClientRect();
                              const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
                              setDropTarget((prev) =>
                                prev?.id === block.id && prev.position === pos
                                  ? prev
                                  : { id: block.id, position: pos },
                              );
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (!draggingId || draggingId === block.id) return;
                              const rect = e.currentTarget.getBoundingClientRect();
                              const pos =
                                dropTarget?.id === block.id
                                  ? dropTarget.position
                                  : e.clientY - rect.top < rect.height / 2
                                    ? 'before'
                                    : 'after';
                              reorderBlock(draggingId, block.id, pos);
                              setDraggingId(null);
                              setDropTarget(null);
                              setDragArmedId(null);
                            }}
                            onDragEnd={() => {
                              setDraggingId(null);
                              setDropTarget(null);
                              setDragArmedId(null);
                            }}
                          >
                            <div className="block-heading">
                              <span
                                className="block-drag-handle"
                                title="按住拖拽排序"
                                aria-hidden="true"
                                onPointerDown={() => setDragArmedId(block.id)}
                              >
                                <Icon name="grip" size={13} />
                              </span>
                              <span className="block-number">{String(i + 1).padStart(2, '0')}</span>
                              <strong>{label}</strong>
                              {isCustom && <span className="custom-block-tag">自定义</span>}
                              <div className="block-controls">
                                {canPromoteToPreset && (
                                  <button
                                    type="button"
                                    className="text-button block-promote-btn"
                                    title="将该模块存为可复用预设"
                                    onClick={() =>
                                      setPresetForm({
                                        initialName: label,
                                        initialTemplate: block.text,
                                        initialColor: block.color || 'ochre',
                                        allowInsert: false,
                                        bindBlockId: block.id,
                                      })
                                    }
                                  >
                                    存为预设
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="icon-button"
                                  aria-label={`上移${label}`}
                                  disabled={!i}
                                  onClick={() => move(i, -1)}
                                >
                                  <Icon name="up" size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-button"
                                  aria-label={`下移${label}`}
                                  disabled={i === blocks.length - 1}
                                  onClick={() => move(i, 1)}
                                >
                                  <Icon name="down" size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-button"
                                  aria-label={`移除${label}`}
                                  disabled={blocks.length === 1}
                                  onClick={() => setBlocks((bs) => bs.filter((b) => b.id !== block.id))}
                                >
                                  <Icon name="trash" size={13} />
                                </button>
                              </div>
                            </div>
                            <textarea
                              ref={(el) => {
                                if (el) blockTextareaRefs.current.set(block.id, el);
                                else blockTextareaRefs.current.delete(block.id);
                              }}
                              aria-label={`${label}内容`}
                              value={block.text}
                              rows={Math.min(10, Math.max(3, Math.ceil(block.text.length / 44)))}
                              maxLength={30000}
                              placeholder="写下模块内容，用 {{变量名}} 或 {{变量名:默认值}} 保留可替换字段…"
                              onFocus={() => {
                                lastFocusTarget.current = block.id;
                              }}
                              onChange={(e) => update(block.id, e.target.value)}
                            />
                          </section>
                        );
                      })}
                    </div>
                    <div className="add-block-area">
                      <button
                        type="button"
                        className="add-block-button"
                        onClick={() => setAdding(!adding)}
                        aria-expanded={adding}
                      >
                        <Icon name="plus" size={16} />
                        拼装一个模块
                        <Icon name="down" size={13} />
                      </button>
                      {adding && (
                        <div className="module-palette-panel">
                          <div className="palette-group-label">内置模块</div>
                          <div className="module-palette">
                            {(Object.keys(blockLabels) as BuiltinBlockKind[]).map((k) => (
                              <button type="button" key={k} onClick={() => addBuiltin(k)}>
                                <Icon
                                  name={
                                    k === 'format'
                                      ? 'file'
                                      : k === 'rules'
                                        ? 'check'
                                        : k === 'role'
                                          ? 'shelfSingle'
                                          : k === 'context'
                                            ? 'folder'
                                            : 'pen'
                                  }
                                  size={15}
                                />
                                {blockLabels[k]}
                              </button>
                            ))}
                          </div>
                          <div className="palette-custom-header">
                            <span className="palette-group-label">我的板块预设</span>
                            <div className="palette-footer-actions">
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => setPresetManagerOpen(true)}
                              >
                                管理预设
                              </button>
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => setPresetForm({ allowInsert: true })}
                              >
                                <Icon name="plus" size={12} />
                                新建板块预设
                              </button>
                            </div>
                          </div>
                          {presets.length ? (
                            <div className="palette-custom-grid">
                              {presets.map((preset) => (
                                <button
                                  type="button"
                                  key={preset.id}
                                  className="palette-preset-btn"
                                  onClick={() => addPresetBlock(preset)}
                                >
                                  <span className={`select-tone-dot tone-${preset.color}`} aria-hidden="true" />
                                  <span>{preset.name}</span>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="palette-empty-cta"
                              onClick={() => setPresetForm({ allowInsert: true })}
                            >
                              <Icon name="plus" size={14} />
                              添加你的第一个可复用板块预设（如「示例参考」「思维链」）
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="fulltext-editor">
                    <div className="mini-section">
                      <h3>
                        Markdown 完整输入 <span>{parsedFullText?.previewBlocks.length || 0} 段</span>
                      </h3>
                      <span className="subtle">使用 ## 标题 自动识别并匹配模块</span>
                    </div>
                    <textarea
                      ref={fulltextTextareaRef}
                      className="field fulltext-textarea"
                      aria-label="完整提示词输入"
                      rows={16}
                      value={fullText}
                      placeholder={
                        '可直接粘贴或一次编写完整提示词，例如：\n\n## 角色设定\n你是一位资深产品文案编辑。\n\n## 任务描述\n围绕「{{主题:新品发布}}」撰写一段产品介绍。\n\n## 示例参考\n（未匹配到的标题将在同步或保存时提示快速新建为模块或预设）'
                      }
                      onFocus={() => {
                        lastFocusTarget.current = 'fulltext';
                      }}
                      onChange={(e) => {
                        setFullText(e.target.value);
                        setFullTextDirty(true);
                        setTested(false);
                      }}
                    />
                    {parsedFullText && (parsedFullText.matchedLabels.length > 0 || parsedFullText.unmatched.length > 0) && (
                      <div className="parse-chips" aria-label="标题解析预览">
                        {parsedFullText.matchedLabels.map((label) => (
                          <span className="parse-chip matched" key={`m-${label}`}>
                            <Icon name="check" size={11} />
                            {label}
                          </span>
                        ))}
                        {parsedFullText.unmatched.map((item) => (
                          <span className="parse-chip unmatched" key={`u-${item.index}`}>
                            <Icon name="plus" size={11} />
                            {item.heading} · 待新建
                          </span>
                        ))}
                      </div>
                    )}
                    {parsedFullText && parsedFullText.unmatched.length > 0 ? (
                      <div className="unmatched-callout" role="status">
                        <div>
                          <strong>检测到 {parsedFullText.unmatched.length} 个未匹配现有板块的 Markdown 标题</strong>
                          <p>可立即根据本次正文内容新建为模块，并一键沉淀至你的预设库。</p>
                        </div>
                        <button
                          type="button"
                          className="button small primary"
                          onClick={() => resolveAndSyncFullText(false)}
                        >
                          解析并处理新模块
                        </button>
                      </div>
                    ) : (
                      fullTextDirty && (
                        <div className="fulltext-sync-bar">
                          <span>所有 Markdown 标题均已匹配，随时可同步回模块化视图。</span>
                          <button
                            type="button"
                            className="button small"
                            onClick={() => resolveAndSyncFullText(false)}
                          >
                            应用并切回模块拼装
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {mode !== 'edit' && (
            <section className="workbench-preview" aria-label="实时预览与变量调试区">
              <div className="workbench-preview-inner">
                <div className="workbench-vars">
                  <div className="workbench-vars-head">
                    <h3>
                      变量调试 <span>{String(keys.length).padStart(2, '0')}</span>
                    </h3>
                    <div className="workbench-vars-actions">
                      {hasValues && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setValues({});
                            setTested(false);
                          }}
                        >
                          清空参数
                        </button>
                      )}
                      <button type="button" className="button small" onClick={() => setTested(true)}>
                        <Icon name="play" size={12} />
                        检查提示词
                      </button>
                    </div>
                  </div>
                  <div className="debug-pill">
                    <Icon name="test" size={14} />
                    <span>支持 {'{{变量:默认值}}'} 语法 · 参数与文本仅在本地编译</span>
                  </div>
                  {varSpecs.length > 0 && (
                    <div className="testcase-bar">
                      <div className="testcase-head">
                        <span>调试样片</span>
                        {!isNew ? (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => setSavingCase((v) => !v)}
                          >
                            {savingCase ? '收起' : '+ 存为样片'}
                          </button>
                        ) : (
                          <small className="testcase-draft-hint">保存文档后可留存样片</small>
                        )}
                      </div>
                      {docTestCases.length > 0 && (
                        <div className="testcase-pills">
                          {docTestCases.map((tc) => (
                            <span className="testcase-pill" key={tc.id}>
                              <button
                                type="button"
                                className="testcase-apply-btn"
                                onClick={() => {
                                  setValues({ ...tc.values });
                                  setTested(false);
                                  notify(`已载入样片「${tc.name}」`);
                                }}
                              >
                                <Icon name="tag" size={11} />
                                {tc.name}
                              </button>
                              <button
                                type="button"
                                className="testcase-del-btn"
                                aria-label={`删除样片${tc.name}`}
                                disabled={caseBusy}
                                onClick={() => void handleDeleteTestCase(tc.id, tc.name)}
                              >
                                <Icon name="close" size={10} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      {savingCase && !isNew && (
                        <form className="testcase-save-form" onSubmit={handleSaveTestCase}>
                          <input
                            className="field"
                            maxLength={24}
                            value={caseName}
                            onChange={(e) => setCaseName(e.target.value)}
                            placeholder="样片名称，如：赛博书店 / 学术场景"
                            required
                          />
                          <button type="submit" className="button small primary" disabled={caseBusy}>
                            {caseBusy ? '保存中…' : '保存'}
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                  {varSpecs.length ? (
                    <div className="variable-list">
                      {varSpecs.map((spec) => (
                        <label className="field-label variable-field" key={spec.name}>
                          <span>
                            <Icon name="variable" size={13} />
                            {spec.name}
                            {spec.defaultValue && (
                              <em className="var-default-badge" title={`未填写时默认使用「${spec.defaultValue}」`}>
                                默认：{spec.defaultValue}
                              </em>
                            )}
                          </span>
                          <textarea
                            className="field"
                            rows={2}
                            placeholder={spec.defaultValue || `输入${spec.name}…`}
                            value={values[spec.name] || ''}
                            onChange={(e) => {
                              setValues((v) => ({ ...v, [spec.name]: e.target.value }));
                              setTested(false);
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="debug-empty">
                      这份提示词暂未包含变量。可在模块中添加 {'{{主题}}'} 或 {'{{主题:默认值}}'} 进行参数化调试。
                    </p>
                  )}
                  {tested && (
                    <div className={`debug-report ${missingSpecs.length || !raw ? 'warning' : ''}`} role="status">
                      <Icon name={missingSpecs.length || !raw ? 'info' : 'check'} size={16} />
                      {!raw
                        ? '提示词内容为空，请先编写模块。'
                        : missingSpecs.length
                          ? `还有 ${missingSpecs.length} 个未设默认值的变量待填写：${missingSpecs.map((s) => s.name).join('、')}`
                          : `检查通过 · ${keys.length} 个变量已解析${defaultUsedCount ? `（含 ${defaultUsedCount} 个默认值）` : ''}，${compiled.length} 字 · 约 ${tokenCount} tokens。`}
                    </div>
                  )}
                </div>

                <div className="workbench-paper-section">
                  <div className="workbench-paper-head">
                    <h3>
                      成稿预览{' '}
                      <span title="按中文约 0.8 token/字、英文约 1 token/3.8 字符估算">
                        {compiled.length} 字 · ~{tokenCount} tok
                      </span>
                    </h3>
                    <div className="workbench-paper-tools">
                      <div className="copy-format-switch" role="radiogroup" aria-label="输出格式">
                        {copyFormatOptions.map((opt) => (
                          <button
                            type="button"
                            key={opt.value}
                            role="radio"
                            aria-checked={copyFormat === opt.value}
                            className={copyFormat === opt.value ? 'selected' : ''}
                            onClick={() => setCopyFormat(opt.value)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          void copy(
                            compiled,
                            copyFormat === 'markdown'
                              ? '调试结果已复制'
                              : `调试结果已按「${copyFormatOptions.find((o) => o.value === copyFormat)?.label}」格式复制`,
                          )
                        }
                      >
                        <Icon name="copy" size={13} />
                        复制结果
                      </button>
                    </div>
                  </div>
                  <pre className="preview-paper" style={{ '--paper-pad': '19px' } as CSSProperties}>
                    {previewSegments.length
                      ? previewSegments.map((seg, i) => {
                          if (seg.kind === 'filled') {
                            return (
                              <mark key={i} className="var-filled" title={`已填入「${seg.varName}」`}>
                                {seg.text}
                              </mark>
                            );
                          }
                          if (seg.kind === 'default') {
                            return (
                              <mark key={i} className="var-default" title={`使用「${seg.varName}」默认值`}>
                                {seg.text}
                              </mark>
                            );
                          }
                          if (seg.kind === 'unresolved') {
                            return (
                              <mark key={i} className="var-missing" title={`待填写变量「${seg.varName}」`}>
                                {seg.text}
                              </mark>
                            );
                          }
                          return seg.text;
                        })
                      : '等待输入提示词内容…'}
                  </pre>
                </div>
              </div>
            </section>
          )}
        </div>

        {error && (
          <p className="form-error editor-error-bar" role="alert">
            {error}
          </p>
        )}

        <footer className="editor-footer">
          <span className="editor-count">
            {effectiveBlocks.length} 个模块 <b>·</b> {raw.length} 字符 <b>·</b> ~{estimateTokens(raw)} tok
            {keys.length > 0 && (
              <>
                {' '}
                <b>·</b> {keys.length} 个变量
              </>
            )}
            <span className="editor-shortcut-hint">⌘ / Ctrl + S 保存</span>
          </span>
          <button
            type="button"
            className="button footer-extra-btn"
            onClick={handleExportMd}
            title="导出为 .md 文件"
          >
            <Icon name="download" size={14} />
            <span>导出 .md</span>
          </button>
          <button
            type="button"
            className="button footer-extra-btn"
            onClick={() => setCardModalOpen(true)}
            title="生成复古馆藏卡片 PNG"
          >
            <Icon name="image" size={14} />
            <span>馆藏卡片</span>
          </button>
          <button
            type="button"
            className="button"
            onClick={() =>
              void copy(
                mode === 'test' ? compiled : rawFormatted,
                copyFormat === 'markdown'
                  ? undefined
                  : `已按「${copyFormatOptions.find((o) => o.value === copyFormat)?.label}」格式复制`,
              )
            }
          >
            <Icon name="copy" size={15} />
            复制{mode === 'test' ? '结果' : '全文'}
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => void save()}
            disabled={saving || unmatchedBusy}
          >
            <Icon name="save" size={15} />
            {saving ? '保存中…' : '保存文档'}
          </button>
        </footer>
      </Overlay>

      {presetManagerOpen && (
        <PresetManagerDialog
          presets={presets}
          onClose={() => setPresetManagerOpen(false)}
          onCreate={() => {
            setPresetManagerOpen(false);
            setPresetForm({ allowInsert: composeMode === 'blocks' });
          }}
          onEdit={(preset) => {
            setPresetManagerOpen(false);
            setPresetForm({ preset });
          }}
          onInsert={
            composeMode === 'blocks'
              ? (preset) => {
                  addPresetBlock(preset);
                  setPresetManagerOpen(false);
                  notify(`已插入「${preset.name}」模块`);
                }
              : undefined
          }
          onDelete={async (preset) => {
            await mutate({ action: 'deletePreset', id: preset.id });
            setBlocks((bs) => bs.map((b) => (b.presetId === preset.id ? { ...b, presetId: undefined } : b)));
            notify(`已移除预设「${preset.name}」`);
          }}
        />
      )}

      {presetForm && (
        <PresetDialog
          preset={presetForm.preset}
          initialName={presetForm.initialName}
          initialTemplate={presetForm.initialTemplate}
          initialColor={presetForm.initialColor}
          allowInsert={presetForm.allowInsert}
          mutate={mutate}
          onClose={() => setPresetForm(null)}
          onSaved={(saved, insertIntoDoc) => {
            const bindBlockId = presetForm.bindBlockId;
            const wasEdit = Boolean(presetForm.preset);
            setPresetForm(null);
            if (wasEdit) {
              setBlocks((bs) =>
                bs.map((b) =>
                  b.presetId === saved.id ? { ...b, label: saved.name, color: saved.color } : b,
                ),
              );
              notify(`预设「${saved.name}」已更新`);
            } else if (bindBlockId) {
              setBlocks((bs) =>
                bs.map((b) =>
                  b.id === bindBlockId
                    ? { ...b, presetId: saved.id, label: saved.name, color: saved.color }
                    : b,
                ),
              );
              notify(`已将模块存入预设「${saved.name}」`);
            } else {
              if (insertIntoDoc && composeMode === 'blocks') {
                addPresetBlock(saved);
                notify(`已保存并插入预设「${saved.name}」`);
              } else {
                notify(`已创建预设「${saved.name}」`);
              }
            }
          }}
          onDeleted={(deletedId) => {
            setPresetForm(null);
            setBlocks((bs) => bs.map((b) => (b.presetId === deletedId ? { ...b, presetId: undefined } : b)));
            notify('板块预设已删除');
          }}
        />
      )}

      {unmatchedModal && (
        <UnmatchedBlocksDialog
          unmatched={unmatchedModal.parsed.unmatched}
          saveAfter={unmatchedModal.saveAfter}
          busy={unmatchedBusy}
          error={unmatchedError}
          onClose={() => setUnmatchedModal(null)}
          onConfirm={handleConfirmUnmatched}
        />
      )}

      {revisionModalOpen && !isNew && (
        <RevisionHistoryDialog
          docId={doc.id}
          revisions={docRevisions}
          currentTitle={title}
          currentSynopsis={synopsis}
          currentBlocks={effectiveBlocks}
          presets={presets}
          mutate={mutate}
          onClose={() => setRevisionModalOpen(false)}
          onRestored={handleRestoredRevision}
          notify={notify}
        />
      )}

      {cardModalOpen && (
        <ArchiveCardDialog
          initialTheme={theme}
          title={title.trim() || '未命名提示词'}
          synopsis={synopsis.trim()}
          shelfName={shelf?.name || '个人词库'}
          folderName={folder?.name || '收件夹'}
          shelfColor={shelf?.color || 'moss'}
          templateText={raw}
          compiledText={compiledMarkdown}
          blockCount={effectiveBlocks.length}
          onClose={() => setCardModalOpen(false)}
          notify={notify}
        />
      )}

      {discard && (
        <Dialog title="离开这份草稿？" eyebrow="UNSAVED CHANGES" onClose={() => setDiscard(false)}>
          <p className="dialog-copy">当前修改尚未保存。继续编辑，或放弃本次修改后离开。</p>
          <div className="dialog-footer">
            <button type="button" className="button" onClick={onClose}>
              放弃修改
            </button>
            <button type="button" className="button primary" onClick={() => setDiscard(false)}>
              继续编辑
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
