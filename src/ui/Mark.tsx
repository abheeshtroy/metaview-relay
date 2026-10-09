/** Relay's own mark: two points joined by a hand-off arc. Not a Metaview asset. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      aria-hidden="true"
      className="mark"
    >
      <rect x="0.5" y="0.5" width="25" height="25" rx="8" fill="var(--ink)" />
      <path
        d="M7.5 16.5 C 9 8.5, 17 8.5, 18.5 16.5"
        fill="none"
        stroke="var(--lime)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="7.5" cy="16.5" r="2.4" fill="var(--lime)" />
      <circle
        cx="18.5"
        cy="16.5"
        r="2.4"
        fill="none"
        stroke="var(--lime)"
        strokeWidth="1.6"
      />
    </svg>
  );
}
