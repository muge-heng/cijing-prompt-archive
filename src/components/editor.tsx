'use client';
import { useEffect, useRef, useState } from 'react';
import {
  assemble,
  blockLabels,
  blockTemplates,
  renderPrompt,
  uid,
  variables,
  type ArchiveData,
  type BlockKind,
  type PromptBlock,
  type PromptDoc,
} from '@/lib/archive-types';
import { Icon } from './icons';
import { Dialog, Overlay } from './dialog';
import { ArchiveSelect, type SelectOption } from './archive-select';

export type ArchiveMutation = (body: Record<string, unknown>) => Promise<string | null>;
export type CopyText = (text: string, message?: string) => Promise<void>;
type WorkbenchMode = 'split' | 'edit' | 'test';

export function DocumentEditor({
  doc,
  isNew,
  data,
  mutate,
  onClose,
  notify,
  copy,
}: {
  doc: PromptDoc;
  isNew: boolean;
  data: ArchiveData;
  mutate: ArchiveMutation;
  onClose: () => void;
  notify: (message: string) => void;
  copy: CopyText;
}) {
  const [title, setTitle] = useState(doc.title),
    [synopsis, setSynopsis] = useState(doc.synopsis),
    [folderId, setFolderId] = useState(doc.folderId),
    [blocks, setBlocks] = useState<PromptBlock[]>(doc.blocks.map((b) => ({ ...b })));
  const [mode, setMode] = useState<WorkbenchMode>(() =>
      typeof window !== 'undefined' && window.innerWidth < 1024 ? 'edit' : 'split',
    ),
    [adding, setAdding] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [discard, setDiscard] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({}),
    [tested, setTested] = useState(false);

  const raw = assemble(blocks),
    keys = variables(raw),
    compiled = renderPrompt(raw, values),
    missing = keys.filter((k) => !values[k]?.trim()),
    hasValues = keys.some((k) => Boolean(values[k]));
  const dirty =
    title !== doc.title ||
    synopsis !== doc.synopsis ||
    folderId !== doc.folderId ||
    JSON.stringify(blocks) !== JSON.stringify(doc.blocks);

  const close = () => {
    if (saving) return;
    if (dirty) setDiscard(true);
    else onClose();
  };

  const save = async () => {
    if (saving) return;
    if (!title.trim()) {
      setError('请先为文档填写标题。');
      setMode((m) => (m === 'test' ? 'edit' : m));
      return;
    }
    if (!blocks.some((b) => b.text.trim())) {
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
        blocks,
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
  const add = (kind: BlockKind) => {
    if (blocks.length >= 40) {
      notify('每篇提示词最多包含 40 个模块');
      return;
    }
    setBlocks((bs) => [...bs, { id: uid(), kind, text: blockTemplates[kind] }]);
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
            </div>

            <div className="editor-top-right">
              <div className="editor-tabs" role="tablist" aria-label="工作台模式">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'edit'}
                  className={mode === 'edit' ? 'selected' : ''}
                  onClick={() => setMode('edit')}
                >
                  <Icon name="pen" size={14} />
                  <span>模块编辑</span>
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
                  <span>变量调试</span>
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
                <div className="mini-section">
                  <h3>
                    提示词模块 <span>{String(blocks.length).padStart(2, '0')}</span>
                  </h3>
                  <span className="subtle">使用 {'{{变量}}'} 创建可替换字段</span>
                </div>
                <div className="blocks">
                  {blocks.map((block, i) => (
                    <section className={`prompt-block block-${block.kind}`} key={block.id}>
                      <div className="block-heading">
                        <span className="block-number">{String(i + 1).padStart(2, '0')}</span>
                        <strong>{blockLabels[block.kind]}</strong>
                        <div className="block-controls">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`上移${blockLabels[block.kind]}`}
                            disabled={!i}
                            onClick={() => move(i, -1)}
                          >
                            <Icon name="up" size={14} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`下移${blockLabels[block.kind]}`}
                            disabled={i === blocks.length - 1}
                            onClick={() => move(i, 1)}
                          >
                            <Icon name="down" size={14} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`移除${blockLabels[block.kind]}`}
                            disabled={blocks.length === 1}
                            onClick={() => setBlocks((bs) => bs.filter((b) => b.id !== block.id))}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </div>
                      <textarea
                        aria-label={`${blockLabels[block.kind]}内容`}
                        value={block.text}
                        rows={Math.min(10, Math.max(3, Math.ceil(block.text.length / 44)))}
                        maxLength={30000}
                        placeholder="写下模块内容，用 {{变量名}} 保留可替换的位置…"
                        onChange={(e) => update(block.id, e.target.value)}
                      />
                    </section>
                  ))}
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
                    <div className="module-palette">
                      {(Object.keys(blockLabels) as BlockKind[]).map((k) => (
                        <button type="button" key={k} onClick={() => add(k)}>
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
                  )}
                </div>
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
                    <span>本地离线编译 · 参数与文本不会发送给外部模型</span>
                  </div>
                  {keys.length ? (
                    <div className="variable-list">
                      {keys.map((k) => (
                        <label className="field-label variable-field" key={k}>
                          <span>
                            <Icon name="variable" size={13} />
                            {k}
                          </span>
                          <textarea
                            className="field"
                            rows={2}
                            placeholder={`输入${k}…`}
                            value={values[k] || ''}
                            onChange={(e) => {
                              setValues((v) => ({ ...v, [k]: e.target.value }));
                              setTested(false);
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="debug-empty">
                      这份提示词暂未包含变量。可在模块中添加 {'{{主题}}'} 等占位符以进行参数化调试。
                    </p>
                  )}
                  {tested && (
                    <div className={`debug-report ${missing.length || !raw ? 'warning' : ''}`} role="status">
                      <Icon name={missing.length || !raw ? 'info' : 'check'} size={16} />
                      {!raw
                        ? '提示词内容为空，请先编写模块。'
                        : missing.length
                          ? `还有 ${missing.length} 个变量未填写：${missing.join('、')}`
                          : `检查通过 · ${keys.length} 个变量已解析，${compiled.length} 个字符。`}
                    </div>
                  )}
                </div>

                <div className="workbench-paper-section">
                  <div className="workbench-paper-head">
                    <h3>
                      成稿预览 <span>{compiled.length} 字</span>
                    </h3>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => void copy(compiled, '调试结果已复制')}
                    >
                      <Icon name="copy" size={13} />
                      复制结果
                    </button>
                  </div>
                  <pre className="preview-paper">
                    {compiled
                      ? compiled
                          .split(/(\{\{[^{}]+\}\})/g)
                          .map((p, i) => (p.startsWith('{{') ? <mark key={i}>{p}</mark> : p))
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
            {blocks.length} 个模块 <b>·</b> {raw.length} 字符
            {keys.length > 0 && (
              <>
                {' '}
                <b>·</b> {keys.length} 个变量
              </>
            )}
            <span className="editor-shortcut-hint">⌘ / Ctrl + S 保存</span>
          </span>
          <button type="button" className="button" onClick={() => void copy(mode === 'test' ? compiled : raw)}>
            <Icon name="copy" size={15} />
            复制{mode === 'test' ? '结果' : '全文'}
          </button>
          <button type="button" className="button primary" onClick={() => void save()} disabled={saving}>
            <Icon name="save" size={15} />
            {saving ? '保存中…' : '保存文档'}
          </button>
        </footer>
      </Overlay>

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
