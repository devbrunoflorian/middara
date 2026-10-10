import type { ImgHTMLAttributes } from 'react';

/** Canonical Middara emblem used in the application shell. */
export function MiddaraMark(props: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src="/brand/middara-emblem-256.webp"
      alt=""
      width={32}
      height={32}
      decoding="async"
      draggable={false}
      {...props}
    />
  );
}
