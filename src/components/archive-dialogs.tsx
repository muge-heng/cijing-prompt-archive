'use client';
import { useState } from 'react';
import { type ArchiveData, type ShelfColor, type PromptDoc, assemble } from '@/lib/archive-types';
import { Dialog, Overlay } from './dialog';
import { Icon } from './icons';
import { PaperGlyph } from './document-list';
import type { ArchiveMutation } from './editor';
export type MotionLevel = 'cinematic' | 'rich' | 'gentle' | 'off';
export type FontSizeLevel = 'small' | 'standard' | 'large' | 'xlarge';
export interface Preferences {
  theme: 'light' | 'dark';
  entrance: boolean;
  motion: boolean;
  motionLevel: MotionLevel;
  fontSize?: FontSizeLevel;
  compactIndex?: boolean;
}
export type EntityForm = { kind: 'shelf' | 'folder'; id?: string; shelfId?: string };
const tones: [ShelfColor, string][] = [
  ['moss', '苔绿'],
  ['walnut', '胡桃'],
  ['slate', '岩蓝'],
  ['wine', '酒红'],
  ['ochre', '黄铜'],
];
export function EntityDialog({
  form,
  data,
  mutate,
  onClose,
  onSaved,
  onDelete,
}: {
  form: EntityForm;
  data: ArchiveData;
  mutate: ArchiveMutation;
  onClose: () => void;
  onSaved: (id: string) => void;
  onDelete: () => void;
}) {
  const shelf = data.shelves.find((s) => s.id === form.id),
    folder = data.folders.find((f) => f.id === form.id),
    isShelf = form.kind === 'shelf';
  const [name, setName] = useState((isShelf ? shelf : folder)?.name || ''),
    [english, setEnglish] = useState(shelf?.english || ''),
    [color, setColor] = useState<ShelfColor>(shelf?.color || 'moss'),
    [description, setDescription] = useState(folder?.description || ''),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const label = isShelf ? '货架' : '文件夹';
  const parent = data.shelves.find((s) => s.id === (form.shelfId || folder?.shelfId));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请填写名称。');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const id = await mutate({
        action: `${form.id ? 'update' : 'create'}${isShelf ? 'Shelf' : 'Folder'}`,
        id: form.id,
        name,
        english,
        color,
        description,
        shelfId: form.shelfId,
      });
      if (id) onSaved(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败。');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      title={`${form.id ? '编辑' : '新建'}${label}`}
      eyebrow={isShelf ? 'SHELF CATALOG' : 'FOLDER INDEX'}
      onClose={() => !saving && onClose()}
    >
      <form onSubmit={submit}>
        <div className="dialog-form">
          {!isShelf && (
            <div className="location-strip">
              <Icon name="shelf" size={15} />
              所属货架 <strong>{parent?.name}</strong>
            </div>
          )}
          <label className="field-label">
            {label}名称
            <input
              className="field"
              data-autofocus
              maxLength={isShelf ? 16 : 30}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isShelf ? '例如：灵感采集' : '例如：待整理的灵感'}
            />
          </label>
          {isShelf ? (
            <>
              <label className="field-label">
                英文索引名 <em>选填</em>
                <input
                  className="field english-input"
                  maxLength={40}
                  placeholder="PERSONAL COLLECTION"
                  value={english}
                  onChange={(e) => setEnglish(e.target.value)}
                />
              </label>
              <div className="field-label">
                柜体色调
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
              {!form.id && (
                <p className="form-hint">
                  <Icon name="info" size={14} />
                  新货架会附带一个「收件夹」，随时可以开始归档。
                </p>
              )}
            </>
          ) : (
            <label className="field-label">
              文件夹说明 <em>选填</em>
              <textarea
                className="field"
                rows={3}
                maxLength={160}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简单描述这里收藏的内容…"
              />
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          {form.id && (
            <button className="text-button danger left-action" type="button" onClick={onDelete}>
              <Icon name="trash" size={14} />
              删除
            </button>
          )}
          <button className="button" type="button" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="button primary" disabled={saving} type="submit">
            {saving ? '归档中…' : form.id ? '保存更改' : `创建${label}`}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      className={`toggle ${checked ? 'on' : ''}`}
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={onChange}
    >
      <i />
    </button>
  );
}
const motionModes: { level: MotionLevel; label: string; hint: string }[] = [
  { level: 'cinematic', label: '舒缓典藏', hint: '放慢节奏，拉长抽屉推拉、光影扫过与层叠翻页' },
  { level: 'rich', label: '丰富拟物', hint: '抽屉拉出、文件夹翻页、层叠入场（默认）' },
  { level: 'gentle', label: '轻柔克制', hint: '短促淡入过渡，减弱视差与等待' },
  { level: 'off', label: '关闭动效', hint: '立即切换页面，无动态效果' },
];
const fontSizeModes: { level: FontSizeLevel; label: string; hint: string }[] = [
  { level: 'small', label: '小号', hint: '紧凑排布，一屏容纳更多条目' },
  { level: 'standard', label: '标准', hint: '均衡舒展，兼顾阅读与排版密度（默认）' },
  { level: 'large', label: '大号', hint: '舒适阅读，放大界面与编辑区字号' },
  { level: 'xlarge', label: '超大', hint: '醒目护眼，显著放大正文与提示词内容' },
];
export function Settings({
  prefs,
  change,
  onClose,
  replay,
}: {
  prefs: Preferences;
  change: (p: Preferences) => void;
  onClose: () => void;
  replay: () => void;
}) {
  const motionLevel: MotionLevel = prefs.motionLevel || (prefs.motion ? 'rich' : 'off');
  const currentMotion = motionModes.find((m) => m.level === motionLevel) || motionModes[1];
  const fontSizeLevel: FontSizeLevel = prefs.fontSize || 'standard';
  const currentFontSize =
    fontSizeModes.find((f) => f.level === fontSizeLevel) || fontSizeModes[1];
  return (
    <Dialog title="仓库设置" eyebrow="WORKSPACE PREFERENCES" onClose={onClose}>
      <div className="settings-body">
        <div className="setting-label">工作台外观</div>
        <div className="theme-options">
          {(['light', 'dark'] as const).map((t) => (
            <button
              className={`theme-option theme-${t} ${prefs.theme === t ? 'selected' : ''}`}
              key={t}
              onClick={() => change({ ...prefs, theme: t })}
            >
              <div className="theme-mini">
                <i />
                <span />
                <b />
              </div>
              <div>
                <Icon name={t === 'light' ? 'sun' : 'moon'} size={15} />
                {t === 'light' ? '暖纸日光' : '深夜书房'}
                {prefs.theme === t && <Icon name="check" size={14} />}
              </div>
            </button>
          ))}
        </div>
        <div className="setting-row">
          <div>
            <strong>入仓过渡动画</strong>
            <p>开仓时，让光影与货架依次入场。</p>
          </div>
          <Switch
            checked={prefs.entrance}
            label="入仓过渡动画"
            onChange={() => change({ ...prefs, entrance: !prefs.entrance })}
          />
        </div>
        <div className="setting-row setting-row-stack">
          <div className="setting-row-head">
            <div>
              <strong>界面动态效果</strong>
              <p>抽屉拉开、文件夹翻页与窗口切换。当前：{currentMotion.hint}</p>
            </div>
          </div>
          <div className="motion-segmented" role="radiogroup" aria-label="界面动效强度">
            {motionModes.map((m) => (
              <button
                key={m.level}
                type="button"
                role="radio"
                aria-checked={motionLevel === m.level}
                className={motionLevel === m.level ? 'selected' : ''}
                onClick={() => change({ ...prefs, motionLevel: m.level, motion: m.level !== 'off' })}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row setting-row-stack">
          <div className="setting-row-head">
            <div>
              <strong>界面字号</strong>
              <p>调节导航、列表与提示词编辑区的文字大小。当前：{currentFontSize.hint}</p>
            </div>
          </div>
          <div className="motion-segmented" role="radiogroup" aria-label="界面字号">
            {fontSizeModes.map((f) => (
              <button
                key={f.level}
                type="button"
                role="radio"
                aria-checked={fontSizeLevel === f.level}
                className={fontSizeLevel === f.level ? 'selected' : ''}
                onClick={() => change({ ...prefs, fontSize: f.level })}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="shortcut-note">
          <span>
            <Icon name="keyboard" size={16} />
            快捷键
          </span>
          <div>
            搜索仓库 <kbd>⌘ / Ctrl K</kbd>
          </div>
          <div>
            保存文档 <kbd>⌘ / Ctrl S</kbd>
          </div>
          <div>
            关闭窗口 <kbd>Esc</kbd>
          </div>
        </div>
        <p className="form-hint">
          <Icon name="info" size={14} />
          偏好保存在当前设备，系统的减少动态效果设置优先。
        </p>
      </div>
      <div className="dialog-footer">
        <button
          className="text-button left-action"
          disabled={!prefs.entrance || motionLevel === 'off'}
          onClick={replay}
        >
          <Icon name="play" size={13} />
          重播入仓动效
        </button>
        <button className="button primary" onClick={onClose}>
          完成
        </button>
      </div>
    </Dialog>
  );
}
export function SearchDialog({
  data,
  onClose,
  onDoc,
  onShelf,
  onFolder,
}: {
  data: ArchiveData;
  onClose: () => void;
  onDoc: (doc: PromptDoc) => void;
  onShelf: (id: string) => void;
  onFolder: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.toLowerCase().trim();
  const shelves = q ? data.shelves.filter((s) => (s.name + s.english).toLowerCase().includes(q)) : [],
    folders = q ? data.folders.filter((f) => (f.name + f.description).toLowerCase().includes(q)) : [];
  const docs = data.documents
    .filter((d) => !q || (d.title + d.synopsis + assemble(d.blocks, data.presets)).toLowerCase().includes(q))
    .slice(0, q ? 20 : 5);
  const openFirst = () => {
    if (shelves[0]) onShelf(shelves[0].id);
    else if (folders[0]) onFolder(folders[0].id);
    else if (docs[0]) onDoc(docs[0]);
  };
  return (
    <Overlay label="搜索仓库" onClose={onClose} className="dialog search-dialog">
      <div className="search-input-wrap">
        <Icon name="search" size={22} />
        <input
          data-autofocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') openFirst();
          }}
          aria-label="搜索关键词"
          placeholder="搜索提示词、货架和文件夹…"
        />
        <button onClick={onClose} className="escape-key" aria-label="关闭搜索">
          Esc
        </button>
      </div>
      <div className="search-results">
        {!!shelves.length && (
          <>
            <div className="result-heading">
              货架 <span>SHELVES</span>
            </div>
            {shelves.map((s) => (
              <button className="search-result" key={s.id} onClick={() => onShelf(s.id)}>
                <span className={`result-symbol tone-${s.color}`}>
                  <Icon name="shelf" />
                </span>
                <strong>{s.name}</strong>
                <Icon name="arrow" size={14} />
              </button>
            ))}
          </>
        )}
        {!!folders.length && (
          <>
            <div className="result-heading">
              文件夹 <span>FOLDERS</span>
            </div>
            {folders.map((f) => (
              <button className="search-result" key={f.id} onClick={() => onFolder(f.id)}>
                <Icon name="folder" />
                <div>
                  <strong>{f.name}</strong>
                  <small>{data.shelves.find((s) => s.id === f.shelfId)?.name}</small>
                </div>
                <Icon name="arrow" size={14} />
              </button>
            ))}
          </>
        )}
        {!!docs.length && (
          <>
            <div className="result-heading">
              {q ? '匹配文档' : '最近编辑'} <span>DOCUMENTS</span>
            </div>
            {docs.map((d) => {
              const f = data.folders.find((f) => f.id === d.folderId),
                s = data.shelves.find((s) => s.id === f?.shelfId);
              return (
                <button className="search-result" key={d.id} onClick={() => onDoc(d)}>
                  <PaperGlyph color={s?.color} />
                  <div>
                    <strong>{d.title}</strong>
                    <small>
                      {s?.name} / {f?.name}
                    </small>
                  </div>
                  <Icon name="enter" size={13} />
                </button>
              );
            })}
          </>
        )}
        {!docs.length && !folders.length && !shelves.length && (
          <div className="search-empty">
            <Icon name="search" size={28} />
            <h3>没有找到匹配的馆藏</h3>
            <p>换一个关键词，或搜索模块中的一段文字。</p>
          </div>
        )}
      </div>
      <div className="search-footer">
        <span>
          <kbd>↵</kbd> 打开首个结果
        </span>
        <span>全文检索 · {data.documents.length} 篇文档</span>
      </div>
    </Overlay>
  );
}
