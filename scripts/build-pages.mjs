import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appDir = path.join(root, 'src', 'app');
const apiDir = path.join(appDir, 'api');
const pageFile = path.join(appDir, 'page.tsx');
const backupDir = path.join(root, '.pages-backup');
const backupApiDir = path.join(backupDir, 'api');
const backupPageFile = path.join(backupDir, 'page.tsx');
const nextTypesDir = path.join(root, '.next', 'types');
const nextDevTypesDir = path.join(root, '.next', 'dev', 'types');
const outDir = path.join(root, 'out');

const staticPageSource = `import { StaticHome } from '@/components/static-home';

export default function HomePage() {
  return <StaticHome />;
}
`;

function restoreBackup() {
  if (fs.existsSync(backupApiDir)) {
    fs.rmSync(apiDir, { recursive: true, force: true });
    fs.cpSync(backupApiDir, apiDir, { recursive: true });
  }
  if (fs.existsSync(backupPageFile)) {
    fs.copyFileSync(backupPageFile, pageFile);
  }
  fs.rmSync(backupDir, { recursive: true, force: true });
}

if (fs.existsSync(backupDir)) {
  console.log('Detected leftover .pages-backup, restoring first...');
  restoreBackup();
}

fs.mkdirSync(backupDir, { recursive: true });
if (fs.existsSync(apiDir)) {
  fs.cpSync(apiDir, backupApiDir, { recursive: true });
}
fs.copyFileSync(pageFile, backupPageFile);

try {
  fs.rmSync(apiDir, { recursive: true, force: true });
  fs.writeFileSync(pageFile, staticPageSource, 'utf8');
  fs.rmSync(nextTypesDir, { recursive: true, force: true });
  fs.rmSync(nextDevTypesDir, { recursive: true, force: true });
  fs.rmSync(outDir, { recursive: true, force: true });

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/cijing-prompt-archive';
  const nextCli = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');

  const result = spawnSync(process.execPath, [nextCli, 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      STATIC_EXPORT: 'true',
      NEXT_PUBLIC_STATIC_EXPORT: 'true',
      NEXT_PUBLIC_BASE_PATH: basePath,
    },
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, '.nojekyll'), '', 'utf8');
    console.log(`Static GitHub Pages build generated in ${outDir} (basePath: ${basePath || '/'})`);
  }
} finally {
  restoreBackup();
}
