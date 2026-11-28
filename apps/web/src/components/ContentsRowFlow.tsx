import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CONTENTS_LEADER_GAP_PT, type ContentsRowDefinition } from '../contentsRows';

interface ContentsRowFlowProps {
  row: ContentsRowDefinition;
  scale: number;
  fontScale?: number;
  sourceFontSize: number;
  isAdmin: boolean;
  text: string;
  referenceText?: string;
  descenderClearancePt?: number;
  children?: ReactNode;
}

/** Text, leader, and an optional page reference share one bounded line. */
export function ContentsRowFlow({ row, scale, fontScale = 1, sourceFontSize, isAdmin, text, referenceText,
  descenderClearancePt = 0, children }: ContentsRowFlowProps) {
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
  const descenderClearance = Math.max(0, descenderClearancePt) * scale;
  // The wrapper creates the inline formatting context; keep its inherited font
  // metrics at the source row size so small TOC labels don't fall on edit.
  return <div className="contents-row-flow" data-overflow={overflow || undefined}
    style={{ fontSize: `${sourceFontSize * fontScale * scale}px` }}>
    <span ref={textRef} className="contents-row-text" title={text}
      style={descenderClearance ? { paddingBlockEnd: descenderClearance, marginBlockEnd: -descenderClearance } : undefined}>
      {children}
    </span>
    {row.leader.style !== 'none' && <svg className="contents-row-leader" aria-hidden="true"
      style={{ height, marginInlineStart: CONTENTS_LEADER_GAP_PT * scale,
        marginInlineEnd: referenceText ? CONTENTS_LEADER_GAP_PT * scale : 0 }}>
      <line x1="0" x2="100%" y1={leaderY} y2={leaderY} stroke="#231f20"
        strokeWidth={row.leader.widthPt * scale} strokeLinecap="round"
        strokeDasharray={row.leader.style === 'solid' ? undefined : `0 ${row.leader.periodPt * scale}`} />
    </svg>}
    {referenceText && <span className="contents-row-reference" aria-label={`página ${referenceText}`}>
      {referenceText}
    </span>}
    {isAdmin && overflow && <span className="contents-row-overflow" role="status">
      Texto excede a largura máxima
    </span>}
  </div>;
}
