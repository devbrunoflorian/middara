import type { SVGProps } from 'react';

/** A compact app-drawn Middara M mark, styled with the bundled Cinzel Decorative face. */
export function MiddaraMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path className="middara-mark-frame" d="M16 1.9 28.4 7v8.2c0 6.2-4.7 11.3-12.4 15C8.3 26.5 3.6 21.4 3.6 15.2V7L16 1.9Z" />
      <path className="middara-mark-letter" d="M9.1 22V10.2l6.9 7.1 6.9-7.1V22" />
      <path className="middara-mark-sigil" d="m16 4.4 1.4 2.3L16 9l-1.4-2.3L16 4.4ZM16 23.2l1.2 1.9-1.2 1.8-1.2-1.8 1.2-1.9Z" />
    </svg>
  );
}
