import { BrassPull, Icon } from './icons';
import type { Shelf } from '@/lib/archive-types';
export function ShelfCard({
  shelf,
  number,
  folders,
  documents,
  onClick,
}: {
  shelf: Shelf;
  number: number;
  folders: number;
  documents: number;
  onClick: () => void;
}) {
  return (
    <button
      className={`shelf-card tone-${shelf.color}`}
      onClick={onClick}
      aria-label={`打开${shelf.name}货架，${folders} 个文件夹，${documents} 篇提示词`}
      style={{ animationDelay: `${number * 65}ms` }}
    >
      <div className="drawer-front">
        <div className="drawer-inset" />
        <span className="drawer-number">SHELF Nº {String(number).padStart(2, '0')}</span>
        <span className="drawer-index">{String(number).padStart(2, '0')} / A</span>
        <i className="drawer-screw top-left" />
        <i className="drawer-screw top-right" />
        <i className="drawer-screw bottom-left" />
        <i className="drawer-screw bottom-right" />
        <div className="brass-label">
          <i />
          <div className="paper-label">
            <strong>{shelf.name}</strong>
            <small>{shelf.english}</small>
          </div>
          <i />
        </div>
        <BrassPull id={shelf.id} />
      </div>
      <div className="shelf-caption">
        <span>
          <Icon name="folder" size={14} />
          {folders} 个文件夹
        </span>
        <b>·</b>
        <span>
          <Icon name="file" size={14} />
          {documents} 篇提示词
        </span>
        <Icon name="arrow" size={15} className="caption-arrow" />
      </div>
    </button>
  );
}
