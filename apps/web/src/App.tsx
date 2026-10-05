import { useState, useEffect, useRef, useCallback } from 'react';
import { PageRenderer, type Block, type CreditUnitDefinition, type LayoutFrame, type PageData, type PageFidelityOverlay } from './components/PageRenderer';
import { 
  ChevronLeft, ChevronRight, Edit3, 
  ZoomIn, ZoomOut, Maximize, Layout, LayoutList,
  BookOpen, Ruler, Move
} from 'lucide-react';
import './App.css';
import { attachSourceInlineElements, type SourceInlineElement } from './symbols/sourceInlineElements';

const TOTAL_PAGES = 102; // Pages with extracted DOM

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
      try {
        const inlineResponse = await fetch(`/pages/page_${pageStr}/inline_elements.json`);
        if (inlineResponse.ok) inlineElements = (await inlineResponse.json()).elements ?? [];
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
        blocks: attachSourceInlineElements((data.blocks || []).map((block: Block) => {
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
        }), inlineElements),
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
  const [isLoading, setIsLoading] = useState(true);
  // Start at 200% relative to the measured fit scale; Fit to Screen resets this multiplier to 100%.
  const [zoomLevel, setZoomLevel] = useState<number>(2);
  const [viewMode, setViewMode] = useState<'single' | 'scroll'>('single');
  const [pageInput, setPageInput] = useState<string>('1');
  const [language, setLanguage] = useState<'en' | 'pt-BR'>('en');

  // Single page mode: one page
  const [pageData, setPageData] = useState<PageData | null>(null);

  // Scroll mode: map of loaded pages
  const [scrollPages, setScrollPages] = useState<Map<number, PageData>>(new Map());

  const mainRef = useRef<HTMLDivElement>(null);

  const acceptLeavingLayout = useCallback(() => {
    if (isLayoutDirty && !window.confirm('Há alterações de moldura não salvas. Descartar e sair do modo de layout?')) return false;
    setIsLayoutMode(false);
    setIsLayoutDirty(false);
    return true;
  }, [isLayoutDirty]);

  // Navigate to a specific page (used by hyperlinks on Contents page)
  const navigateToPage = useCallback((pageNum: number) => {
    if (pageNum !== currentPage && !acceptLeavingLayout()) return;
    if (pageNum >= 1 && pageNum <= TOTAL_PAGES) {
      setCurrentPage(pageNum);
      // If in scroll mode, scroll to that page
      if (viewMode === 'scroll') {
        setTimeout(() => {
          const el = document.getElementById(`scroll-page-${pageNum}`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
  }, [viewMode, currentPage, acceptLeavingLayout]);

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
    <div className={`app-container ${isAdmin ? 'admin-mode' : ''} theme-dark`}>
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
                pageData={pageData} 
                isAdmin={isAdmin}
                showRuler={isAdmin && isRulerVisible}
                layoutMode={isAdmin && isLayoutMode}
                onLayoutDirtyChange={setIsLayoutDirty}
                zoomLevel={zoomLevel}
                onNavigate={navigateToPage}
                language={language}
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
                    pageData={scrollPages.get(num)!} 
                    isAdmin={isAdmin}
                    showRuler={false}
                    layoutMode={false}
                    zoomLevel={zoomLevel}
                    onNavigate={navigateToPage}
                    language={language}
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
          <div className="brand" title="Middara Rulebook">
            <BookOpen size={20} className="brand-icon" />
            <h1>Middara</h1>
          </div>
          <div className="divider"></div>
          
          {/* View Toggles */}
          <div className="tool-group">
            <button 
              className={`tool-btn ${viewMode === 'single' ? 'active' : ''}`}
              onClick={() => {
                if (viewMode !== 'single' && !acceptLeavingLayout()) return;
                setViewMode('single');
              }}
              title="Single Page View"
            >
              <Layout size={16} />
            </button>
            <button 
              className={`tool-btn ${viewMode === 'scroll' ? 'active' : ''}`}
              onClick={() => {
                if (viewMode !== 'scroll' && !acceptLeavingLayout()) return;
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
            <button className="tool-btn" onClick={() => setZoomLevel(z => Math.min(4, z + 0.25))} title="Zoom In">
              <ZoomIn size={16} />
            </button>
            <span className="zoom-level">{Math.round(zoomLevel * 100)}%</span>
            <button className="tool-btn" onClick={() => setZoomLevel(z => Math.max(0.25, z - 0.25))} title="Zoom Out">
              <ZoomOut size={16} />
            </button>
            <button className="tool-btn" onClick={() => setZoomLevel(1)} title="Fit to Screen">
              <Maximize size={16} />
            </button>
          </div>
        </div>

        <div className="toolbar-section bottom">
          <select 
            value={language} 
            onChange={(e) => {
              if (e.target.value !== language && acceptLeavingLayout()) setLanguage(e.target.value as 'en' | 'pt-BR');
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
            }}
            title={isAdmin ? 'Exit Admin' : 'Enter Admin'}
          >
            <Edit3 size={16} />
            <span>Admin</span>
          </button>
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
    </div>
  );
}

export default App;
