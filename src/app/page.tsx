import { readWorkspaceSnapshot } from '@/lib/archive-store';
import { resolveView } from '@/lib/archive-navigation';
import { ArchiveApp } from '@/components/archive-app';

export const dynamic = 'force-dynamic';
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [snapshot, query] = await Promise.all([readWorkspaceSnapshot(), searchParams]);
  return <ArchiveApp {...snapshot} initialView={resolveView(query.view, query.id, snapshot.initial)} />;
}
