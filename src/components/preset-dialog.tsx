'use client';
import { useState } from 'react';
import type { BlockPreset, ShelfColor } from '@/lib/archive-types';
import type { HeadingResolution, UnmatchedHeading } from '@/lib/archive-markdown';
import { Dialog } from './dialog';
import { Icon } from './icons';
import type { ArchiveMutation } from './editor';

const tones: [ShelfColor, string][] = [
  ['moss', '苔绿'],
  ['walnut', '胡桃'],
  ['slate', '岩蓝'],
  ['wine', '酒红'],
  ['ochre', '黄铜'],
];

export function PresetDialog({
  preset,
  initialName = '',
  initialTemplate = '',
  initialColor = 'ochre',
  allowInsert = false,
  mutate,
  onClose,
  onSaved,
  onDeleted,
}: {
  preset?: BlockPreset;
  initialName?: string;
  initialTemplate?: string;
  initialColor?: ShelfColor;
  allowInsert?: boolean;
  mutate: ArchiveMutation;
  onClose: () => void;
  onSaved: (preset: BlockPreset, insertIntoDoc: boolean) => void;
  onDeleted?: (id: string) => void;
}) {
  const [name, setName] = useState(preset?.name || initialName);
  const [template, setTemplate] = useState(preset?.template ?? initialTemplate);
  const [color, setColor] = useState<ShelfColor>(preset?.color || initialColor);
  const [insertIntoDoc, setInsertIntoDoc] = useState(Boolean(allowInsert && !preset));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请填写板块名称。');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const trimmedName = name.trim();
      const trimmedTemplate = template.trim();
      const id = await mutate({
        action: preset ? 'updatePreset' : 'createPreset',
        id: preset?.id,
        name: trimmedName,
        template: trimmedTemplate,
        color,
      });
      const resolvedId = id || preset?.id || '';
      onSaved(
        {
          id: resolvedId,
          name: trimmedName,
          template: trimmedTemplate,
          color,
          createdAt: preset?.createdAt || new Date().toISOString(),
        },
        insertIntoDoc,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存预设失败，请重试。');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!preset) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await mutate({ action: 'deletePreset', id: preset.id });
      onDeleted?.(preset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除预设失败。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={preset ? '编辑板块预设' : '新建板块预设'}
      eyebrow="CUSTOM MODULE PRESET"
      onClose={() => !saving && onClose()}
    >
      <form onSubmit={submit}>
        <div className="dialog-form">
          <label className="field-label">
            板块名称
            <input
              className="field"
              data-autofocus
              maxLength={24}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：示例参考、思维链、评分标准"
            />
          </label>
          <div className="field-label">
            板块标识色调
            <div className="color-options">
              {tones.map(([tone, label]) => (
                <button
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={color === tone}
                  key={tone}
                  className={`color-dot tone-${tone} ${color === tone ? 'selected' : ''}`}
                  onClick={() => setColor(tone)}
                >
                  {color === tone && <Icon name="check" size={17} />}
                </button>
              ))}
              <span>{tones.find((t) => t[0] === color)?.[1]}</span>
            </div>
          </div>
          <label className="field-label">
            默认模板内容 <em>选填 · 支持 {'{{变量}}'}</em>
            <textarea
              className="field"
              rows={4}
              maxLength={30000}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="输入插入该板块时预填的内容，如：请参考以下示例格式「{{示例}}」…"
            />
          </label>
          {allowInsert && !preset && (
            <label className="preset-insert-check">
              <input
                type="checkbox"
                checked={insertIntoDoc}
                onChange={(e) => setInsertIntoDoc(e.target.checked)}
              />
              <span>保存后立即插入当前文档</span>
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          {preset && onDeleted && (
            <button
              className="text-button danger left-action"
              type="button"
              disabled={saving}
              onClick={() => void handleDelete()}
            >
              <Icon name="trash" size={14} />
              {confirmDelete ? '再次点击确认删除' : '删除预设'}
            </button>
          )}
          <button className="button" type="button" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="button primary" disabled={saving} type="submit">
            {saving ? '保存中…' : preset ? '保存更改' : '保存预设'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function PresetManagerDialog({
  presets,
  onClose,
  onCreate,
  onEdit,
  onInsert,
  onDelete,
}: {
  presets: BlockPreset[];
  onClose: () => void;
  onCreate: () => void;
  onEdit: (preset: BlockPreset) => void;
  onInsert?: (preset: BlockPreset) => void;
  onDelete: (preset: BlockPreset) => Promise<void>;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const remove = async (preset: BlockPreset) => {
    if (confirmId !== preset.id) {
      setConfirmId(preset.id);
      return;
    }
    setBusyId(preset.id);
    setError('');
    try {
      await onDelete(preset);
      setConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog
      title="自定义板块预设库"
      eyebrow="MODULE PRESET LIBRARY"
      className="preset-manager-dialog"
      onClose={onClose}
    >
      <div className="preset-manager-body">
        {presets.length ? (
          <div className="preset-manager-list">
            {presets.map((p) => (
              <div className={`preset-manager-item tone-${p.color}`} key={p.id}>
                <div className="preset-manager-info">
                  <div className="preset-manager-title">
                    <span className={`select-tone-dot tone-${p.color}`} aria-hidden="true" />
                    <strong>{p.name}</strong>
                  </div>
                  <p>{p.template.trim() || '（空白模板 · 插入后手动填写）'}</p>
                </div>
                <div className="preset-manager-actions">
                  {onInsert && (
                    <button
                      type="button"
                      className="button small"
                      onClick={() => onInsert(p)}
                    >
                      插入
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button"
                    title={`编辑${p.name}`}
                    aria-label={`编辑${p.name}`}
                    onClick={() => onEdit(p)}
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    type="button"
                    className={`icon-button ${confirmId === p.id ? 'danger' : ''}`}
                    title={confirmId === p.id ? '再次点击确认删除' : `删除${p.name}`}
                    aria-label={confirmId === p.id ? `确认删除${p.name}` : `删除${p.name}`}
                    disabled={busyId === p.id}
                    onClick={() => void remove(p)}
                  >
                    <Icon name={confirmId === p.id ? 'check' : 'trash'} size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="preset-manager-empty">
            <Icon name="layers" size={26} />
            <strong>还没有自定义板块预设</strong>
            <p>把常用的结构（如「示例参考」「思维链」「评分标准」）沉淀为预设，新建提示词时一键拼装。</p>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="dialog-footer">
        <button type="button" className="button left-action" onClick={onCreate}>
          <Icon name="plus" size={14} />
          新建板块预设
        </button>
        <button type="button" className="button primary" onClick={onClose}>
          完成
        </button>
      </div>
    </Dialog>
  );
}

export function UnmatchedBlocksDialog({
  unmatched,
  saveAfter,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  unmatched: UnmatchedHeading[];
  saveAfter: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (resolutions: HeadingResolution[]) => Promise<void>;
}) {
  const [items, setItems] = useState<HeadingResolution[]>(() =>
    unmatched.map((u) => ({
      index: u.index,
      mode: 'create-preset',
      name: u.heading.slice(0, 24) || '自定义模块',
      color: u.suggestedColor,
      template: u.text,
    })),
  );

  const patchItem = (index: number, patch: Partial<HeadingResolution>) => {
    setItems((prev) => prev.map((it) => (it.index === index ? { ...it, ...patch } : it)));
  };

  return (
    <Dialog
      title={saveAfter ? '发现未匹配的新模块 · 确认并保存' : '发现未匹配的新模块'}
      eyebrow="SMART MARKDOWN SYNC"
      className="unmatched-dialog"
      onClose={() => !busy && onClose()}
    >
      <div className="unmatched-dialog-body">
        <p className="unmatched-lead">
          以下 Markdown 标题暂未匹配到现有内置模块或预设库。你可以根据本次输入内容直接新建为模块并存入预设库，或仅在当前文档使用。
        </p>
        <div className="unmatched-list">
          {items.map((item, idx) => {
            const source = unmatched[idx];
            const preview = (source?.text || '').trim();
            return (
              <div className="unmatched-item-card" key={item.index}>
                <div className="unmatched-item-head">
                  <span className="unmatched-badge">## {source?.heading || item.name}</span>
                  <div className="unmatched-mode-group" role="radiogroup" aria-label={`${source?.heading}处理方式`}>
                    {(
                      [
                        ['create-preset', '新建并存为预设'],
                        ['doc-only', '仅本文档模块'],
                        ['keep-text', '保留为自由文本'],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        type="button"
                        key={mode}
                        role="radio"
                        aria-checked={item.mode === mode}
                        className={item.mode === mode ? 'selected' : ''}
                        onClick={() => patchItem(item.index, { mode })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {preview && (
                  <p className="unmatched-preview">
                    {preview.length > 140 ? `${preview.slice(0, 140)}…` : preview}
                  </p>
                )}
                {item.mode !== 'keep-text' && (
                  <div className="unmatched-config-row">
                    <label className="unmatched-name-field">
                      <span>模块名称</span>
                      <input
                        className="field"
                        maxLength={24}
                        value={item.name}
                        onChange={(e) => patchItem(item.index, { name: e.target.value })}
                      />
                    </label>
                    <div className="unmatched-tones">
                      <span>色调</span>
                      <div className="unmatched-tone-dots">
                        {tones.map(([tone, label]) => (
                          <button
                            type="button"
                            key={tone}
                            title={label}
                            aria-label={`${item.name}-${label}`}
                            className={`color-dot tone-${tone} ${item.color === tone ? 'selected' : ''}`}
                            onClick={() => patchItem(item.index, { color: tone })}
                          >
                            {item.color === tone && <Icon name="check" size={12} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {item.mode === 'create-preset' && (
                  <p className="unmatched-preset-hint">
                    将同步创建「{item.name.trim() || source?.heading}」预设，并默认收录本次输入正文作为复用模板。
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="dialog-footer">
        <button type="button" className="button" disabled={busy} onClick={onClose}>
          返回修改原文
        </button>
        <button
          type="button"
          className="button primary"
          disabled={busy}
          onClick={() => void onConfirm(items)}
        >
          {busy ? '同步中…' : saveAfter ? '确认并保存文档' : '确认并同步模块'}
        </button>
      </div>
    </Dialog>
  );
}
