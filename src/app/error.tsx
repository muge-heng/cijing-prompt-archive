'use client';
import { ArchiveMark, Icon } from '@/components/icons';
export default function ArchiveError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="connection-page">
      <section>
        <ArchiveMark size={52} />
        <div className="eyebrow">ARCHIVE CONNECTION</div>
        <h1>档案室暂未连接</h1>
        <p>暂时无法读取馆藏数据。请稍后重试，你已归档的文档不会因此丢失。</p>
        <button className="button primary" onClick={reset}>
          <Icon name="history" size={15} />
          重新连接仓库
        </button>
      </section>
    </main>
  );
}
