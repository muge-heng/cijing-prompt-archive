'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icons';
let openCount = 0;
let previousOverflow = '';
export function Overlay({
  children,
  onClose,
  label,
  className = '',
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closer = useRef(onClose);
  useEffect(() => {
    closer.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    if (openCount++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    const root = ref.current;
    const timer = window.setTimeout(
      () => (root?.querySelector<HTMLElement>('[data-autofocus]') || root)?.focus(),
      60,
    );
    const listener = (e: KeyboardEvent) => {
      const layers = document.querySelectorAll('[data-overlay-panel]');
      if (layers[layers.length - 1] !== root) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closer.current();
      }
      if (e.key === 'Tab' && root) {
        const nodes = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ),
        ).filter((n) => n.offsetParent !== null);
        if (!nodes.length) {
          e.preventDefault();
          root.focus();
          return;
        }
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === root)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', listener);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', listener);
      if (--openCount === 0) document.body.style.overflow = previousOverflow;
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      className={`overlay ${className}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="overlay-panel"
        data-overlay-panel
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
export function Dialog({
  title,
  eyebrow,
  children,
  onClose,
  className = '',
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <Overlay label={title} onClose={onClose} className={`dialog ${className}`}>
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <button className="icon-button" aria-label="关闭窗口" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </Overlay>
  );
}
