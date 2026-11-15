import { useEffect, useState, type ReactNode } from 'react';

export const FRAME_W = 1280, FRAME_H = 720;
const fit = () => (typeof window === 'undefined' ? 1 : Math.min(window.innerWidth / FRAME_W, window.innerHeight / FRAME_H));

export function Frame({ children }: { children: ReactNode }) {
  const [k, setK] = useState(fit);
  useEffect(() => {
    const on = () => setK(fit());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return (
    <div className="frame-wrap">
      <div className="frame-box" style={{ width: FRAME_W * k, height: FRAME_H * k }}>
        <div className="frame" style={{ transform: `scale(${k})` }}>{children}</div>
      </div>
    </div>
  );
}

export function Overlay({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className={`overlay-box${wide ? ' wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head">
          <h2>{title}</h2>
          <button className="secondary small" data-sfx="close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="overlay-body">{children}</div>
      </div>
    </div>
  );
}
