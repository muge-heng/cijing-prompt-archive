export type ShelfColor = 'moss' | 'walnut' | 'slate' | 'wine' | 'ochre';
export type BlockKind = 'role' | 'task' | 'context' | 'rules' | 'format' | 'text';
export interface PromptBlock {
  id: string;
  kind: BlockKind;
  text: string;
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
}
export const blockLabels: Record<BlockKind, string> = {
  role: '角色设定',
  task: '任务描述',
  context: '背景信息',
  rules: '约束条件',
  format: '输出格式',
  text: '自由文本',
};
export const blockTemplates: Record<BlockKind, string> = {
  role: '你是一位{{角色}}，擅长将复杂的问题表达得清晰易懂。',
  task: '请围绕「{{主题}}」完成以下任务：',
  context: '目标受众是{{受众}}。请充分考虑他们的实际需求。',
  rules: '表达简洁、具体，避免空泛的描述。遇到不确定的信息时明确说明。',
  format: '请使用 Markdown 格式，依次给出摘要、要点与建议。',
  text: '',
};
export function assemble(blocks: PromptBlock[]) {
  return blocks
    .filter((b) => b.text.trim())
    .map((b) => (b.kind === 'text' ? b.text : `## ${blockLabels[b.kind]}\n${b.text}`))
    .join('\n\n');
}
export function variables(text: string) {
  return [...new Set([...text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) => m[1].trim()))];
}
export function renderPrompt(text: string, values: Record<string, string>) {
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (all, key: string) => values[key.trim()] || all);
}
export function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
