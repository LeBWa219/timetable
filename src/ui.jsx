import { useEffect } from 'react';

// Кольцо прогресса
export function Ring({ done, total, size = 58 }) {
  const circ = 2 * Math.PI * 26;
  const frac = total > 0 ? done / total : 0;
  return (
    <svg className="ring" viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={`Прогресс: ${done} из ${total}`}>
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,.13)" strokeWidth="6" />
      <circle
        cx="32" cy="32" r="26" fill="none" stroke="url(#ringGrad)" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - frac)} transform="rotate(-90 32 32)"
        style={{ transition: 'stroke-dashoffset .5s cubic-bezier(.4,0,.2,1)' }}
      />
      <text x="32" y="36" textAnchor="middle" fontSize="12" fontWeight="700" fill="#e8ecf4">
        {done}/{total}
      </text>
    </svg>
  );
}

const TAG_LABELS = { work: 'работа', self: 'личное', sport: 'спорт', home: 'дом' };
export const TAG_LIST = Object.entries(TAG_LABELS);

export function Tag({ t, late }) {
  if (late) return <span className="tag tag-late">просрочено</span>;
  if (!t) return null;
  return <span className={`tag tag-${t}`}>{TAG_LABELS[t] || t}</span>;
}

// Нижняя стеклянная шторка
export function Sheet({ onClose, children, title }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {children}
      </div>
    </div>
  );
}

export function PulseDot() {
  return <span className="pulse-dot" aria-hidden="true" />;
}
