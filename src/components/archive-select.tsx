'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { ShelfColor } from '@/lib/archive-types';
import { Icon, type IconName } from './icons';

export interface SelectOption {
  value: string;
  label: string;
  tone?: ShelfColor;
  group?: string;
  subtitle?: string;
}

export interface ArchiveSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  icon?: IconName;
  className?: string;
  align?: 'left' | 'right';
  matchWidth?: boolean;
  compact?: boolean;
}

export function ArchiveSelect({
  value,
  options,
  onChange,
  ariaLabel,
  icon,
  className = '',
  align = 'left',
  matchWidth = false,
  compact = false,
}: ArchiveSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listboxId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : options[0];

  const openMenu = (startIndex?: number) => {
    if (!options.length) return;
    const initial =
      typeof startIndex === 'number' ? startIndex : selectedIndex >= 0 ? selectedIndex : 0;
    setActiveIndex(initial);
    setOpen(true);
  };

  const commitOption = (option: SelectOption) => {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
        return;
      }
      if (e.key === 'Tab') {
        setOpen(false);
        return;
      }
      if (!options.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((prev) => (prev + 1) % options.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((prev) => (prev - 1 + options.length) % options.length);
      } else if (e.key === 'Home') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex(options.length - 1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const chosen = options[activeIndex];
        if (chosen) {
          onChange(chosen.value);
        }
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, activeIndex, options, onChange]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  return (
    <div
      ref={rootRef}
      className={`archive-select ${compact ? 'is-compact' : ''} ${open ? 'is-open' : ''} ${className}`}
    >
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-activedescendant={open && options[activeIndex] ? `${listboxId}-opt-${activeIndex}` : undefined}
        className={`archive-select-trigger ${compact ? 'is-compact' : ''} ${open ? 'is-open' : ''}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            openMenu(
              e.key === 'ArrowUp' && options.length
                ? selectedIndex >= 0
                  ? selectedIndex
                  : options.length - 1
                : undefined,
            );
          }
        }}
      >
        {icon && <Icon name={icon} size={compact ? 14 : 15} className="archive-select-icon" />}
        {selectedOption?.tone && (
          <span className={`select-tone-dot tone-${selectedOption.tone}`} aria-hidden="true" />
        )}
        <span className="archive-select-value">{selectedOption?.label || '请选择…'}</span>
        <Icon name="down" size={compact ? 12 : 13} className="archive-select-chevron" />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className={`archive-select-menu ${align === 'right' ? 'align-right' : 'align-left'} ${matchWidth ? 'match-width' : ''}`}
        >
          {options.map((opt, idx) => {
            const showGroup = Boolean(opt.group && opt.group !== options[idx - 1]?.group);
            const selected = opt.value === value;
            const highlighted = idx === activeIndex;
            return (
              <div key={`${opt.group || 'root'}-${opt.value}-${idx}`} className="archive-select-item-wrap">
                {showGroup && (
                  <div className="archive-select-group" role="presentation">
                    {opt.tone && (
                      <span className={`select-tone-dot tone-${opt.tone}`} aria-hidden="true" />
                    )}
                    <span>{opt.group}</span>
                  </div>
                )}
                <button
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  id={`${listboxId}-opt-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`archive-select-option ${selected ? 'is-selected' : ''} ${highlighted ? 'is-highlighted' : ''}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => commitOption(opt)}
                >
                  {opt.tone && !opt.group && (
                    <span className={`select-tone-dot tone-${opt.tone}`} aria-hidden="true" />
                  )}
                  <span className="archive-select-option-copy">
                    <span>{opt.label}</span>
                    {opt.subtitle && <small>{opt.subtitle}</small>}
                  </span>
                  {selected && <Icon name="check" size={13} className="archive-select-check" />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
