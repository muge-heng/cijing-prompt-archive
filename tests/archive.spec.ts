import { test, expect } from '@playwright/test';
import type { ArchiveData } from '../src/lib/archive-types';

const baseURL = process.env.ARCHIVE_TEST_URL || 'http://127.0.0.1:3000';
test.use({ baseURL, viewport: { width: 1440, height: 960 } });
test.describe.configure({ mode: 'serial' });

test('完整归档流程：建立层级、拼装、变量调试、复制、收藏、检索与持久化', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(90000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const name = `验收-${Date.now().toString().slice(-6)}`;
  const title = `阅读计划-${Date.now().toString().slice(-6)}`;
  let shelfId = '';
  const snapshot = async (): Promise<ArchiveData> => (await request.get('/api/archive')).json();
  try {
    await page.goto('/');
    await page.locator('.shelf-section').getByRole('button', { name: '新建货架', exact: true }).click();
    await page.getByLabel('货架名称').fill(name);
    await page.getByRole('button', { name: '酒红', exact: true }).click();
    await page.getByRole('button', { name: '创建货架', exact: true }).click();
    await expect(page.locator('h1')).toContainText(name);
    shelfId = (await snapshot()).shelves.find((s) => s.name === name)!.id;
    await page.getByRole('button', { name: '新建文件夹', exact: true }).click();
    await page.getByLabel('文件夹名称').fill('阅读手记');
    await page.getByRole('button', { name: '创建文件夹', exact: true }).click();
    await expect(page.locator('h1')).toContainText('阅读手记');
    await page.locator('.new-doc-button').click();
    await page.getByLabel('文档标题', { exact: true }).fill(title);
    await page.getByLabel('任务描述内容').fill('请围绕「{{主题}}」制定一份阅读计划。');
    await page.getByRole('button', { name: '拼装一个模块' }).click();
    await page.getByRole('button', { name: '输出格式', exact: true }).click();
    await page.getByLabel('输出格式内容').fill('给出三个步骤。');
    await page.getByRole('button', { name: '上移输出格式', exact: true }).click();
    await expect(page.locator('.block-heading strong').first()).toHaveText('输出格式');
    await page.getByRole('tab', { name: '变量调试' }).click();
    await page.getByRole('button', { name: '检查提示词' }).click();
    await expect(page.locator('.debug-report')).toContainText('未填写');
    await page.getByPlaceholder('输入主题…').fill('城市建筑');
    await page.getByRole('button', { name: '检查提示词' }).click();
    await expect(page.locator('.debug-report')).toContainText('检查通过');
    await expect(page.locator('.preview-paper')).toContainText('城市建筑');
    await page.getByRole('button', { name: '复制结果', exact: true }).first().click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('城市建筑');
    await page.getByRole('button', { name: '保存文档', exact: true }).click();
    await expect(page.locator('.document-name strong')).toHaveText(title);
    await page.getByRole('button', { name: `复制${title}`, exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('{{主题}}');
    await page.getByRole('button', { name: `收藏${title}`, exact: true }).click();
    await expect(page.getByRole('button', { name: `取消收藏${title}`, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.reload();
    await expect(page.locator('.document-name strong')).toHaveText(title);
    await expect(page.getByRole('button', { name: `取消收藏${title}`, exact: true })).toBeVisible();
    await page.keyboard.press('Control+k');
    await page.getByRole('textbox', { name: '搜索关键词' }).fill(title);
    await page.locator('.search-result').first().click();
    await expect(page.getByLabel('文档标题', { exact: true })).toHaveValue(title);
    await expect(page.locator('.prompt-block')).toHaveCount(2);
    await page.getByRole('button', { name: '关闭编辑器' }).click();
    await page.getByRole('button', { name: '最近访问', exact: true }).click();
    await expect(page.locator('.document-name strong').first()).toHaveText(title);
    await page.getByRole('button', { name: `${title}的更多操作`, exact: true }).click();
    await page.getByRole('menuitem', { name: '创建副本' }).click();
    await expect
      .poll(async () => (await snapshot()).documents.filter((d) => d.title.startsWith(title)).length)
      .toBe(2);
    await page.locator('.shelf-navigation').getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: '编辑货架', exact: true }).click();
    await page.getByRole('button', { name: '删除', exact: true }).click();
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect.poll(async () => (await snapshot()).shelves.some((s) => s.id === shelfId)).toBe(false);
    await expect
      .poll(async () => (await snapshot()).documents.some((d) => d.title.startsWith(title)))
      .toBe(false);
  } finally {
    if (!shelfId) shelfId = (await snapshot()).shelves.find((s) => s.name === name)?.id || '';
    if (shelfId && (await snapshot()).shelves.some((s) => s.id === shelfId))
      await request.post('/api/archive', { data: { action: 'deleteShelf', id: shelfId } });
  }
});

test('手机端导航、主题与独立动画偏好可保存', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('button', { name: '仓库设置', exact: true }).click();
  await page.getByRole('button', { name: '深夜书房', exact: true }).click();
  await page.getByRole('switch', { name: '入仓过渡动画' }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.archive-app')).not.toHaveClass(/room-entering/);
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('button', { name: '仓库设置', exact: true }).click();
  await expect(page.getByRole('switch', { name: '入仓过渡动画' })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('button', { name: '切换浅色主题' }).click();
  await page.getByRole('button', { name: '搜索仓库', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索关键词' }).fill('does-not-exist-2026');
  await expect(page.locator('.search-empty')).toContainText('没有找到');
  await page.getByRole('button', { name: '关闭搜索' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('数据库健康、非法数据校验与来源检查', async ({ request }) => {
  expect((await request.get('/api/health')).ok()).toBe(true);
  const bad = await request.post('/api/archive', {
    data: { action: 'createShelf', name: '', color: 'moss' },
  });
  expect(bad.status()).toBe(400);
  const origin = await request.post('/api/archive', {
    headers: { origin: 'https://invalid.example' },
    data: { action: 'createShelf', name: 'test', color: 'moss' },
  });
  expect(origin.status()).toBe(403);
});
