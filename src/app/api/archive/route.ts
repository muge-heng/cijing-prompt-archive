import { InputError, mutateArchive, readArchive } from '@/lib/archive-store';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return Response.json(await readArchive(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: '暂时无法读取仓库，请稍后重试。' }, { status: 503 });
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    const host =
      request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host');
    if (origin && host && new URL(origin).host !== host && new URL(origin).host !== new URL(request.url).host)
      return Response.json({ error: '请求来源不匹配。' }, { status: 403 });
    const raw = await request.text();
    if (raw.length > 1400000) throw new InputError('文档过大，请拆分为多个文档。', 413);
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new InputError('请求格式无效。');
    }
    const id = await mutateArchive(payload);
    return Response.json({ id, archive: await readArchive() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof InputError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: '本次操作未保存，请检查连接并重试。' }, { status: 500 });
  }
}
