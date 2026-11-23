'use client';
import { initialArchive } from '@/lib/archive-seed';
import { ArchiveApp } from './archive-app';

const STATIC_INITIAL_TIME = Date.UTC(2026, 0, 1, 4, 0, 0);
const STATIC_INITIAL_ARCHIVE = initialArchive(STATIC_INITIAL_TIME);

export function StaticHome() {
  return (
    <ArchiveApp
      initial={STATIC_INITIAL_ARCHIVE}
      initialTime={STATIC_INITIAL_TIME}
      initialView={{ kind: 'overview' }}
    />
  );
}
