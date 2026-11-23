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
export type ArchiveMutation = (body: Record<string, unknown>) => Promise<string | null>;
export type CopyText = (text: string, message?: string) => Promise<void>;
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
    [folderId, setFolderId] = useState(doc.folderId),
    [blocks, setBlocks] = useState<PromptBlock[]>(doc.blocks.map((b) => ({ ...b })));
  const [tab, setTab] = useState<'edit' | 'test'>('edit'),
    [adding, setAdding] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [discard, setDiscard] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({}),
    [tested, setTested] = useState(false);
  const raw = assemble(blocks),
    keys = variables(raw),
    compiled = renderPrompt(raw, values),
    missing = keys.filter((k) => !values[k]?.trim());
  const dirty =
    title !== doc.title || folderId !== doc.folderId || JSON.stringify(blocks) !== JSON.stringify(doc.blocks);
  const close = () => {
    if (saving) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  const save = async () => {
    if (saving) return;
    if (!title.trim()) {
      setError('请先为文档填写标题。');
      setTab('edit');
      return;
    }
    if (!blocks.some((b) => b.text.trim())) {
      setError('请至少填写一个模块的内容。');
      setTab('edit');
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
        synopsis: doc.synopsis,
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
  return (
    <>
      <Overlay label={isNew ? '新建提示词' : '提示词工作台'} className="editor-overlay" onClose={close}>
        <div className="editor-top">
          <span className="eyebrow">
            <Icon name="notebook" size={15} /> DOCUMENT WORKBENCH
          </span>
          <button className="icon-button" aria-label="关闭编辑器" onClick={close}>
            <Icon name="close" />
          </button>
        </div>
        <div className="editor-title-area">
          <div className="editor-path">
            <Icon name="shelf" size={13} />
            {shelf?.name}
            <Icon name="chevron" size={11} />
            {folder?.name}
            <span className={`save-state ${dirty || isNew ? 'unsaved' : ''}`}>
              <i />
              {dirty ? '尚未保存' : isNew ? '新草稿' : '已归档'}
            </span>
          </div>
          <input
            data-autofocus={isNew ? true : undefined}
            className="editor-title-input"
            aria-label="文档标题"
            placeholder="为这份灵感命名…"
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="editor-subtitle">
            {isNew
              ? '从一个模块开始，让灵感成为可复用的提示词。'
              : doc.synopsis || '一份收藏在词境仓库中的提示词文档。'}
          </div>
        </div>
        <div className="editor-tabs" role="tablist" aria-label="工作台模式">
          <button
            role="tab"
            aria-selected={tab === 'edit'}
            className={tab === 'edit' ? 'selected' : ''}
            onClick={() => setTab('edit')}
          >
            <Icon name="pen" size={15} />
            模块编辑
          </button>
          <button
            role="tab"
            aria-selected={tab === 'test'}
            className={tab === 'test' ? 'selected' : ''}
            onClick={() => setTab('test')}
          >
            <Icon name="test" size={16} />
            变量调试{keys.length > 0 && <small>{keys.length}</small>}
          </button>
        </div>
        <div className="editor-scroll">
          {tab === 'edit' ? (
            <>
              <label className="field-label">
                归档位置
                <select className="field" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                  {data.shelves.map((s) => (
                    <optgroup key={s.id} label={s.name}>
                      {data.folders
                        .filter((f) => f.shelfId === s.id)
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {s.name} / {f.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
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
                          className="icon-button"
                          aria-label={`上移${blockLabels[block.kind]}`}
                          disabled={!i}
                          onClick={() => move(i, -1)}
                        >
                          <Icon name="up" size={14} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`下移${blockLabels[block.kind]}`}
                          disabled={i === blocks.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <Icon name="down" size={14} />
                        </button>
                        <button
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
                      rows={Math.min(9, Math.max(3, Math.ceil(block.text.length / 36)))}
                      maxLength={30000}
                      placeholder="写下模块内容，用 {{变量名}} 保留可替换的位置…"
                      onChange={(e) => update(block.id, e.target.value)}
                    />
                  </section>
                ))}
              </div>
              <div className="add-block-area">
                <button
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
                      <button key={k} onClick={() => add(k)}>
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
            </>
          ) : (
            <div className="debug-workspace">
              <div className="debug-note">
                <Icon name="test" size={20} />
                <div>
                  <strong>本地变量调试</strong>
                  <p>填入变量，实时检查拼装结果。内容不会发送给外部模型。</p>
                </div>
              </div>
              <div className="mini-section">
                <h3>
                  输入变量 <span>{String(keys.length).padStart(2, '0')}</span>
                </h3>
              </div>
              {keys.length ? (
                keys.map((k) => (
                  <label className="field-label variable-field" key={k}>
                    <span>
                      <Icon name="variable" size={14} />
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
                ))
              ) : (
                <p className="debug-empty">这份提示词没有变量。可在模块中添加 {'{{主题}}'} 等占位符。</p>
              )}
              <button className="button" onClick={() => setTested(true)}>
                <Icon name="play" size={13} />
                检查提示词
              </button>
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
              <div className="mini-section">
                <h3>拼装预览</h3>
                <button className="text-button" onClick={() => void copy(compiled, '调试结果已复制')}>
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
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="editor-footer">
          <span className="editor-count">
            {blocks.length} 个模块 <b>·</b> {raw.length} 字符
          </span>
          <button className="button" onClick={() => void copy(tab === 'test' ? compiled : raw)}>
            <Icon name="copy" size={15} />
            复制{tab === 'test' ? '结果' : '全文'}
          </button>
          <button className="button primary" onClick={() => void save()} disabled={saving}>
            <Icon name="save" size={15} />
            {saving ? '保存中…' : '保存文档'}
          </button>
        </div>
      </Overlay>
      {discard && (
        <Dialog title="离开这份草稿？" eyebrow="UNSAVED CHANGES" onClose={() => setDiscard(false)}>
          <p className="dialog-copy">当前修改尚未保存。继续编辑，或放弃本次修改后离开。</p>
          <div className="dialog-footer">
            <button className="button" onClick={onClose}>
              放弃修改
            </button>
            <button className="button primary" onClick={() => setDiscard(false)}>
              继续编辑
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
