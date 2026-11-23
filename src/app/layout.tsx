import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './workspace.css';
import './workbench.css';
import './responsive.css';

export const metadata: Metadata = {
  title: '词境仓库 · Prompt Archive',
  description: '一座收藏灵感的私人提示词仓库。在货架、文件夹与文档之间，有序整理、编写与调试你的提示词。',
  icons: { icon: '/archive.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f4f1e9' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=JSON.parse(localStorage.getItem('archive-preferences')||'{}');if(p.theme==='dark')document.documentElement.dataset.theme='dark';if(p.motion===false)document.documentElement.dataset.motion='off'}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
