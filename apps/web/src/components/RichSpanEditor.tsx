import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import './RichSpanEditor.css';
import puaMappingRaw from '../assets/pua_mapping.json';
import type { AdminSymbolPaletteEditorState } from './AdminSymbolPalette';
import { getDefaultSymbolAliasPreferences, getSemanticSymbol, getSymbolEditorToken, isSymbolAllowed, type InlineEditorContext, type InlineSymbolMetrics, type SymbolAliasPreferences } from '../symbols/semanticSymbols';
import { SemanticSymbol } from '../symbols/SemanticSymbol';
import { SYMBOL_OBJECT_MARKER, editableTextForSegments, segmentsFromEditableText, replaceSegmentRange, insertEditorToken, deleteEditorToken, expandEditorTokenSelection, normalizeEditableInput } from '../symbols/inlineCodec';
import { collectManagedSourceSymbols, initialManagedSourceSymbols, createEditorOverride, lineHeightModeForOverride } from '../symbols/editorOverride';
import { INLINE_CLIPBOARD_MIME, editableRangeToSegmentRange, sliceSegmentRange, encodeInlineClipboard, decodeInlineClipboard } from '../symbols/inlineClipboard';

const PUA_MAPPING: Record<string, {name: string, pua_char: string, hex: string}[]> = puaMappingRaw;

/* ─────────────────────────────────────────────
   Available font families (match fonts.css)
   ───────────────────────────────────────────── */
const AVAILABLE_FONTS = [
  { label: 'Optima LT Std', value: "OptimaLTStd" },
  { label: 'Adobe Garamond Pro', value: "AGaramondPro" },
  { label: 'Cinzel', value: "CinzelLocal" },
  { label: 'Cinzel Decorative', value: "Cinzel Decorative" },
  { label: 'Esmeralda Pro', value: "EsmeraldaPro" },
  { label: 'Esmeralda Pro (PUA)', value: "EsmeraldaPro-PUA" },
  { label: 'Inter (sans)', value: "Inter" },
];

const FONT_WEIGHTS = [400, 500, 600, 700, 900, 950];

const editorFontForSource = (font: string) => {
  if (font.includes('Optima')) return 'OptimaLTStd';
  if (font.includes('Garamond')) return 'AGaramondPro';
  if (font.includes('Decorative')) return 'Cinzel Decorative';
  if (font.includes('Cinzel')) return 'CinzelLocal';
  if (font.includes('EsmeraldaPro-PUA')) return 'EsmeraldaPro-PUA';
  if (font.includes('Esmeralda')) return 'EsmeraldaPro';
  return font;
};

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */
export interface Segment {
  text: string;
  font: string;
  size: number;
  color: string;
  weight: number;
  style: 'normal' | 'italic';
  disableLigatures?: boolean;
  /** Preserve PDF text outline effects on editable color runs. */
  textStrokeWidthPt?: number;
  textStrokeColor?: string;
  /** Stable semantic symbol ID; `text` carries one object-replacement marker. */
  symbolId?: string;
  /** Per-occurrence PDF metrics; optional and compatible with existing JSON. */
  symbolMetrics?: InlineSymbolMetrics;
}

export type TextAlignment = 'left' | 'center' | 'right' | 'justify';
export type LineHeightMode = 'source' | 'custom';

export interface SpanOverride {
  spanKey: string;
  segments: Segment[];
  bbox: [number, number, number, number];
  textAlign?: TextAlignment;
  /** Unitless CSS line height used for explicit line breaks and wrapped rows. */
  lineHeight?: number;
  /** Source leading is the default; `custom` means the admin changed the control. */
  lineHeightMode?: LineHeightMode;
  /** Source IDs adopted by this edit, including objects deliberately deleted. */
  managedSourceSymbols?: string[];
}

interface RichSpanEditorProps {
  spanKey: string;
  editorLabel?: string;
  originalText: string;
  originalFont: string;
  originalSize: number;
  originalColor: string;
  originalWeight: number;
  originalStyle: 'normal' | 'italic';
  originalSegments?: Segment[];
  originalTextAlign?: TextAlignment;
  originalLineHeight?: number;
  bbox: [number, number, number, number];
  pageNumber: number;
  language: 'en' | 'pt-BR';
  onClose: () => void;
  onSave: (override: SpanOverride | null) => void;
  existingOverride?: SpanOverride | null;
  onDraftChange?: (draft: SpanOverride | null) => void;
  singleLine?: boolean;
  editorContext?: InlineEditorContext;
  symbolAliasPreferences?: SymbolAliasPreferences;
  onPaletteEditorChange?: (editorKey: string, state: AdminSymbolPaletteEditorState | null) => void;
}

interface EditorSnapshot {
  segments: Segment[];
  textAlign: TextAlignment;
  lineHeight: number;
  lineHeightMode: LineHeightMode;
  isEditingText: boolean;
  editText: string;
  editTextBaseline: string;
  editTextSegments: Segment[];
  managedSourceSymbols: string[];
  editInitialManagedSourceSymbols: string[];
  editSelectionStart: number;
  editSelectionEnd: number;
  selStart: number | null;
  selEnd: number | null;
  toolFont: string;
  toolWeight: number;
  toolStyle: 'normal' | 'italic';
  toolColor: string;
  toolSize: number;
  toolLigatures: boolean;
}

export const RichSpanEditor: React.FC<RichSpanEditorProps> = ({
  spanKey,
  editorLabel,
  originalText,
  originalFont,
  originalSize,
  originalColor,
  originalWeight,
  originalStyle,
  originalSegments,
  originalTextAlign = 'left',
  originalLineHeight = 1,
  bbox,
  pageNumber,
  language,
  onClose,
  onSave,
  existingOverride,
  onDraftChange,
  singleLine = false,
  editorContext = 'paragraph',
  symbolAliasPreferences = getDefaultSymbolAliasPreferences(),
  onPaletteEditorChange,
}) => {
  const normalizeText = useCallback((text: string) => (
    singleLine ? text.replace(/[\r\n]+/g, ' ').replace(/[\t ]+/g, ' ') : text
  ), [singleLine]);

  const baseSegments = useMemo<Segment[]>(() => {
    const normalizeSegments = (items: Segment[]) => singleLine
      ? items.map(segment => ({ ...segment, text: normalizeText(segment.text) }))
      : items;
    if (existingOverride) {
      return normalizeSegments(existingOverride.segments);
    }
    if (originalSegments && originalSegments.length > 0) return normalizeSegments(originalSegments);
    return [{
      text: normalizeText(originalText),
      font: originalFont,
      size: originalSize,
      color: originalColor,
      weight: originalWeight,
      style: originalStyle,
    }];
  }, [existingOverride, originalSegments, originalText, originalFont, originalSize, originalColor, originalWeight, originalStyle, normalizeText, singleLine]);
  const baseTextAlign = existingOverride?.textAlign ?? originalTextAlign;
  const baseLineHeightMode = lineHeightModeForOverride(existingOverride);
  const baseLineHeight = baseLineHeightMode === 'custom' ? existingOverride?.lineHeight ?? originalLineHeight : originalLineHeight;
  const baseManagedSourceSymbols = useMemo(() => initialManagedSourceSymbols(originalSegments ?? baseSegments, existingOverride),
    [originalSegments, baseSegments, existingOverride]);
  const [managedSourceSymbols, setManagedSourceSymbols] = useState(baseManagedSourceSymbols);

  // Segments = the array of styled character runs
  const [segments, setSegments] = useState<Segment[]>(baseSegments);
  // Selection range (character indices into the flattened text)
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Current tool settings
  const [toolFont, setToolFont] = useState(() => editorFontForSource(originalFont));
  const [toolWeight, setToolWeight] = useState(originalWeight);
  const [toolStyle, setToolStyle] = useState<'normal' | 'italic'>(originalStyle);
  const [toolColor, setToolColor] = useState(originalColor);
  const [toolSize, setToolSize] = useState(originalSize);
  const [toolLigatures, setToolLigatures] = useState(true);
  const [textAlign, setTextAlign] = useState<TextAlignment>(baseTextAlign);
  const [lineHeight, setLineHeight] = useState(baseLineHeight);
  const [lineHeightMode, setLineHeightMode] = useState<LineHeightMode>(baseLineHeightMode);
  // Text editing
  const [isEditingText, setIsEditingText] = useState(false);
  const [editText, setEditText] = useState('');
  const [editTextBaseline, setEditTextBaseline] = useState('');
  // Keep the latest rich projection: reparsing every keystroke against the
  // original text loses styles between two independently changed regions.
  const [editTextSegments, setEditTextSegments] = useState<Segment[]>([]);
  const [editInitialManagedSourceSymbols, setEditInitialManagedSourceSymbols] = useState<string[]>([]);
  const [symbolPaletteStatus, setSymbolPaletteStatus] = useState<string | null>(null);
  const [undoHistory, setUndoHistory] = useState<EditorSnapshot[]>([]);
  const [redoHistory, setRedoHistory] = useState<EditorSnapshot[]>([]);

  const charGridRef = useRef<HTMLDivElement>(null);
  const editTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const editSelectionRef = useRef({ start: 0, end: 0 });
  const charSelectionAnchorRef = useRef({ start: 0, end: 0 });

  const createSnapshot = useCallback((): EditorSnapshot => {
    const textarea = editTextAreaRef.current;
    return {
      segments: segments.map(segment => ({ ...segment })),
      textAlign,
      lineHeight,
      lineHeightMode,
      isEditingText,
      editText,
      editTextBaseline,
      editTextSegments: editTextSegments.map(segment => ({ ...segment })),
      managedSourceSymbols: [...managedSourceSymbols],
      editInitialManagedSourceSymbols: [...editInitialManagedSourceSymbols],
      editSelectionStart: textarea?.selectionStart ?? editSelectionRef.current.start,
      editSelectionEnd: textarea?.selectionEnd ?? editSelectionRef.current.end,
      selStart,
      selEnd,
      toolFont,
      toolWeight,
      toolStyle,
      toolColor,
      toolSize,
      toolLigatures,
    };
  }, [segments, textAlign, lineHeight, lineHeightMode, isEditingText, editText, editTextBaseline, editTextSegments, managedSourceSymbols, editInitialManagedSourceSymbols, selStart, selEnd, toolFont, toolWeight, toolStyle, toolColor, toolSize, toolLigatures]);

  const pushHistory = useCallback(() => {
    const snapshot = createSnapshot();
    setUndoHistory(history => [...history.slice(-49), snapshot]);
    setRedoHistory([]);
  }, [createSnapshot]);

  const restoreSnapshot = useCallback((snapshot: EditorSnapshot) => {
    setSegments(snapshot.segments.map(segment => ({ ...segment })));
    setTextAlign(snapshot.textAlign);
    setLineHeight(snapshot.lineHeight);
    setLineHeightMode(snapshot.lineHeightMode);
    setIsEditingText(snapshot.isEditingText);
    setEditText(snapshot.editText);
    setEditTextBaseline(snapshot.editTextBaseline);
    setEditTextSegments(snapshot.editTextSegments.map(segment => ({ ...segment })));
    setManagedSourceSymbols([...snapshot.managedSourceSymbols]);
    setEditInitialManagedSourceSymbols([...snapshot.editInitialManagedSourceSymbols]);
    setSelStart(snapshot.selStart);
    setSelEnd(snapshot.selEnd);
    setToolFont(snapshot.toolFont);
    setToolWeight(snapshot.toolWeight);
    setToolStyle(snapshot.toolStyle);
    setToolColor(snapshot.toolColor);
    setToolSize(snapshot.toolSize);
    setToolLigatures(snapshot.toolLigatures);
    editSelectionRef.current = { start: snapshot.editSelectionStart, end: snapshot.editSelectionEnd };
    requestAnimationFrame(() => {
      const textarea = editTextAreaRef.current;
      if (snapshot.isEditingText && textarea) {
        textarea.focus();
        textarea.setSelectionRange(snapshot.editSelectionStart, snapshot.editSelectionEnd);
      }
    });
  }, []);

  const undo = useCallback(() => {
    if (undoHistory.length === 0) return;
    const snapshot = undoHistory[undoHistory.length - 1];
    setRedoHistory(history => [...history, createSnapshot()]);
    setUndoHistory(history => history.slice(0, -1));
    restoreSnapshot(snapshot);
    setSymbolPaletteStatus(language === 'pt-BR' ? 'Ação desfeita.' : 'Action undone.');
  }, [undoHistory, createSnapshot, restoreSnapshot, language]);

  const redo = useCallback(() => {
    if (redoHistory.length === 0) return;
    const snapshot = redoHistory[redoHistory.length - 1];
    setUndoHistory(history => [...history, createSnapshot()]);
    setRedoHistory(history => history.slice(0, -1));
    restoreSnapshot(snapshot);
    setSymbolPaletteStatus(language === 'pt-BR' ? 'Ação refeita.' : 'Action redone.');
  }, [redoHistory, createSnapshot, restoreSnapshot, language]);

  const commitSegments = useCallback((next: Segment[]) => {
    pushHistory();
    setSegments(next);
    setManagedSourceSymbols(previous => collectManagedSourceSymbols(previous, next));
  }, [pushHistory]);

  const changeTextAlign = useCallback((next: TextAlignment) => {
    if (next === textAlign) return;
    pushHistory();
    setTextAlign(next);
  }, [textAlign, pushHistory]);

  const changeLineHeight = useCallback((next: number) => {
    if (!Number.isFinite(next)) return;
    const value = Math.min(2.5, Math.max(0.6, next));
    if (Math.abs(value - lineHeight) < 0.001) return;
    pushHistory();
    setLineHeight(value);
    setLineHeightMode('custom');
  }, [lineHeight, pushHistory]);

  useEffect(() => {
    setTextAlign(baseTextAlign);
  }, [spanKey, baseTextAlign]);

  useEffect(() => {
    setLineHeight(baseLineHeight);
    setLineHeightMode(baseLineHeightMode);
  }, [spanKey, baseLineHeight, baseLineHeightMode]);

  useEffect(() => {
    setToolFont(editorFontForSource(originalFont));
    setToolWeight(originalWeight);
    setToolStyle(originalStyle);
    setToolColor(originalColor);
    setToolSize(originalSize);
    setToolLigatures(true);
    setSelStart(null);
    setSelEnd(null);
    setIsEditingText(false);
    setEditText('');
    setEditTextBaseline('');
    setEditTextSegments([]);
    setEditInitialManagedSourceSymbols([]);
    editSelectionRef.current = { start: 0, end: 0 };
    setSymbolPaletteStatus(null);
    setUndoHistory([]);
    setRedoHistory([]);
  }, [spanKey, language, originalFont, originalWeight, originalStyle, originalColor, originalSize]);

  // Initialize segments from existing override or original span
  useEffect(() => {
    setSegments(baseSegments);
    setManagedSourceSymbols(baseManagedSourceSymbols);
  }, [spanKey, baseSegments, baseManagedSourceSymbols]);

  // Flatten segments to characters with their style info
  const chars = useMemo(() => {
    const result: { char: string; start: number; end: number; segIdx: number; font: string; weight: number; style: 'normal' | 'italic'; color: string; size: number; symbolId?: string }[] = [];
    let offset = 0;
    segments.forEach((seg, segIdx) => {
      for (const ch of seg.text) {
        result.push({
          char: ch,
          start: offset,
          end: offset + ch.length,
          segIdx,
          font: seg.font,
          weight: seg.weight,
          style: seg.style,
          color: seg.color,
          size: seg.size,
          symbolId: seg.symbolId,
        });
        offset += ch.length;
      }
    });
    return result;
  }, [segments]);

  const segmentsChanged = JSON.stringify(segments) !== JSON.stringify(baseSegments);
  const textChanged = isEditingText && editText !== editTextBaseline;
  const hasDraftChanges = segmentsChanged || textChanged || textAlign !== baseTextAlign
    || Math.abs(lineHeight - baseLineHeight) > 0.001
    || lineHeightMode !== baseLineHeightMode
    || JSON.stringify(managedSourceSymbols) !== JSON.stringify(baseManagedSourceSymbols);

  const requestClose = useCallback(() => {
    if (language === 'pt-BR' && hasDraftChanges && !window.confirm('Há alterações de tradução não salvas. Quer sair e descartá-las?')) {
      return;
    }
    onClose();
  }, [language, hasDraftChanges, onClose]);

  useEffect(() => {
    if (!onDraftChange) return;
    if (!hasDraftChanges) {
      onDraftChange(null);
      return;
    }

    const previewSegments = isEditingText ? editTextSegments : segments;
    onDraftChange(createEditorOverride(spanKey, bbox, textAlign, previewSegments, managedSourceSymbols, lineHeight, lineHeightMode));
  }, [segments, editTextSegments, textAlign, lineHeight, lineHeightMode, onDraftChange, spanKey, bbox, hasDraftChanges, isEditingText, managedSourceSymbols]);

  // Selection helpers
  const hasSelection = selStart !== null && selEnd !== null && selStart !== selEnd;
  const selMin = hasSelection ? Math.min(selStart!, selEnd!) : null;
  const selMax = hasSelection ? Math.max(selStart!, selEnd!) : null;

  // When selection changes, update tool to match first selected char
  useEffect(() => {
    const c = chars.find(char=>char.start===selMin);
    if (c && selMin !== null) {
      setToolFont(c.font);
      setToolWeight(c.weight);
      setToolStyle(c.style);
      setToolColor(c.color);
      setToolSize(c.size);
      
      // Find the segment that contains this character to get the disableLigatures flag
      let charCount = 0;
      for (const seg of segments) {
        if (selMin >= charCount && selMin < charCount + seg.text.length) {
          setToolLigatures(!seg.disableLigatures);
          break;
        }
        charCount += seg.text.length;
      }
    }
  }, [selMin, chars, segments]);

  // Determine if the single selected character has PUA alternates
  const availableAlternates = useMemo(() => {
    if (selMin !== null && selMax !== null && selMax - selMin === 1) {
      const selectedChar = chars.find(c=>c.start===selMin);
      if (!selectedChar || selectedChar.symbolId) return null;
      const char = selectedChar.char;
      let baseChar = char;
      
      // If char is already an alternate, find base
      for (const [base, alts] of Object.entries(PUA_MAPPING)) {
        if (alts.some((a: any) => a.pua_char === char)) {
          baseChar = base;
          break;
        }
      }
      
      const alts = PUA_MAPPING[baseChar];
      if (alts && alts.length > 0) {
        return { baseChar, alts };
      }
    }
    return null;
  }, [selMin, selMax, chars]);

  // Apply current tool settings to selected range
  const applyToSelection = useCallback((overrides?: Partial<{font: string, weight: number, style: 'normal'|'italic', color: string, size: number, ligatures: boolean}>) => {
    if (selMin === null || selMax === null) return;
    
    const finalFont = overrides?.font ?? toolFont;
    const finalWeight = overrides?.weight ?? toolWeight;
    const finalStyle = overrides?.style ?? toolStyle;
    const finalColor = overrides?.color ?? toolColor;
    const finalSize = overrides?.size ?? toolSize;
    const finalLigatures = overrides?.ligatures ?? toolLigatures;

    // Build new segments by splitting at selection boundaries
    const newSegments: Segment[] = [];
    let charIdx = 0;

    for (const seg of segments) {
      const segStart = charIdx;
      const segEnd = charIdx + seg.text.length;

      // No overlap with selection
      if (segEnd <= selMin || segStart >= selMax) {
        newSegments.push({ ...seg });
      }
      // Fully inside selection
      else if (segStart >= selMin && segEnd <= selMax) {
        newSegments.push({
          ...seg,
          font: finalFont,
          weight: finalWeight,
          style: finalStyle,
          color: finalColor,
          size: finalSize,
          disableLigatures: !finalLigatures,
        });
      }
      // Partial overlap
      else {
        // Before selection
        if (segStart < selMin) {
          newSegments.push({
            ...seg,
            text: seg.text.slice(0, selMin - segStart),
          });
        }
        // Selected part
        const overlapStart = Math.max(0, selMin - segStart);
        const overlapEnd = Math.min(seg.text.length, selMax - segStart);
        newSegments.push({
          ...seg,
          text: seg.text.slice(overlapStart, overlapEnd),
          font: finalFont,
          weight: finalWeight,
          style: finalStyle,
          color: finalColor,
          size: finalSize,
          disableLigatures: !finalLigatures,
        });
        // After selection
        if (segEnd > selMax) {
          newSegments.push({
            ...seg,
            text: seg.text.slice(selMax - segStart),
          });
        }
      }
      charIdx = segEnd;
    }

    // Merge adjacent segments with identical styles
    const merged: Segment[] = [];
    for (const seg of newSegments) {
      if (seg.text.length === 0) continue;
      const last = merged[merged.length - 1];
      if (last && !last.symbolId && !seg.symbolId && last.font === seg.font && last.weight === seg.weight && last.style === seg.style && last.color === seg.color && last.size === seg.size && last.disableLigatures === seg.disableLigatures && last.textStrokeWidthPt === seg.textStrokeWidthPt && last.textStrokeColor === seg.textStrokeColor) {
        last.text += seg.text;
      } else {
        merged.push({ ...seg });
      }
    }

    commitSegments(merged);
  }, [selMin, selMax, segments, toolFont, toolWeight, toolStyle, toolColor, toolSize, toolLigatures, commitSegments]);

  // Apply a specific PUA character (alternate) to the selected character
  const applyAlternate = useCallback((puaChar: string) => {
    if (selMin === null || selMax === null || selMax - selMin !== 1) return;

    const newSegments: Segment[] = [];
    let charIdx = 0;

    for (const seg of segments) {
      const segStart = charIdx;
      const segEnd = charIdx + seg.text.length;

      if (segEnd <= selMin || segStart >= selMax) {
        newSegments.push({ ...seg });
      } else {
        const splitIdx = selMin - segStart;
        if (splitIdx > 0) {
          newSegments.push({ ...seg, text: seg.text.slice(0, splitIdx) });
        }
        newSegments.push({
          ...seg,
          text: puaChar,
          font: 'EsmeraldaPro-PUA',
        });
        if (splitIdx + 1 < seg.text.length) {
          newSegments.push({ ...seg, text: seg.text.slice(splitIdx + 1) });
        }
      }
      charIdx = segEnd;
    }

    const merged: Segment[] = [];
    for (const seg of newSegments) {
      if (seg.text.length === 0) continue;
      const last = merged[merged.length - 1];
      if (last && !last.symbolId && !seg.symbolId && last.font === seg.font && last.weight === seg.weight && last.style === seg.style && last.color === seg.color && last.size === seg.size && last.textStrokeWidthPt === seg.textStrokeWidthPt && last.textStrokeColor === seg.textStrokeColor) {
        last.text += seg.text;
      } else {
        merged.push({ ...seg });
      }
    }

    commitSegments(merged);
    setToolFont('EsmeraldaPro-PUA');
  }, [selMin, selMax, segments, commitSegments]);

  // Select All shortcut
  const selectAll = useCallback(() => {
    setSelStart(0);
    setSelEnd(segments.reduce((n,seg)=>n+seg.text.length,0));
  }, [segments]);

  // Character click/drag handlers
  const handleCharMouseDown = useCallback((start: number, end: number) => {
    charSelectionAnchorRef.current = { start, end };
    setSelStart(start);
    setSelEnd(end);
    setIsDragging(true);
  }, []);

  const handleCharMouseEnter = useCallback((start: number, end: number) => {
    if (isDragging) {
      const anchor=charSelectionAnchorRef.current;
      setSelStart(start < anchor.start ? anchor.end : anchor.start);
      setSelEnd(start < anchor.start ? start : end);
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  const updateEditableText = useCallback((next:{text:string;caret?:number;segments?:Segment[]}) => {
    const text = normalizeText(next.text);
    const nextSegments = next.segments ?? segmentsFromEditableText(text, {
      font: toolFont, size: toolSize, color: toolColor, weight: toolWeight, style: toolStyle,
    }, language, editTextSegments, editorContext, symbolAliasPreferences, originalSegments ?? []);
    pushHistory();
    setEditText(text);
    setEditTextSegments(nextSegments);
    setManagedSourceSymbols(previous => collectManagedSourceSymbols(previous, nextSegments));
    if (next.caret !== undefined) {
      const caret = Math.min(next.caret, text.length);
      editSelectionRef.current = { start: caret, end: caret };
      requestAnimationFrame(() => { editTextAreaRef.current?.setSelectionRange(caret, caret); });
    }
  }, [normalizeText, toolFont, toolSize, toolColor, toolWeight, toolStyle, language, editTextSegments, editorContext, symbolAliasPreferences, originalSegments, pushHistory]);

  const insertSemanticSymbol = useCallback((symbolId: string) => {
    const symbol = getSemanticSymbol(symbolId);
    const editorToken = getSymbolEditorToken(symbolId, language, symbolAliasPreferences);
    if (!symbol || !editorToken || !isSymbolAllowed(symbol,editorContext)) return;

    if (isEditingText) {
      const textarea = editTextAreaRef.current;
      const start = textarea?.selectionStart ?? editSelectionRef.current.start;
      const end = textarea?.selectionEnd ?? editSelectionRef.current.end;
      const insertion = insertEditorToken(editText,start,end,editorToken,symbolAliasPreferences);
      updateEditableText(insertion);
      const caret = insertion.caret;
      editSelectionRef.current = { start: caret, end: caret };
      requestAnimationFrame(() => {
        const currentTextarea = editTextAreaRef.current;
        if (!currentTextarea) return;
        currentTextarea.focus();
        currentTextarea.setSelectionRange(caret, caret);
      });
      setSymbolPaletteStatus(language === 'pt-BR' ? `${symbol.labels['pt-BR']} inserido no texto.` : `${symbol.labels.en} inserted in text.`);
      return;
    }

    if (selMin === null || selMax === null) {
      setSymbolPaletteStatus(language === 'pt-BR' ? 'Selecione caracteres ou abra Editar Texto para escolher o cursor.' : 'Select characters or open Edit Text to choose a caret position.');
      return;
    }

    const replacement: Segment = {
      text: SYMBOL_OBJECT_MARKER,
      symbolId,
      font: toolFont,
      size: toolSize,
      color: toolColor,
      weight: toolWeight,
      style: toolStyle,
    };
    const nextSegments = replaceSegmentRange(segments,selMin,selMax,[replacement]);
    commitSegments(nextSegments);
    setSelStart(selMin);
    setSelEnd(selMin + 1);
    setSymbolPaletteStatus(language === 'pt-BR' ? `${symbol.labels['pt-BR']} substituiu a seleção.` : `${symbol.labels.en} replaced the selection.`);
  }, [isEditingText, editText, language, symbolAliasPreferences, editorContext, updateEditableText, selMin, selMax, toolFont, toolSize, toolColor, toolWeight, toolStyle, segments, commitSegments]);

  useEffect(() => {
    if (!onPaletteEditorChange) return;
    onPaletteEditorChange(spanKey, {
      context: editorContext,
      canInsert: isEditingText || hasSelection,
      canUndo: undoHistory.length > 0,
      status: symbolPaletteStatus,
      insert: insertSemanticSymbol,
      undo,
    });
  }, [spanKey, onPaletteEditorChange, editorContext, isEditingText, hasSelection, undoHistory.length, symbolPaletteStatus, insertSemanticSymbol, undo]);

  useEffect(() => () => onPaletteEditorChange?.(spanKey, null), [spanKey, onPaletteEditorChange]);

  // Text rewrite mode
  const handleStartEditText = useCallback(() => {
    const readableText = editableTextForSegments(segments, language, symbolAliasPreferences);
    setEditText(readableText);
    setEditTextBaseline(readableText);
    setEditTextSegments(segments.map(segment => ({ ...segment })));
    setEditInitialManagedSourceSymbols([...managedSourceSymbols]);
    editSelectionRef.current = { start: readableText.length, end: readableText.length };
    setIsEditingText(true);
  }, [segments, language, symbolAliasPreferences, managedSourceSymbols]);

  const cancelEditText = useCallback(() => {
    pushHistory();
    setIsEditingText(false);
    setEditText(editTextBaseline);
    setEditTextSegments(segments.map(segment => ({ ...segment })));
    setManagedSourceSymbols([...editInitialManagedSourceSymbols]);
  }, [pushHistory, editTextBaseline, segments, editInitialManagedSourceSymbols]);

  const handleEditableKey = useCallback((event:React.KeyboardEvent<HTMLTextAreaElement>)=>{
    if(event.nativeEvent.isComposing)return;
    if((event.ctrlKey || event.metaKey) && !event.altKey) {
      const key=event.key.toLowerCase();
      if(key==='z' || key==='y') {event.preventDefault();if(key==='y' || event.shiftKey)redo();else undo();return;}
    }
    if(event.key!=='Backspace' && event.key!=='Delete')return;
    const deleted=deleteEditorToken(editText,event.currentTarget.selectionStart,event.currentTarget.selectionEnd,event.key==='Backspace'?'backward':'forward',symbolAliasPreferences);
    if(deleted) {event.preventDefault();updateEditableText(deleted);}
  },[editText,undo,redo,updateEditableText,symbolAliasPreferences]);

  const handleEditableClipboard = useCallback((event:React.ClipboardEvent<HTMLTextAreaElement>,cut:boolean)=>{
    const {selectionStart,selectionEnd}=event.currentTarget;
    if(selectionStart===selectionEnd)return;
    const expanded=expandEditorTokenSelection(editText,selectionStart,selectionEnd,symbolAliasPreferences);
    event.preventDefault();event.clipboardData.setData('text/plain',editText.slice(expanded.start,expanded.end));
    const range = editableRangeToSegmentRange(editTextSegments, language, expanded.start, expanded.end,symbolAliasPreferences);
    event.clipboardData.setData(INLINE_CLIPBOARD_MIME, encodeInlineClipboard(sliceSegmentRange(editTextSegments, range.start, range.end), language));
    if(cut)updateEditableText(insertEditorToken(editText,expanded.start,expanded.end,'',symbolAliasPreferences));
  },[editText, editTextSegments, language, symbolAliasPreferences, updateEditableText]);

  const handleEditablePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imported = decodeInlineClipboard(event.clipboardData.getData(INLINE_CLIPBOARD_MIME), event.clipboardData.getData('text/plain'),symbolAliasPreferences);
    if (!imported) return;
    event.preventDefault();
    const range = editableRangeToSegmentRange(editTextSegments, language, event.currentTarget.selectionStart, event.currentTarget.selectionEnd,symbolAliasPreferences);
    const permitted = imported.map(run => {
      const definition = getSemanticSymbol(run.symbolId);
      if (!definition || isSymbolAllowed(definition, editorContext) || editTextSegments.some(previous => previous.symbolId === run.symbolId)) return run;
      return { ...run, text: editableTextForSegments([run], language, symbolAliasPreferences), symbolId: undefined, symbolMetrics: undefined };
    });
    const normalized = singleLine ? permitted.map(run => ({ ...run, text: normalizeText(run.text) })) : permitted;
    const nextSegments = replaceSegmentRange(editTextSegments, range.start, range.end, normalized);
    updateEditableText({ text: editableTextForSegments(nextSegments, language, symbolAliasPreferences), segments: nextSegments,
      caret: range.editable.start + editableTextForSegments(normalized, language, symbolAliasPreferences).length });
  }, [editTextSegments, language, symbolAliasPreferences, editorContext, singleLine, normalizeText, updateEditableText]);

  const handleConfirmEditText = useCallback(() => {
    const normalizedEditText = normalizeText(editText);
    // A no-op confirmation must not flatten existing styled runs.
    if (normalizedEditText !== editTextBaseline) {
      commitSegments(editTextSegments);
    }
    setIsEditingText(false);
    setEditTextBaseline(normalizedEditText);
    setSelStart(null);
    setSelEnd(null);
  }, [editText, editTextBaseline, normalizeText, editTextSegments, commitSegments]);

  const handleSave = useCallback(() => {
    if (!hasDraftChanges) {
      onClose();
      return;
    }
    const finalSegments = isEditingText ? editTextSegments : segments;
    onSave(createEditorOverride(spanKey, bbox, textAlign, finalSegments, managedSourceSymbols, lineHeight, lineHeightMode));
  }, [hasDraftChanges, onClose, onSave, spanKey, segments, bbox, textAlign, lineHeight, lineHeightMode, isEditingText, editTextSegments, managedSourceSymbols]);

  // Reset to original
  const handleReset = useCallback(() => {
    if (language === 'pt-BR' && !window.confirm('Resetar esta tradução em português? O rascunho salvo desta unidade será removido.')) {
      return;
    }
    commitSegments(originalSegments?.length ? originalSegments.map(segment => ({ ...segment })) : [{
      text: originalText,
      font: originalFont,
      size: originalSize,
      color: originalColor,
      weight: originalWeight,
      style: originalStyle,
    }]);
    setLineHeight(originalLineHeight);
    setSelStart(null);
    setSelEnd(null);
    onSave(null);
  }, [language, originalSegments, originalText, originalFont, originalSize, originalColor, originalWeight, originalStyle, originalLineHeight, onSave, commitSegments]);

  const fontToCSS = (f: string) => {
    if (f.includes('Optima') || f === 'OptimaLTStd') return "'OptimaLTStd', serif";
    if (f.includes('Garamond') || f === 'AGaramondPro') return "'AGaramondPro', serif";
    if (f === 'CinzelLocal' || f.includes('Cinzel')) return "'CinzelLocal', 'Cinzel', serif";
    if (f.includes('Decorative')) return "'Cinzel Decorative', serif";
    if (f === 'EsmeraldaPro-PUA') return "'EsmeraldaPro-PUA', 'EsmeraldaPro', serif";
    if (f.includes('Esmeralda') || f === 'EsmeraldaPro') return "'EsmeraldaPro', serif";
    if (f === 'Inter') return "'Inter', sans-serif";
    return `'${f}', serif`;
  };

  return (
    <div className="rse-overlay" onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div className="rse-panel">
        {/* Header */}
        <div className="rse-header">
          <div>
            <h3>✏️ Rich Block Editor</h3>
            <span className="rse-subtitle">
              Page {pageNumber} · {editorLabel ? editorLabel : <code>{spanKey}</code>}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
              Live preview active
            </span>
            <button className="rse-close" onClick={requestClose}>✕</button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="rse-toolbar">
          <div className="rse-toolbar-row">
            <select value={toolFont} onChange={e => { setToolFont(e.target.value); applyToSelection({font: e.target.value}); }} title="Font Family">
              {AVAILABLE_FONTS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <select value={toolWeight} onChange={e => { setToolWeight(Number(e.target.value)); applyToSelection({weight: Number(e.target.value)}); }} title="Weight">
              {FONT_WEIGHTS.map(w => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
            <button
              className={`rse-tool-btn ${toolWeight >= 600 ? 'active' : ''}`}
              onClick={() => { const w = toolWeight >= 600 ? 400 : 700; setToolWeight(w); applyToSelection({weight: w}); }}
              title="Bold"
            ><strong>B</strong></button>
            <button
              className={`rse-tool-btn ${toolStyle === 'italic' ? 'active' : ''}`}
              onClick={() => { const s = toolStyle === 'italic' ? 'normal' : 'italic'; setToolStyle(s); applyToSelection({style: s}); }}
              title="Italic"
            ><em>I</em></button>
            <button
              className={`rse-tool-btn ${toolLigatures ? 'active' : ''}`}
              onClick={() => { setToolLigatures(!toolLigatures); applyToSelection({ligatures: !toolLigatures}); }}
              title="Ligatures (ct, st, etc)"
              style={{ fontFamily: 'EsmeraldaPro' }}
            >fi</button>
            <div className="rse-toolbar-divider" style={{ width: '1px', background: '#ccc', margin: '0 8px' }} />
            <button className={`rse-tool-btn ${textAlign === 'left' ? 'active' : ''}`} onClick={() => changeTextAlign('left')} title="Align Left">⫷</button>
            <button className={`rse-tool-btn ${textAlign === 'center' ? 'active' : ''}`} onClick={() => changeTextAlign('center')} title="Align Center">≡</button>
            <button className={`rse-tool-btn ${textAlign === 'right' ? 'active' : ''}`} onClick={() => changeTextAlign('right')} title="Align Right">⫸</button>
            <button className={`rse-tool-btn ${textAlign === 'justify' ? 'active' : ''}`} onClick={() => changeTextAlign('justify')} title="Justify">▤</button>
            <div className="rse-toolbar-divider" style={{ width: '1px', background: '#ccc', margin: '0 8px' }} />
            <input type="color" value={toolColor} onChange={e => { setToolColor(e.target.value); applyToSelection({color: e.target.value}); }} title="Color" className="rse-color-input" />
            <input type="number" value={toolSize} onChange={e => { setToolSize(Number(e.target.value)); applyToSelection({size: Number(e.target.value)}); }} min={4} max={72} step={0.5} className="rse-size-input" title="Size (pt)" />
            <label className="rse-line-height-control" title={language === 'pt-BR' ? 'Entrelinha (multiplicador)' : 'Line spacing (multiplier)'}>
              <span aria-hidden="true">↕</span>
              <input
                type="number"
                aria-label={language === 'pt-BR' ? 'Entrelinha' : 'Line spacing'}
                value={lineHeight.toFixed(2)}
                onChange={event => changeLineHeight(event.currentTarget.valueAsNumber)}
                min={0.6}
                max={2.5}
                step={0.01}
                className="rse-size-input rse-line-height-input"
              />
            </label>
          </div>
          <div className="rse-toolbar-row">
            <button className="rse-tool-btn" onClick={() => applyToSelection()} disabled={!hasSelection}>
              🎨 Apply to Selection
            </button>
            <button className="rse-tool-btn" onClick={selectAll}>Select All</button>
            <button className="rse-tool-btn" disabled={isEditingText} onClick={handleStartEditText}>📝 Edit Text</button>
          </div>
        </div>

        {/* Text Rewrite Input */}
        {isEditingText && (
          <div className="rse-edit-text">
            <label>{language === 'pt-BR' ? 'Editar texto:' : 'Rewrite text:'}</label>
            <p className="rse-symbol-edit-hint">
              {language === 'pt-BR'
                ? 'Atalhos como [[lightning]], [[sword]] e [[black-die]] viram símbolos ao confirmar. Tokens antigos entre ⟦colchetes⟧ continuam aceitos; a paleta insere no cursor ou substitui a seleção.'
                : 'Shortcuts like [[lightning]], [[sword]] and [[black-die]] become symbols when confirmed. Legacy ⟦bracket⟧ tokens still work; the palette inserts at the caret or replaces the selection.'}
            </p>
            <textarea
              ref={editTextAreaRef}
              value={editText}
              onChange={e => {
                const {start,end}=editSelectionRef.current;
                const next=normalizeEditableInput(editText,e.target.value,start,end,symbolAliasPreferences);
                updateEditableText(next);
                if(next.caret===undefined)editSelectionRef.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd };
              }}
              onKeyDown={handleEditableKey}
              onCopy={e=>handleEditableClipboard(e,false)}
              onCut={e=>handleEditableClipboard(e,true)}
              onPaste={handleEditablePaste}
              onSelect={e => { editSelectionRef.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
              onClick={e => { editSelectionRef.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
              onKeyUp={e => { editSelectionRef.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
              onBlur={e => { editSelectionRef.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
              rows={singleLine ? 1 : 3}
              wrap={singleLine ? 'off' : 'soft'}
              autoFocus
            />
            <div className="rse-edit-text-actions">
              <button onClick={cancelEditText}> {language === 'pt-BR' ? 'Cancelar' : 'Cancel'}</button>
              <button className="rse-apply" onClick={handleConfirmEditText}>{language === 'pt-BR' ? 'Confirmar' : 'Confirm'}</button>
            </div>
          </div>
        )}

        {/* Character Grid – select characters individually */}
        <div className="rse-section">
          <label>Character Selection <span className="rse-hint">(click &amp; drag to select)</span></label>
          <div className="rse-char-grid" ref={charGridRef}>
            {chars.map((c, idx) => {
              const isSelected = selMin !== null && selMax !== null && c.start >= selMin && c.end <= selMax;
              return (
                <span
                  key={idx}
                  className={`rse-char ${c.symbolId ? 'rse-char-symbol' : ''} ${isSelected ? 'rse-char-selected' : ''}`}
                  aria-label={c.symbolId ? getSemanticSymbol(c.symbolId)?.labels[language] : c.char}
                  title={c.symbolId ? getSemanticSymbol(c.symbolId)?.labels[language] : undefined}
                  style={{
                    fontFamily: fontToCSS(c.font),
                    fontWeight: c.weight,
                    fontStyle: c.style,
                    color: c.color,
                  }}
                  onMouseDown={() => handleCharMouseDown(c.start,c.end)}
                  onMouseEnter={() => handleCharMouseEnter(c.start,c.end)}
                >
                  {c.symbolId ? (
                    <SemanticSymbol id={c.symbolId} language={language} size={16} color={c.color} preview />
                  ) : c.char === ' ' ? '\u00A0' : c.char}
                </span>
              );
            })}
          </div>
          
          {availableAlternates && (
            <div className="rse-alternates">
              <label style={{ marginTop: 12 }}>Available Alternates ({availableAlternates.baseChar}):</label>
              <div className="rse-alt-grid">
                <button 
                  className="rse-alt-btn"
                  onClick={() => applyAlternate(availableAlternates.baseChar)}
                >
                  <span style={{ fontFamily: 'EsmeraldaPro' }}>{availableAlternates.baseChar}</span>
                  <span className="rse-alt-label">Normal</span>
                </button>
                {availableAlternates.alts.map((alt: any) => (
                  <button 
                    key={alt.name}
                    className="rse-alt-btn"
                    onClick={() => applyAlternate(alt.pua_char)}
                  >
                    <span style={{ fontFamily: "'EsmeraldaPro-PUA', 'EsmeraldaPro', serif", fontSize: 24 }}>{alt.pua_char}</span>
                    <span className="rse-alt-label">{alt.name.replace('.swsh', ' swash').replace('.alt', ' alt').split('.')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>



        {/* Segment Info (debug) */}
        <div className="rse-section rse-segments-info">
          <label>Segments ({segments.length})</label>
          <div className="rse-segments-list">
            {segments.map((seg, i) => (
              <div key={i} className="rse-segment-chip">
                <span className="rse-seg-text">"{seg.symbolId ? getSemanticSymbol(seg.symbolId)?.labels[language] ?? seg.symbolId : seg.text.length > 20 ? seg.text.slice(0, 20) + '…' : seg.text}"</span>
                <span className="rse-seg-meta">{seg.font} · {seg.weight} · {seg.style} · {seg.color}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer: Save */}
        <div className="rse-footer">
          <div className="rse-footer-actions">
            <button className="rse-btn-reset" onClick={handleReset}>Reset</button>
            <button className="rse-btn-save" onClick={handleSave}>💾 Save</button>
          </div>
        </div>
      </div>
    </div>
  );
};
