import { useEffect, useId, useRef, useState } from 'react';
import type { SkeletonLayout, SkeletonPage } from '../skeletonGeometry';

const settled = new Map<number, SkeletonPage>();
const requests = new Map<number, Promise<SkeletonPage>>();

function loadSkeletonPage(pageNumber: number): Promise<SkeletonPage> {
  const cached = settled.get(pageNumber);
  if (cached) return Promise.resolve(cached);
  const pending = requests.get(pageNumber);
  if (pending) return pending;
  const page = String(pageNumber).padStart(3, '0');
  const request = fetch(`/pages/page_${page}/skeleton-layout.json`)
    .then(async response => {
      if (!response.ok) throw new Error('Page geometry unavailable.');
      const layout = await response.json() as SkeletonPage;
      settled.set(pageNumber, layout);
      return layout;
    })
    .finally(() => requests.delete(pageNumber));
  requests.set(pageNumber, request);
  return request;
}

export function useSkeletonLayout(pageNumber: number, language: 'en' | 'pt-BR', enabled = true) {
  const [resolved, setResolved] = useState<{ pageNumber: number; layout: SkeletonPage }>();
  const cached = settled.get(pageNumber);
  useEffect(() => {
    if (!enabled || cached) return;
    let active = true;
    void loadSkeletonPage(pageNumber).then(layout => {
      if (active) setResolved({ pageNumber, layout });
    }).catch(() => {
      // Without geometric data the page sheet stays empty.
    });
    return () => { active = false; };
  }, [pageNumber, enabled, cached]);
  return (cached ?? (resolved?.pageNumber === pageNumber ? resolved.layout : undefined))?.[language];
}

export function PageSkeletonRegions({ layout }: { layout?: SkeletonLayout }) {
  const clipId = `page-skeleton-${useId()}`;
  if (!layout) return null;
  return (
    <div className="page-skeleton-regions" aria-hidden="true">
      <svg className="page-skeleton-geometry">
        <defs>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox" transform={`scale(${1 / layout.width} ${1 / layout.height})`}>
            {layout.items.map(([kind, x, y, width, height, rotation]) => {
              const isText = kind === 'text';
              const inset = isText ? Math.min(height * 0.15, 2.5) : 0;
              return (
                <rect key={[kind, x, y, width, height, rotation].join(',')} data-region={kind}
                  x={x} y={y + inset} width={width} height={height - 2 * inset}
                  rx={isText ? 3 : 6}
                  transform={rotation ? `rotate(${rotation} ${x + width / 2} ${y + height / 2})` : undefined}
                />
              );
            })}
          </clipPath>
        </defs>
      </svg>
      <div className="page-skeleton-shimmer" style={{ clipPath: `url(#${clipId})` }} />
    </div>
  );
}

export function DeferredPageSkeletonRegions({ pageNumber, language }: {
  pageNumber: number; language: 'en' | 'pt-BR';
}) {
  const host = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const layout = useSkeletonLayout(pageNumber, language, nearViewport);
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setNearViewport(entry.isIntersecting);
    }, { rootMargin: '240px' });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="page-skeleton-regions" ref={host} aria-hidden="true">
      {nearViewport && <PageSkeletonRegions layout={layout} />}
    </div>
  );
}
