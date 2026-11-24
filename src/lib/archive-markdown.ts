import {
  blockLabels,
  blockTitle,
  defaultBlockMessageRole,
  isBuiltinBlockKind,
  isValidMessageRole,
  resolveBlockMessageRole,
  uid,
  type BlockKind,
  type BlockPreset,
  type BuiltinBlockKind,
  type MessageRole,
  type PromptBlock,
  type ShelfColor,
} from './archive-types';

export const PRESET_TONES: ShelfColor[] = ['moss', 'walnut', 'slate', 'wine', 'ochre'];

const BUILTIN_ALIASES: Record<BuiltinBlockKind, string[]> = {
  role: ['角色设定', '角色', '身份', '人设', 'role', 'persona', 'system role'],
  task: ['任务描述', '任务', '目标', '指令', 'task', 'goal', 'objective', 'instruction'],
  context: ['背景信息', '背景', '上下文', '场景', '背景资料', 'context', 'background', 'scenario'],
  rules: ['约束条件', '约束', '规则', '限制', '要求', '注意事项', 'rules', 'constraints', 'requirements', 'guidelines'],
  format: ['输出格式', '格式', '输出', '输出要求', '返回格式', 'format', 'output', 'output format'],
  text: ['自由文本', '正文', '补充说明', 'free text', 'text', 'notes'],
};

export function normalizeHeading(raw: string): string {
  return raw
    .trim()
    .replace(/[:：]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isBuiltinAlias(name: string): BuiltinBlockKind | null {
  const norm = normalizeHeading(name).toLowerCase();
  if (!norm) return null;
  for (const kind of Object.keys(blockLabels) as BuiltinBlockKind[]) {
    if (BUILTIN_ALIASES[kind].some((alias) => alias.toLowerCase() === norm)) {
      return kind;
    }
  }
  return null;
}

export function parseMessageRoleMarker(line: string): MessageRole | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const bracketMatch = trimmed.match(/^[\[\【]\s*([^\]\】]+?)\s*[\]\】]\s*[:：]?$/);
  const headingMatch = trimmed.match(/^#{1,6}\s+(.+?)\s*#*$/);
  let inner = bracketMatch?.[1] || headingMatch?.[1] || '';
  if (!inner) return null;
  inner = inner
    .trim()
    .replace(/^[\[\【]\s*|\s*[\]\】]$/g, '')
    .replace(/[:：]+$/, '')
    .trim()
    .toLowerCase();
  if (inner === 'system' || inner === 'system prompt' || inner === '系统' || inner === '系统提示词') {
    return 'system';
  }
  if (inner === 'user' || inner === 'user prompt' || inner === '用户' || inner === '用户提示词') {
    return 'user';
  }
  return null;
}

function extractHeadingAndRole(rawHeading: string): { heading: string; explicitRole?: MessageRole } {
  const m = rawHeading.match(/^(.*?)\s*[\[\【]\s*(system|sys|user|usr)\s*[\]\】]\s*$/i);
  if (!m) return { heading: rawHeading.trim() };
  const cleanHeading = m[1].trim();
  if (!cleanHeading) return { heading: rawHeading.trim() };
  const tag = m[2].toLowerCase();
  return {
    heading: cleanHeading,
    explicitRole: tag === 'system' || tag === 'sys' ? 'system' : 'user',
  };
}

export function suggestMessageRole(heading: string): MessageRole {
  const norm = normalizeHeading(heading).toLowerCase();
  if (!norm) return 'user';
  if (
    /(规范|约束|规则|准则|标准|角色|设定|身份|风格|原则|限制|禁止|要求|格式|输出|思维链|评审|system|guideline|policy|rubric|rule|constraint|persona|role|format|cot)/.test(
      norm,
    )
  ) {
    return 'system';
  }
  return 'user';
}

function naturalBlockRole(
  kind: BlockKind,
  presetId: string | undefined,
  presets: BlockPreset[],
): MessageRole {
  if (presetId) {
    const preset = presets.find((p) => p.id === presetId);
    if (preset && isValidMessageRole(preset.messageRole)) return preset.messageRole;
  }
  return defaultBlockMessageRole(kind);
}

export function blocksToMarkdown(blocks: PromptBlock[], presets: BlockPreset[] = []): string {
  const selected = blocks.filter((b, idx) => b.text.trim() || blocks.length === 1 || idx === 0);
  const needsRoleMarkers = selected.some((b) => {
    if (!b.text.trim() && b.kind === 'text') return false;
    return resolveBlockMessageRole(b, presets) !== naturalBlockRole(b.kind, b.presetId, presets);
  });

  const parts: string[] = [];
  let currentRole: MessageRole | null = null;
  for (const b of selected) {
    const body = b.text.replace(/\s+$/, '');
    const piece =
      b.kind === 'text'
        ? body
        : body
          ? `## ${blockTitle(b, presets)}\n${body}`
          : `## ${blockTitle(b, presets)}`;
    if (!piece && selected.length > 1) continue;

    if (needsRoleMarkers && (piece || selected.length > 1)) {
      const role = resolveBlockMessageRole(b, presets);
      if (role !== currentRole) {
        parts.push(role === 'system' ? '[System]' : '[User]');
        currentRole = role;
      }
    }
    if (piece || parts.length === 0) {
      parts.push(piece);
    }
  }
  return parts.filter((part, idx, arr) => part.length > 0 || arr.length === 1).join('\n\n');
}

export interface UnmatchedHeading {
  index: number;
  heading: string;
  text: string;
  suggestedColor: ShelfColor;
  suggestedRole: MessageRole;
}

export interface ParsedSection {
  index: number;
  kind: BlockKind;
  heading: string;
  rawHeadingLine?: string;
  text: string;
  presetId?: string;
  label?: string;
  color?: ShelfColor;
  messageRole?: MessageRole;
  matchedBy: 'preset' | 'builtin' | 'existing-custom' | 'unmatched' | 'preamble';
}

export interface FullTextParseResult {
  sections: ParsedSection[];
  blocks: PromptBlock[];
  previewBlocks: PromptBlock[];
  unmatched: UnmatchedHeading[];
  matchedLabels: string[];
  overflowMerged: boolean;
  hasRoleMarkers: boolean;
}

function matchExistingId(
  section: { kind: BlockKind; label?: string },
  existingBlocks: PromptBlock[],
  usedIndices: Set<number>,
): string {
  const targetLabel = section.label ? normalizeHeading(section.label).toLowerCase() : '';
  for (let i = 0; i < existingBlocks.length; i++) {
    if (usedIndices.has(i)) continue;
    const candidate = existingBlocks[i];
    if (candidate.kind !== section.kind) continue;
    if (section.kind === 'custom') {
      if (normalizeHeading(candidate.label || '').toLowerCase() !== targetLabel) continue;
    }
    usedIndices.add(i);
    return candidate.id;
  }
  return uid();
}

function sectionToBlock(section: ParsedSection, id: string, presets: BlockPreset[]): PromptBlock {
  const natural = naturalBlockRole(section.kind, section.presetId, presets);
  const explicitOverride =
    section.messageRole && section.messageRole !== natural ? section.messageRole : undefined;

  if (section.kind === 'custom') {
    return {
      id,
      kind: 'custom',
      text: section.text,
      presetId: section.presetId,
      label: section.label || section.heading,
      color: section.color || 'ochre',
      ...(explicitOverride ? { messageRole: explicitOverride } : {}),
    };
  }
  return {
    id,
    kind: section.kind,
    text: section.text,
    ...(explicitOverride ? { messageRole: explicitOverride } : {}),
  };
}

export function parseFullTextPrompt(
  markdown: string,
  existingBlocks: PromptBlock[],
  presets: BlockPreset[],
): FullTextParseResult {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  type RawSection = {
    rawLine?: string;
    heading?: string;
    explicitRole?: MessageRole;
    scopeRole?: MessageRole;
    lines: string[];
  };
  const rawSections: RawSection[] = [];
  let activeScopeRole: MessageRole | undefined;
  let hasRoleMarkers = false;
  let current: RawSection = { scopeRole: undefined, lines: [] };
  let fenceChar: string | null = null;
  let fenceLen = 0;

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const token = fenceMatch[1];
      if (!fenceChar) {
        fenceChar = token[0];
        fenceLen = token.length;
      } else if (token[0] === fenceChar && token.length >= fenceLen) {
        fenceChar = null;
        fenceLen = 0;
      }
      current.lines.push(line);
      continue;
    }

    if (!fenceChar) {
      const markerRole = parseMessageRoleMarker(line);
      if (markerRole) {
        hasRoleMarkers = true;
        if (current.heading || current.lines.some((l) => l.trim())) {
          rawSections.push(current);
        }
        activeScopeRole = markerRole;
        current = { scopeRole: activeScopeRole, lines: [] };
        continue;
      }

      const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*$/);
      if (headingMatch) {
        if (current.heading || current.lines.some((l) => l.trim())) {
          rawSections.push(current);
        }
        const extracted = extractHeadingAndRole(headingMatch[2]);
        if (extracted.explicitRole) hasRoleMarkers = true;
        current = {
          rawLine: line,
          heading: extracted.heading,
          explicitRole: extracted.explicitRole,
          scopeRole: activeScopeRole,
          lines: [],
        };
        continue;
      }
    }

    current.lines.push(line);
  }
  if (current.heading || current.lines.some((l) => l.trim())) {
    rawSections.push(current);
  }

  let sections: ParsedSection[] = [];
  let unmatchedCount = 0;

  for (let i = 0; i < rawSections.length; i++) {
    const sec = rawSections[i];
    const body = sec.lines.join('\n').replace(/^\n+/, '').replace(/\s+$/, '');
    const inheritedRole = sec.explicitRole ?? sec.scopeRole;

    if (!sec.heading) {
      if (body.trim()) {
        sections.push({
          index: sections.length,
          kind: 'text',
          heading: blockLabels.text,
          text: body,
          messageRole: inheritedRole,
          matchedBy: 'preamble',
        });
      }
      continue;
    }

    const norm = normalizeHeading(sec.heading);
    const normLower = norm.toLowerCase();

    const matchedPreset = presets.find((p) => normalizeHeading(p.name).toLowerCase() === normLower);
    if (matchedPreset) {
      sections.push({
        index: sections.length,
        kind: 'custom',
        heading: matchedPreset.name,
        rawHeadingLine: sec.rawLine,
        text: body,
        presetId: matchedPreset.id,
        label: matchedPreset.name,
        color: matchedPreset.color,
        messageRole: inheritedRole ?? matchedPreset.messageRole,
        matchedBy: 'preset',
      });
      continue;
    }

    const builtinKind = isBuiltinAlias(norm);
    if (builtinKind) {
      sections.push({
        index: sections.length,
        kind: builtinKind,
        heading: blockLabels[builtinKind],
        rawHeadingLine: sec.rawLine,
        text: body,
        messageRole: inheritedRole ?? defaultBlockMessageRole(builtinKind),
        matchedBy: 'builtin',
      });
      continue;
    }

    const existingCustom = existingBlocks.find(
      (b) => b.kind === 'custom' && normalizeHeading(b.label || '').toLowerCase() === normLower,
    );
    if (existingCustom) {
      sections.push({
        index: sections.length,
        kind: 'custom',
        heading: existingCustom.label || norm,
        rawHeadingLine: sec.rawLine,
        text: body,
        presetId: existingCustom.presetId,
        label: existingCustom.label || norm,
        color: existingCustom.color || 'ochre',
        messageRole: inheritedRole ?? existingCustom.messageRole,
        matchedBy: 'existing-custom',
      });
      continue;
    }

    // Empty heading before real content (e.g. a top-level "# Prompt Title") stays plain text instead of prompting.
    if (!body.trim() && rawSections.length > 1) {
      sections.push({
        index: sections.length,
        kind: 'text',
        heading: blockLabels.text,
        rawHeadingLine: sec.rawLine,
        text: sec.rawLine || `## ${norm}`,
        messageRole: inheritedRole,
        matchedBy: 'preamble',
      });
      continue;
    }

    const suggestedColor = PRESET_TONES[unmatchedCount % PRESET_TONES.length];
    const suggestedRole = inheritedRole ?? suggestMessageRole(norm);
    unmatchedCount += 1;
    sections.push({
      index: sections.length,
      kind: 'custom',
      heading: norm.slice(0, 24) || '自定义模块',
      rawHeadingLine: sec.rawLine,
      text: body,
      label: norm.slice(0, 24) || '自定义模块',
      color: suggestedColor,
      messageRole: suggestedRole,
      matchedBy: 'unmatched',
    });
  }

  let overflowMerged = false;
  if (sections.length > 40) {
    overflowMerged = true;
    const head = sections.slice(0, 39);
    const tailText = sections
      .slice(39)
      .map((s) => (s.kind === 'text' ? s.text : `## ${s.heading}\n${s.text}`))
      .filter((t) => t.trim())
      .join('\n\n');
    head.push({
      index: 39,
      kind: 'text',
      heading: blockLabels.text,
      text: tailText,
      matchedBy: 'preamble',
    });
    sections = head;
  }

  if (!sections.length) {
    const fallbackId = existingBlocks[0]?.id || uid();
    const emptyBlock: PromptBlock = { id: fallbackId, kind: 'task', text: '' };
    return {
      sections: [],
      blocks: [emptyBlock],
      previewBlocks: [emptyBlock],
      unmatched: [],
      matchedLabels: [],
      overflowMerged: false,
      hasRoleMarkers,
    };
  }

  const usedIds = new Set<number>();
  const previewBlocks = sections.map((sec) => {
    const id = matchExistingId(sec, existingBlocks, usedIds);
    return sectionToBlock(sec, id, presets);
  });

  const unmatched: UnmatchedHeading[] = sections
    .filter((s) => s.matchedBy === 'unmatched')
    .map((s) => ({
      index: s.index,
      heading: s.heading,
      text: s.text,
      suggestedColor: s.color || 'ochre',
      suggestedRole: s.messageRole || 'user',
    }));

  const matchedLabels = [
    ...new Set(
      sections
        .filter((s) => s.matchedBy === 'preset' || s.matchedBy === 'builtin' || s.matchedBy === 'existing-custom')
        .map((s) => s.heading),
    ),
  ];

  return {
    sections,
    blocks: previewBlocks,
    previewBlocks,
    unmatched,
    matchedLabels,
    overflowMerged,
    hasRoleMarkers,
  };
}

export interface HeadingResolution {
  index: number;
  mode: 'create-preset' | 'doc-only' | 'keep-text';
  name: string;
  color: ShelfColor;
  template: string;
  messageRole: MessageRole;
}

export function applyHeadingResolutions(
  parsed: FullTextParseResult,
  resolutions: HeadingResolution[],
  createdPresetsByIndex: Record<number, BlockPreset>,
  existingBlocks: PromptBlock[],
  presets: BlockPreset[] = [],
): PromptBlock[] {
  const resolutionMap = new Map(resolutions.map((r) => [r.index, r]));
  const allPresets = [...presets, ...Object.values(createdPresetsByIndex)];
  const usedIds = new Set<number>();
  const out: PromptBlock[] = [];

  for (const sec of parsed.sections) {
    if (sec.matchedBy !== 'unmatched') {
      const id = matchExistingId(sec, existingBlocks, usedIds);
      out.push(sectionToBlock(sec, id, allPresets));
      continue;
    }

    const res = resolutionMap.get(sec.index);
    if (!res || res.mode === 'keep-text') {
      const textContent = sec.text.trim()
        ? `${sec.rawHeadingLine || `## ${sec.heading}`}\n${sec.text}`
        : sec.rawHeadingLine || `## ${sec.heading}`;
      const keepRole = res?.messageRole ?? sec.messageRole ?? 'user';
      const prev = out[out.length - 1];
      if (prev && prev.kind === 'text' && resolveBlockMessageRole(prev, allPresets) === keepRole) {
        prev.text = prev.text.trim() ? `${prev.text}\n\n${textContent}` : textContent;
      } else {
        out.push({
          id: uid(),
          kind: 'text',
          text: textContent,
          ...(keepRole !== 'user' ? { messageRole: keepRole } : {}),
        });
      }
      continue;
    }

    if (res.mode === 'create-preset') {
      const created = createdPresetsByIndex[sec.index];
      const label = (created?.name || res.name || sec.heading).trim().slice(0, 24) || '自定义模块';
      const color = created?.color || res.color || sec.color || 'ochre';
      const presetRole = created?.messageRole || res.messageRole || sec.messageRole || 'user';
      const chosenRole = res.messageRole || presetRole;
      const id = matchExistingId({ kind: 'custom', label }, existingBlocks, usedIds);
      out.push({
        id,
        kind: 'custom',
        text: sec.text,
        presetId: created?.id,
        label,
        color,
        ...(chosenRole !== presetRole ? { messageRole: chosenRole } : {}),
      });
      continue;
    }

    const label = (res.name || sec.heading).trim().slice(0, 24) || '自定义模块';
    const docRole = res.messageRole || sec.messageRole || 'user';
    const id = matchExistingId({ kind: 'custom', label }, existingBlocks, usedIds);
    out.push({
      id,
      kind: 'custom',
      text: sec.text,
      label,
      color: res.color || sec.color || 'ochre',
      ...(docRole !== 'user' ? { messageRole: docRole } : {}),
    });
  }

  return out.length ? out : [{ id: existingBlocks[0]?.id || uid(), kind: 'task', text: '' }];
}

export function isBuiltinLabelCollision(name: string): boolean {
  const norm = normalizeHeading(name).toLowerCase();
  if (!norm) return false;
  return (Object.values(blockLabels) as string[]).some((label) => label.toLowerCase() === norm);
}

export function blockPreviewHeading(block: PromptBlock, presets?: BlockPreset[]): string {
  return isBuiltinBlockKind(block.kind) ? blockLabels[block.kind] : blockTitle(block, presets);
}
