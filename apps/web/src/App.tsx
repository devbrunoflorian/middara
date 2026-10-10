import { useState, useEffect, useRef, useCallback } from 'react';
import { PageRenderer, type Block, type CreditUnitDefinition, type LayoutFrame, type PageData, type PageFidelityOverlay } from './components/PageRenderer';
import { AdminSymbolPalette, type AdminSymbolPaletteEditorState } from './components/AdminSymbolPalette';
import { LocalSyncRecoveryControl } from './components/LocalSyncRecoveryControl';
import { DevelopmentEnvironmentStatus } from './components/DevelopmentEnvironmentStatus';
import { FaqDrawer } from './components/FaqDrawer';
import { MiddaraMark } from './components/MiddaraMark';
import { 
  ChevronLeft, ChevronRight, Edit3, 
  ZoomIn, ZoomOut, Maximize, Layout, LayoutList,
  CircleHelp, Ruler, Move
} from 'lucide-react';
import './App.css';
import './ArcaneGothic.css';
import './ArcaneGothicLayout.css';
import { attachSourceInlineElements, type SourceInlineElement } from './symbols/sourceInlineElements';
import { attachSourceCompoundElements, type SourceCompoundElement } from './symbols/sourceCompounds';
import type { ContentsRowDefinition } from './contentsRows';
import { getDefaultSymbolAliasPreferences, getEditorAliasConflicts, getSemanticSymbol, normalizeEditorAlias, type SymbolAliasPreferences } from './symbols/semanticSymbols';
import { loadSymbolAliasSettings, saveSymbolAliasSettings } from './symbols/symbolAliasSettings';
import { payloadApiOrigin } from './config/payloadApi';
import {
  captureDocumentFocalPoint,
  clampViewerZoom,
  ctrlWheelZoomLevel,
  type DocumentFocalPoint,
} from './focalZoom';

const TOTAL_PAGES = 102; // Pages with extracted DOM

interface ActivePaletteEditor {
  editorKey: string;
  state: AdminSymbolPaletteEditorState;
}

async function loadPageData(pageNum: number): Promise<PageData> {
  const pageStr = pageNum.toString().padStart(3, '0');
  try {
    const res = await fetch(`/pages/page_${pageStr}/page_${pageStr}_dom.json`);
    if (res.ok) {
      const data = await res.json();
      let pageFrames: Record<string, LayoutFrame> = {};
      let pageCreditUnits: Record<string, CreditUnitDefinition | CreditUnitDefinition[]> = {};
      // Layout frames are page-local geometry sidecars. Load them for every
      // page that has one, not only the original page-2 pilot, so the viewer,
      // Admin outlines, and translated text all share the same frame.
      try {
        const frameResponse = await fetch(`/pages/page_${pageStr}/layout_frames.json`);
        if (frameResponse.ok) pageFrames = await frameResponse.json();
      } catch {}
      if (pageNum === 2) {
        try {
          const creditResponse = await fetch(`/pages/page_${pageStr}/credit_units.json`);
          if (creditResponse.ok) pageCreditUnits = await creditResponse.json();
        } catch {}
      }
      // Overlay sidecars are page-local and optional.  Always probe for one so
      // newly audited component/diagram pages are rendered without maintaining
      // a stale hard-coded page allowlist here.
      let fidelityOverlays: PageFidelityOverlay[] = [];
      let inlineElements: SourceInlineElement[] = [];
      let sourceCompounds: SourceCompoundElement[] = [];
      let contentsRows:ContentsRowDefinition[]|undefined;
      if(pageNum===3) {
        try {
          const rowsResponse=await fetch(`/pages/page_${pageStr}/contents_rows.json`);
          if(rowsResponse.ok)contentsRows=(await rowsResponse.json()).rows;
        } catch {}
      }
      try {
        const inlineResponse = await fetch(`/pages/page_${pageStr}/inline_elements.json`);
        if (inlineResponse.ok) inlineElements = (await inlineResponse.json()).elements ?? [];
      } catch {}
      try {
        const compoundsResponse = await fetch(`/pages/page_${pageStr}/compound_elements.json`);
        if (compoundsResponse.ok) sourceCompounds = (await compoundsResponse.json()).elements ?? [];
      } catch {}
      try {
        const overlayResponse = await fetch(`/pages/page_${pageStr}/fidelity_overlays.json`);
        if (overlayResponse.ok) {
          const overlayData = await overlayResponse.json();
          fidelityOverlays = overlayData.overlays || [];
        }
      } catch {}
      return {
        page_number: pageNum,
        width: data.width || 820.35,
        height: data.height || 820.35,
        images: [],
        layoutObstacles: (data.images || [])
          .filter((image: { role?: string }) => image.role === 'content')
          .map((image: { bbox: [number, number, number, number] }) => image.bbox),
        fidelityOverlays,
        inlineElements,
        sourceCompounds,
        contentsRows,
        blocks: attachSourceInlineElements(attachSourceCompoundElements((data.blocks || []).map((block: Block) => {
          const sidecarUnits = pageCreditUnits[block.id];
          const creditUnits = Array.isArray(sidecarUnits)
            ? sidecarUnits
            : sidecarUnits
              ? [sidecarUnits]
              : block.creditUnits ?? (block.creditUnit ? [block.creditUnit] : undefined);
          return {
            ...block,
            layoutFrame: pageFrames[block.id] || block.layoutFrame,
            creditUnits,
          };
        }), sourceCompounds), inlineElements),
        backgroundUrl: `/pages/page_${pageStr}/background.webp`
      };
    }
  } catch {}
  return {
    page_number: pageNum,
    width: 820.35,
    height: 820.35,
    images: [],
    blocks: [],
    backgroundUrl: `/pages/page_${pageStr}/background.webp`
  };
}

function App() {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRulerVisible, setIsRulerVisible] = useState(false);
  const [isLayoutMode, setIsLayoutMode] = useState(false);
  const [isLayoutDirty, setIsLayoutDirty] = useState(false);
  const [hasTranslationDraft, setHasTranslationDraft] = useState(false);
  const [pendingEditableNavigation, setPendingEditableNavigation] = useState<{
    id: number;
    direction: 'previous' | 'next';
    targetPage: number;
  } | null>(null);
  const editableNavigationRequestId = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  // Start at 200% relative to the measured fit scale; Fit to Screen resets this multiplier to 100%.
  const [zoomLevel, setZoomLevel] = useState<number>(2);
  const zoomLevelRef = useRef(zoomLevel);
  const [focalZoomAnchor, setFocalZoomAnchor] = useState<{ id: number; pageNumber: number; focal: DocumentFocalPoint; resetPan?: boolean } | null>(null);
  const focalZoomAnchorIdRef = useRef(0);
  const pendingWheelZoomRef = useRef<{ zoomLevel: number; pageNumber: number; focal: DocumentFocalPoint } | null>(null);
  const wheelAnimationFrameRef = useRef<number | null>(null);
  const [viewMode, setViewMode] = useState<'single' | 'scroll'>('single');
  const [pageInput, setPageInput] = useState<string>('1');
  const [language, setLanguage] = useState<'en' | 'pt-BR'>('en');
  const [isSymbolPaletteOpen, setIsSymbolPaletteOpen] = useState(false);
  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [symbolAliasPreferences, setSymbolAliasPreferences] = useState<SymbolAliasPreferences>(getDefaultSymbolAliasPreferences);
  const [symbolAliasSettingsLoading, setSymbolAliasSettingsLoading] = useState(true);
  const [paletteEditorState, setPaletteEditorState] = useState<Pick<AdminSymbolPaletteEditorState, 'context' | 'canInsert' | 'canUndo' | 'status'> & { editorKey: string } | null>(null);
  const activePaletteEditorRef = useRef<ActivePaletteEditor | null>(null);

  // Single page mode: one page
  const [pageData, setPageData] = useState<PageData | null>(null);

  // Scroll mode: map of loaded pages
  const [scrollPages, setScrollPages] = useState<Map<number, PageData>>(new Map());

  const mainRef = useRef<HTMLDivElement>(null);
  const devMode = isLayoutMode ? 'layout' : paletteEditorState ? 'editor' : isAdmin ? 'admin' : 'viewer';

  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  const handleFocalZoomApplied = useCallback((id: number) => {
    setFocalZoomAnchor(current => current?.id === id ? null : current);
  }, []);

  const changeZoomAroundCenter = useCallback((requestedZoom: number, resetPan = false) => {
    const nextZoom = clampViewerZoom(requestedZoom);
    const currentZoom = zoomLevelRef.current;
    const zoomChanged = Math.abs(nextZoom - currentZoom) >= 0.000001;
    if (!zoomChanged && !resetPan) return;

    if (wheelAnimationFrameRef.current !== null) {
      cancelAnimationFrame(wheelAnimationFrameRef.current);
      wheelAnimationFrameRef.current = null;
    }
    pendingWheelZoomRef.current = null;
    zoomLevelRef.current = nextZoom;
    if (zoomChanged || resetPan) setZoomLevel(nextZoom);

    if (viewMode !== 'single') {
      setFocalZoomAnchor(null);
      return;
    }
    const stage = mainRef.current?.querySelector<HTMLElement>('.page-stage');
    const page = stage?.querySelector<HTMLElement>('.page-container');
    if (!stage || !page) {
      setFocalZoomAnchor(null);
      return;
    }
    const stageRect = stage.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    const pageWidth = Number(page.dataset.pdfPageWidth);
    const pageHeight = Number(page.dataset.pdfPageHeight);
    const focal = resetPan
      ? { pageX: pageWidth / 2, pageY: pageHeight / 2, viewportX: stage.clientWidth / 2, viewportY: stage.clientHeight / 2 }
      : captureDocumentFocalPoint({
        clientX: stageRect.left + stage.clientLeft + stage.clientWidth / 2,
        clientY: stageRect.top + stage.clientTop + stage.clientHeight / 2,
        viewport: { left: stageRect.left, top: stageRect.top, clientLeft: stage.clientLeft, clientTop: stage.clientTop },
        page: { left: pageRect.left, top: pageRect.top, width: pageRect.width, height: pageRect.height },
        pageWidth,
        pageHeight,
      });
    if (focal) {
      setFocalZoomAnchor({
        id: ++focalZoomAnchorIdRef.current,
        pageNumber: Number(page.dataset.pdfPageNumber),
        focal,
        resetPan,
      });
    } else {
      setFocalZoomAnchor(null);
    }
  }, [viewMode]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main || viewMode !== 'single') return;

    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const stage = target.closest<HTMLElement>('.page-stage');
      if (!stage || !main.contains(stage)) return;
      const page = stage.querySelector<HTMLElement>('.page-container');
      if (!page) return;

      const nextZoom = ctrlWheelZoomLevel({
        ctrlKey: event.ctrlKey,
        cancelable: event.cancelable,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        viewportHeight: stage.clientHeight,
        currentZoom: zoomLevelRef.current,
      });
      if (nextZoom === null) return;

      const stageRect = stage.getBoundingClientRect();
      const pageRect = page.getBoundingClientRect();
      const focal = captureDocumentFocalPoint({
        clientX: event.clientX,
        clientY: event.clientY,
        viewport: { left: stageRect.left, top: stageRect.top, clientLeft: stage.clientLeft, clientTop: stage.clientTop },
        page: { left: pageRect.left, top: pageRect.top, width: pageRect.width, height: pageRect.height },
        pageWidth: Number(page.dataset.pdfPageWidth),
        pageHeight: Number(page.dataset.pdfPageHeight),
      });
      if (!focal) return;

      // Consume only a Ctrl+wheel gesture over the actual PDF page. Plain wheel
      // continues to scroll normally, and continuous mode remains untouched.
      event.preventDefault();
      if (Math.abs(nextZoom - zoomLevelRef.current) < 0.000001) return;
      zoomLevelRef.current = nextZoom;
      pendingWheelZoomRef.current = {
        zoomLevel: nextZoom,
        pageNumber: Number(page.dataset.pdfPageNumber),
        focal,
      };
      if (wheelAnimationFrameRef.current !== null) return;

      wheelAnimationFrameRef.current = requestAnimationFrame(() => {
        wheelAnimationFrameRef.current = null;
        const pending = pendingWheelZoomRef.current;
        pendingWheelZoomRef.current = null;
        if (!pending) return;
        setZoomLevel(pending.zoomLevel);
        setFocalZoomAnchor({ id: ++focalZoomAnchorIdRef.current, ...pending });
      });
    };

    main.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      main.removeEventListener('wheel', onWheel);
      if (wheelAnimationFrameRef.current !== null) {
        cancelAnimationFrame(wheelAnimationFrameRef.current);
        wheelAnimationFrameRef.current = null;
      }
      pendingWheelZoomRef.current = null;
    };
  }, [viewMode]);

  useEffect(() => {
    let active = true;
    loadSymbolAliasSettings().then(result => {
      if (!active) return;
      setSymbolAliasPreferences(result.preferences);
      setSymbolAliasSettingsLoading(false);
    });
    return () => { active = false; };
  }, []);

  const handlePaletteEditorChange = useCallback((editorKey: string, state: AdminSymbolPaletteEditorState | null) => {
    if (state) {
      activePaletteEditorRef.current = { editorKey, state };
      setPaletteEditorState(current => current
        && current.editorKey === editorKey
        && current.context === state.context
        && current.canInsert === state.canInsert
        && current.canUndo === state.canUndo
        && current.status === state.status
        ? current
        : { editorKey, context: state.context, canInsert: state.canInsert, canUndo: state.canUndo, status: state.status });
    } else if (activePaletteEditorRef.current?.editorKey === editorKey) {
      activePaletteEditorRef.current = null;
      setPaletteEditorState(null);
    }
  }, []);

  const handleSaveSymbolAlias = useCallback(async (symbolId: string, alias: string | null) => {
    const next = { ...symbolAliasPreferences };
    if (alias === null) next[symbolId] = getDefaultSymbolAliasPreferences()[symbolId];
    else {
      const normalized = normalizeEditorAlias(alias);
      if (!normalized || !getSemanticSymbol(symbolId)) {
        return { ok: false, message: language === 'pt-BR' ? 'Digite um atalho válido.' : 'Enter a valid shortcut.' };
      }
      next[symbolId] = normalized;
    }
    const conflicts = getEditorAliasConflicts(next);
    if (conflicts.length) return {
      ok: false,
      message: language === 'pt-BR'
        ? `Atalho em conflito: ${conflicts.map(value => `[[${value}]]`).join(', ')}.`
        : `Shortcut conflict: ${conflicts.map(value => `[[${value}]]`).join(', ')}.`,
    };
    const result = await saveSymbolAliasSettings(next);
    if (!result.ok) {
      const message = result.reason === 'conflict'
        ? (language === 'pt-BR' ? 'Esse atalho já está atribuído a outro símbolo.' : 'That shortcut is already assigned to another symbol.')
        : result.reason === 'verification-failed'
          ? (language === 'pt-BR' ? 'O Payload não confirmou a preferência salva.' : 'Payload did not confirm the saved preference.')
          : (language === 'pt-BR' ? 'Não foi possível salvar no Payload.' : 'Could not save to Payload.');
      return { ok: false, message };
    }
    setSymbolAliasPreferences(result.preferences);
    return { ok: true, message: language === 'pt-BR' ? 'Atalho salvo e relido do banco.' : 'Shortcut saved and reloaded from the database.' };
  }, [symbolAliasPreferences, language]);

  const acceptLeavingLayout = useCallback(() => {
    if (isLayoutDirty && !window.confirm('Há alterações de moldura não salvas. Descartar e sair do modo de layout?')) return false;
    setIsLayoutMode(false);
    setIsLayoutDirty(false);
    return true;
  }, [isLayoutDirty]);

  const acceptLeavingTranslationDraft = useCallback(() => {
    if (!hasTranslationDraft) return true;
    const confirmed = window.confirm(language === 'pt-BR'
      ? 'Há alterações de tradução não salvas. Quer descartá-las e continuar?'
      : 'There are unsaved text changes. Discard them and continue?');
    if (confirmed) setHasTranslationDraft(false);
    return confirmed;
  }, [hasTranslationDraft, language]);

  // Navigate to a specific page (used by hyperlinks on Contents page)
  const navigateToPage = useCallback((pageNum: number, draftAlreadyConfirmed = false): boolean => {
    if (!Number.isInteger(pageNum) || pageNum < 1 || pageNum > TOTAL_PAGES) return false;
    if (pageNum !== currentPage && (!acceptLeavingLayout()
      || (!draftAlreadyConfirmed && !acceptLeavingTranslationDraft()))) return false;
    setCurrentPage(pageNum);
    // If in scroll mode, scroll to that page
    if (viewMode === 'scroll') {
      setTimeout(() => {
        const el = document.getElementById(`page-${pageNum}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
    return true;
  }, [viewMode, currentPage, acceptLeavingLayout, acceptLeavingTranslationDraft]);

  const requestEditablePageNavigation = useCallback((direction: 'previous' | 'next', fromPage: number) => {
    const targetPage = fromPage + (direction === 'next' ? 1 : -1);
    if (targetPage < 1 || targetPage > TOTAL_PAGES || !acceptLeavingLayout()) return;
    const id = ++editableNavigationRequestId.current;
    setPendingEditableNavigation({ id, direction, targetPage });
    if (viewMode === 'single') {
      setCurrentPage(targetPage);
      setPageInput(targetPage.toString());
    } else {
      document.getElementById(`page-${targetPage}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [acceptLeavingLayout, viewMode]);

  const resolveEditablePageNavigation = useCallback((requestId: number, found: boolean) => {
    if (!pendingEditableNavigation || pendingEditableNavigation.id !== requestId) return;
    if (found) {
      setPendingEditableNavigation(null);
      return;
    }
    const nextPage = pendingEditableNavigation.targetPage
      + (pendingEditableNavigation.direction === 'next' ? 1 : -1);
    if (nextPage < 1 || nextPage > TOTAL_PAGES) {
      setPendingEditableNavigation(null);
      return;
    }
    setPendingEditableNavigation({ ...pendingEditableNavigation, targetPage: nextPage });
    if (viewMode === 'single') {
      setCurrentPage(nextPage);
      setPageInput(nextPage.toString());
    } else {
      requestAnimationFrame(() => document.getElementById(`page-${nextPage}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, [pendingEditableNavigation, viewMode]);

  // Single page loader
  useEffect(() => {
    if (viewMode !== 'single') return;
    setPageInput(currentPage.toString());
    
    setIsLoading(true);
    loadPageData(currentPage).then(data => {
      setPageData(data);
      setIsLoading(false);
    });
  }, [currentPage, viewMode]);

  // Scroll mode: load all pages
  useEffect(() => {
    if (viewMode !== 'scroll') return;
    setIsLoading(true);

    const loadAll = async () => {
      const pages = new Map<number, PageData>();
      for (let i = 1; i <= TOTAL_PAGES; i++) {
        pages.set(i, await loadPageData(i));
      }
      setScrollPages(pages);
      setIsLoading(false);
    };
    loadAll();
  }, [viewMode]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
      if (viewMode !== 'single') return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        navigateToPage(Math.min(TOTAL_PAGES, currentPage + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        navigateToPage(Math.max(1, currentPage - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, navigateToPage, currentPage]);

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(pageInput);
    if (!isNaN(num) && num >= 1 && num <= TOTAL_PAGES) {
      navigateToPage(num);
    } else {
      setPageInput(currentPage.toString());
    }
  };

  return (
    <div className={`app-container ${isAdmin ? 'admin-mode' : ''} ${isFaqOpen ? 'faq-open' : ''} theme-dark`}>
      <div className="app-shell-faq-actions">
        <button
          className="shell-faq-trigger"
          type="button"
          onClick={() => setIsFaqOpen(true)}
          title={language === 'pt-BR' ? 'Abrir FAQ oficial' : 'Open official FAQ'}
          aria-label={language === 'pt-BR' ? 'Abrir FAQ oficial' : 'Open official FAQ'}
        >
          <CircleHelp size={14} />
          <span>FAQ</span>
        </button>
      </div>
      {import.meta.env.DEV && (
        <div className="app-shell-header-actions">
          <DevelopmentEnvironmentStatus
            webOrigin={window.location.origin}
            apiOrigin={payloadApiOrigin}
            locale={language}
            isAdmin={isAdmin}
            mode={devMode}
          />
        </div>
      )}
      {/* Main Viewer Area */}
      <main className={`viewer-main ${viewMode}`} ref={mainRef}>
        {viewMode === 'single' ? (
          /* ── Single Page Mode ── */
          <div className="page-wrapper">
            {isLoading ? (
              <div className="loading-spinner">
                <div className="spinner"></div>
                <p>Rendering Page...</p>
              </div>
            ) : pageData ? (
              <PageRenderer 
                key={`single-${currentPage}-${language}`}
                pageData={pageData} 
                isAdmin={isAdmin}
                showRuler={isAdmin && isRulerVisible}
                layoutMode={isAdmin && isLayoutMode}
                onLayoutDirtyChange={setIsLayoutDirty}
                zoomLevel={zoomLevel}
                focalZoomEnabled
                focalZoomAnchor={focalZoomAnchor}
                onFocalZoomApplied={handleFocalZoomApplied}
                onNavigate={navigateToPage}
                language={language}
                symbolAliasPreferences={symbolAliasPreferences}
                onPaletteEditorChange={handlePaletteEditorChange}
                onTranslationDraftDirtyChange={setHasTranslationDraft}
                pendingEditableNavigation={pendingEditableNavigation}
                onRequestEditablePageNavigation={requestEditablePageNavigation}
                onResolveEditableNavigation={resolveEditablePageNavigation}
                totalPages={TOTAL_PAGES}
                editableNavigationEnabled={viewMode === 'single'}
              />
            ) : null}
          </div>
        ) : (
          /* ── Continuous Scroll Mode ── */
          <div className="scroll-container">
            {isLoading ? (
              <div className="loading-spinner">
                <div className="spinner"></div>
                <p>Loading all pages...</p>
              </div>
            ) : null}
            {Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1).map(num => (
              <div id={`page-${num}`} key={num} className="scroll-page-wrapper">
                <div className="scroll-page-label">Page {num}</div>
                {scrollPages.has(num) ? (
                  <PageRenderer 
                    key={`scroll-${num}-${language}`}
                    pageData={scrollPages.get(num)!} 
                    isAdmin={isAdmin}
                    continuousScroll
                    showRuler={false}
                    layoutMode={false}
                    zoomLevel={zoomLevel}
                    onNavigate={navigateToPage}
                    language={language}
                    symbolAliasPreferences={symbolAliasPreferences}
                    onPaletteEditorChange={handlePaletteEditorChange}
                    onTranslationDraftDirtyChange={setHasTranslationDraft}
                    editableNavigationEnabled={false}
                  />
                ) : (
                  <div className="placeholder-page" style={{ height: 1100 * zoomLevel, width: 820 * zoomLevel, background: '#111' }}></div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Vertical Sidebar (Moved to Right) */}
      <aside className="pdf-sidebar">
        <div className="toolbar-section top">
          <div className="brand" title="Middara Rulebook" role="img" aria-label="Middara">
            <MiddaraMark className="brand-icon" />
            <h1>Middara</h1>
          </div>
          <div className="divider"></div>
          
          {/* View Toggles */}
          <div className="tool-group">
            <button 
              className={`tool-btn ${viewMode === 'single' ? 'active' : ''}`}
              onClick={() => {
                if (viewMode !== 'single' && (!acceptLeavingLayout() || !acceptLeavingTranslationDraft())) return;
                setViewMode('single');
              }}
              title="Single Page View"
            >
              <Layout size={16} />
            </button>
            <button 
              className={`tool-btn ${viewMode === 'scroll' ? 'active' : ''}`}
              onClick={() => {
                if (viewMode !== 'scroll' && (!acceptLeavingLayout() || !acceptLeavingTranslationDraft())) return;
                setViewMode('scroll');
              }}
              title="Continuous Scroll"
            >
              <LayoutList size={16} />
            </button>
          </div>

          <div className="divider"></div>

          {/* Pagination Controls */}
          <div className="pagination-group">
            <button className="nav-btn" onClick={() => navigateToPage(Math.max(1, currentPage - 1))}>
              <ChevronLeft size={16} />
            </button>
            <form onSubmit={handlePageSubmit} className="page-input-form">
              <input 
                type="text" 
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={handlePageSubmit}
                className="page-input"
              />
              <span className="page-total">{TOTAL_PAGES}</span>
            </form>
            <button className="nav-btn" onClick={() => navigateToPage(Math.min(TOTAL_PAGES, currentPage + 1))}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="divider"></div>

          {/* Zoom Controls */}
          <div className="zoom-group">
            <button className="tool-btn" onClick={() => changeZoomAroundCenter(zoomLevelRef.current + 0.25)} title="Zoom In">
              <ZoomIn size={16} />
            </button>
            <span className="zoom-level">{Math.round(zoomLevel * 100)}%</span>
            <button className="tool-btn" onClick={() => changeZoomAroundCenter(zoomLevelRef.current - 0.25)} title="Zoom Out">
              <ZoomOut size={16} />
            </button>
            <button className="tool-btn" onClick={() => changeZoomAroundCenter(1, true)} title="Fit to Screen">
              <Maximize size={16} />
            </button>
          </div>
        </div>

        <div className="toolbar-section bottom">
          <select 
            value={language} 
            onChange={(e) => {
              if (e.target.value !== language && acceptLeavingLayout() && acceptLeavingTranslationDraft()) {
                setLanguage(e.target.value as 'en' | 'pt-BR');
              }
            }}
            className="language-select"
            style={{ padding: '4px', borderRadius: '4px', border: '1px solid #444', background: '#333', color: '#fff', fontSize: '10px', width: '38px', appearance: 'none', textAlign: 'center' }}
            title="Language"
          >
            <option value="en">EN</option>
            <option value="pt-BR">PT</option>
          </select>

          <div className="divider"></div>

          <button 
            className={`admin-toggle ${isAdmin ? 'active' : ''}`}
            onClick={() => {
              if (isAdmin && !acceptLeavingLayout()) return;
              const nextAdmin = !isAdmin;
              setIsAdmin(nextAdmin);
              setIsRulerVisible(nextAdmin);
              if (!nextAdmin) setIsSymbolPaletteOpen(false);
            }}
            title={isAdmin ? 'Exit Admin' : 'Enter Admin'}
          >
            <Edit3 size={16} />
            <span>Admin</span>
          </button>
          <LocalSyncRecoveryControl visible={isAdmin} />
          {isAdmin && (
            <button
              className={`tool-btn ${isRulerVisible ? 'active' : ''}`}
              onClick={() => setIsRulerVisible(visible => !visible)}
              title={isRulerVisible ? 'Hide page ruler' : 'Show page ruler'}
              aria-label={isRulerVisible ? 'Hide page ruler' : 'Show page ruler'}
              aria-pressed={isRulerVisible}
            >
              <Ruler size={16} />
            </button>
          )}
          {isAdmin && viewMode === 'single' && (
            <button
              className={`tool-btn ${isLayoutMode ? 'active' : ''}`}
              onClick={() => {
                if (isLayoutMode) {
                  acceptLeavingLayout();
                  return;
                }
                setIsLayoutMode(true);
              }}
              title={isLayoutMode ? 'Exit translation frame layout' : 'Edit translation frames'}
              aria-label={isLayoutMode ? 'Exit translation frame layout' : 'Edit translation frames'}
              aria-pressed={isLayoutMode}
            >
              <Move size={16} />
            </button>
          )}
        </div>
      </aside>
      <FaqDrawer language={language} open={isFaqOpen} onOpenChange={setIsFaqOpen} onNavigateToPage={navigateToPage} />
      {isAdmin && (
        <AdminSymbolPalette
          language={language}
          context={paletteEditorState?.context ?? 'admin'}
          open={isSymbolPaletteOpen}
          canInsert={paletteEditorState?.canInsert ?? false}
          canUndo={paletteEditorState?.canUndo ?? false}
          status={paletteEditorState?.status ?? null}
          aliasPreferences={symbolAliasPreferences}
          aliasesLoading={symbolAliasSettingsLoading}
          onOpenChange={setIsSymbolPaletteOpen}
          onInsert={symbolId => activePaletteEditorRef.current?.state.insert(symbolId)}
          onUndo={() => activePaletteEditorRef.current?.state.undo()}
          onSaveAlias={handleSaveSymbolAlias}
        />
      )}
    </div>
  );
}

export default App;
