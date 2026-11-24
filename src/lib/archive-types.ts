export type ShelfColor = 'moss' | 'walnut' | 'slate' | 'wine' | 'ochre';
export type BuiltinBlockKind = 'role' | 'task' | 'context' | 'rules' | 'format' | 'text';
export type BlockKind = BuiltinBlockKind | 'custom';
export type CopyFormat = 'markdown' | 'plain' | 'messages';
export type MessageRole = 'system' | 'user';

export interface VariableSpec {
  name: string;
  defaultValue: string;
}

export interface DebugTestCase {
  id: string;
  name: string;
  values: Record<string, string>;
  createdAt: string;
}

export interface DocRevision {
  id: string;
  savedAt: string;
  title: string;
  synopsis: string;
  blocks: PromptBlock[];
}

export interface RenderedSegment {
  kind: 'text' | 'filled' | 'default' | 'unresolved';
  text: string;
  varName?: string;
}

export interface PromptBlock {
  id: string;
  kind: BlockKind;
  text: string;
  presetId?: string;
  label?: string;
  color?: ShelfColor;
  messageRole?: MessageRole;
}

export interface BlockPreset {
  id: string;
  name: string;
  template: string;
  color: ShelfColor;
  messageRole?: MessageRole;
  createdAt: string;
}

export interface Shelf {
  id: string;
  name: string;
  english: string;
  color: ShelfColor;
  position: number;
}
export interface Folder {
  id: string;
  shelfId: string;
  name: string;
  description: string;
  position: number;
}
export interface PromptDoc {
  id: string;
  folderId: string;
  title: string;
  synopsis: string;
  blocks: PromptBlock[];
  favorite: boolean;
  updatedAt: string;
  createdAt: string;
  lastOpened: string | null;
}
export interface ArchiveData {
  shelves: Shelf[];
  folders: Folder[];
  documents: PromptDoc[];
  presets: BlockPreset[];
  revisions?: Record<string, DocRevision[]>;
  testCases?: Record<string, DebugTestCase[]>;
}
export const blockLabels: Record<BuiltinBlockKind, string> = {
  role: '角色设定',
  task: '任务描述',
  context: '背景信息',
  rules: '约束条件',
  format: '输出格式',
  text: '自由文本',
};
export const blockTemplates: Record<BuiltinBlockKind, string> = {
  role: '你是一位{{角色}}，擅长将复杂的问题表达得清晰易懂。',
  task: '请围绕「{{主题}}」完成以下任务：',
  context: '目标受众是{{受众}}。请充分考虑他们的实际需求。',
  rules: '表达简洁、具体，避免空泛的描述。遇到不确定的信息时明确说明。',
  format: '请使用 Markdown 格式，依次给出摘要、要点与建议。',
  text: '',
};
export function isBuiltinBlockKind(kind: unknown): kind is BuiltinBlockKind {
  return typeof kind === 'string' && Object.hasOwn(blockLabels, kind);
}
export function isValidMessageRole(value: unknown): value is MessageRole {
  return value === 'system' || value === 'user';
}
export function defaultBlockMessageRole(kind: BlockKind): MessageRole {
  return kind === 'role' || kind === 'context' || kind === 'rules' || kind === 'format'
    ? 'system'
    : 'user';
}
export function resolveBlockMessageRole(
  block: Pick<PromptBlock, 'kind' | 'presetId' | 'messageRole'>,
  presets?: BlockPreset[],
): MessageRole {
  if (isValidMessageRole(block.messageRole)) {
    return block.messageRole;
  }
  if (block.presetId && presets?.length) {
    const preset = presets.find((p) => p.id === block.presetId);
    if (preset && isValidMessageRole(preset.messageRole)) {
      return preset.messageRole;
    }
  }
  return defaultBlockMessageRole(block.kind);
}
export function blockTitle(block: PromptBlock, presets?: BlockPreset[]): string {
  if (isBuiltinBlockKind(block.kind)) {
    return blockLabels[block.kind];
  }
  if (block.presetId && presets?.length) {
    const preset = presets.find((p) => p.id === block.presetId);
    if (preset?.name) return preset.name;
  }
  return block.label?.trim() || '自定义模块';
}
export function assemble(blocks: PromptBlock[], presets?: BlockPreset[]) {
  return blocks
    .filter((b) => b.text.trim())
    .map((b) => (b.kind === 'text' ? b.text : `## ${blockTitle(b, presets)}\n${b.text}`))
    .join('\n\n');
}
export function assembleFormatted(blocks: PromptBlock[], presets: BlockPreset[] | undefined, format: CopyFormat) {
  const nonEmpty = blocks.filter((b) => b.text.trim());
  if (!nonEmpty.length) return '';
  if (format === 'plain') {
    return nonEmpty.map((b) => b.text).join('\n\n');
  }
  if (format === 'messages') {
    const sysBlocks = nonEmpty.filter((b) => resolveBlockMessageRole(b, presets) === 'system');
    const userBlocks = nonEmpty.filter((b) => resolveBlockMessageRole(b, presets) === 'user');
    const parts: string[] = [];
    if (sysBlocks.length) {
      parts.push(`[System]\n${assemble(sysBlocks, presets)}`);
    }
    if (userBlocks.length) {
      parts.push(`[User]\n${assemble(userBlocks, presets)}`);
    }
    return parts.join('\n\n');
  }
  return assemble(nonEmpty, presets);
}
function splitVarToken(rawInside: string): VariableSpec {
  const trimmed = rawInside.trim();
  const colonIdx = trimmed.search(/[:：]/);
  if (colonIdx < 0) {
    return { name: trimmed, defaultValue: '' };
  }
  const name = trimmed.slice(0, colonIdx).trim();
  const defaultValue = trimmed.slice(colonIdx + 1).trim();
  if (!name) {
    return { name: trimmed, defaultValue: '' };
  }
  return { name, defaultValue };
}
export function parseVariables(text: string): VariableSpec[] {
  const map = new Map<string, VariableSpec>();
  for (const m of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const spec = splitVarToken(m[1]);
    if (!spec.name) continue;
    const existing = map.get(spec.name);
    if (!existing) {
      map.set(spec.name, spec);
    } else if (!existing.defaultValue && spec.defaultValue) {
      existing.defaultValue = spec.defaultValue;
    }
  }
  return [...map.values()];
}
export function variables(text: string) {
  return parseVariables(text).map((v) => v.name);
}
export function renderPrompt(text: string, values: Record<string, string>, useDefaults = true) {
  const specs = parseVariables(text);
  const defaultMap = new Map(specs.map((s) => [s.name, s.defaultValue]));
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (all, rawInside: string) => {
    const parsed = splitVarToken(rawInside);
    const manual = values[parsed.name];
    if (manual) return manual;
    if (useDefaults) {
      const fallback = parsed.defaultValue || defaultMap.get(parsed.name) || '';
      if (fallback) return fallback;
    }
    return all;
  });
}
export function renderPromptSegments(
  text: string,
  values: Record<string, string>,
  useDefaults = true,
): RenderedSegment[] {
  if (!text) return [];
  const specs = parseVariables(text);
  const defaultMap = new Map(specs.map((s) => [s.name, s.defaultValue]));
  const segments: RenderedSegment[] = [];
  const regex = /\{\{\s*([^{}]+?)\s*\}\}/g;
  let lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      segments.push({ kind: 'text', text: text.slice(lastIndex, idx) });
    }
    const parsed = splitVarToken(match[1]);
    const manual = values[parsed.name];
    if (manual) {
      segments.push({ kind: 'filled', text: manual, varName: parsed.name });
    } else {
      const fallback = useDefaults ? parsed.defaultValue || defaultMap.get(parsed.name) || '' : '';
      if (fallback) {
        segments.push({ kind: 'default', text: fallback, varName: parsed.name });
      } else {
        segments.push({ kind: 'unresolved', text: match[0], varName: parsed.name });
      }
    }
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: 'text', text: text.slice(lastIndex) });
  }
  return segments;
}
export function estimateTokens(text: string): number {
  if (!text.trim()) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) {
      cjk++;
    } else {
      other++;
    }
  }
  return cjk === 0 && other === 0 ? 0 : Math.ceil(cjk * 0.8 + other / 3.8);
}
export function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
