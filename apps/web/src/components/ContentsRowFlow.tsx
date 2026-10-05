import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CONTENTS_LEADER_GAP_PT, type ContentsRowDefinition } from '../contentsRows';

interface ContentsRowFlowProps {
  row: ContentsRowDefinition;
  scale: number;
  isAdmin: boolean;
  text: string;
  children?: ReactNode;
}

/** Text and leader share one bounded line; the page reference is rendered separately. */
export function ContentsRowFlow({ row, scale, isAdmin, text, children }: ContentsRowFlowProps) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const element = textRef.current;
    if (!element) return;
    let active = true;
    const measure = () => {
      if (active) setOverflow(element.scrollWidth > element.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.parentElement) observer.observe(element.parentElement);
    void document.fonts.ready.then(measure);
    document.fonts.addEventListener('loadingdone', measure);
    return () => {
      active = false;
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', measure);
    };
  }, [text, scale]);

  const height = (row.labelBBox[3] - row.labelBBox[1]) * scale;
  const leaderY = (row.leader.yPt - row.labelBBox[1]) * scale;
  return <div className="contents-row-flow" data-overflow={overflow || undefined}>
    <span ref={textRef} className="contents-row-text" title={text}>{children}</span>
    <svg className="contents-row-leader" aria-hidden="true"
      style={{ height, marginInlineStart: CONTENTS_LEADER_GAP_PT * scale }}>
      <line x1="0" x2="100%" y1={leaderY} y2={leaderY} stroke="#231f20"
        strokeWidth={row.leader.widthPt * scale} strokeLinecap="round"
        strokeDasharray={`0 ${row.leader.periodPt * scale}`} />
    </svg>
    {isAdmin && overflow && <span className="contents-row-overflow" role="status">
      Texto excede a largura máxima
    </span>}
  </div>;
}
