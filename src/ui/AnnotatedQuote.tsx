import type { ReactNode } from 'react';
import { findEvidence } from '../relay/reduce';

interface Props {
  text: string;
  phrases: string[];
}

/** Jeremy's exact words, with the phrases Relay linked to the role highlighted. */
export function AnnotatedQuote({ text, phrases }: Props) {
  const ranges = phrases
    .map((p) => ({ start: findEvidence(text, p), length: p.length }))
    .filter((r) => r.start >= 0)
    .sort((a, b) => a.start - b.start);

  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start < cursor) return;
    parts.push(text.slice(cursor, r.start));
    parts.push(
      <mark key={r.start} style={{ animationDelay: `${200 + i * 260}ms` }}>
        {text.slice(r.start, r.start + r.length)}
      </mark>,
    );
    cursor = r.start + r.length;
  });
  parts.push(text.slice(cursor));

  return <blockquote className="voice annotated">{parts}</blockquote>;
}
