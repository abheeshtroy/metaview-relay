import { useEffect, useRef, type ReactNode } from 'react';
import { Mark } from './Mark';

interface Props {
  eyebrow: string;
  headline: ReactNode;
  /** Why this step matters, in one sentence. */
  why: string;
  /** What Relay is doing at this step. */
  relay: string;
  /** What happens after the primary action. */
  next: string;
  /** The one primary action, plus at most one quiet alternative. */
  actions: ReactNode;
  tone?: 'transition';
  children?: ReactNode;
}

/** One guided Interview step: who, why, what Relay does, one action, what's next. */
export function GuideScreen({
  eyebrow,
  headline,
  why,
  relay,
  next,
  actions,
  tone,
  children,
}: Props) {
  const heading = useRef<HTMLHeadingElement>(null);

  // Each step mounts fresh: move focus to its headline and bring it into view.
  useEffect(() => {
    const h = heading.current;
    if (!h) return;
    h.focus({ preventScroll: true });
    const top = h.closest('.guide')?.getBoundingClientRect().top ?? 0;
    if (top < 0) h.closest('.guide')?.scrollIntoView?.({ block: 'start' });
  }, []);

  return (
    <section className={`guide-screen ${tone ?? ''}`} aria-labelledby="guide-headline">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id="guide-headline" ref={heading} tabIndex={-1}>
        {headline}
      </h2>
      <p className="guide-why">{why}</p>
      {children && <div className="guide-body">{children}</div>}
      <p className="guide-relay">
        <Mark size={18} />
        <span>
          <strong>Relay</strong> {relay}
        </span>
      </p>
      <footer className="guide-foot">
        <p className="guide-next">
          <span className="guide-next-label">Next</span> {next}
        </p>
        <div className="guide-actions">{actions}</div>
      </footer>
    </section>
  );
}
