import { useState, useEffect, useRef, useCallback } from 'react';
import { PageRenderer, type Block, type CreditUnitDefinition, type LayoutFrame, type PageData, type PageFidelityOverlay } from './components/PageRenderer';
import { 
  ChevronLeft, ChevronRight, Edit3, 
  ZoomIn, ZoomOut, Maximize, Layout, LayoutList,
  BookOpen
} from 'lucide-react';
import './App.css';

const TOTAL_PAGES = 102; // Pages with extracted DOM

async function loadPageData(pageNum: number): Promise<PageData> {
  const pageStr = pageNum.toString().padStart(3, '0');
  try {
    const res = await fetch(`/pages/page_${pageStr}/page_${pageStr}_dom.json`);
    if (res.ok) {
      const data = await res.json();
      let pageFrames: Record<string, LayoutFrame> = {};
      let pageCreditUnits: Record<string, CreditUnitDefinition | CreditUnitDefinition[]> = {};
      if (pageNum === 2) {
        try {
          const frameResponse = await fetch(`/pages/page_${pageStr}/layout_frames.json`);
          if (frameResponse.ok) pageFrames = await frameResponse.json();
        } catch {}
        try {
          const creditResponse = await fetch(`/pages/page_${pageStr}/credit_units.json`);
          if (creditResponse.ok) pageCreditUnits = await creditResponse.json();
        } catch {}
      }
      let fidelityOverlays: PageFidelityOverlay[] = [];
      if (pageNum === 4 || pageNum === 6 || pageNum === 7 || pageNum === 16 || pageNum === 50) {
        try {
          const overlayResponse = await fetch(`/pages/page_${pageStr}/fidelity_overlays.json`);
          if (overlayResponse.ok) {
            const overlayData = await overlayResponse.json();
            fidelityOverlays = overlayData.overlays || [];
          }
        } catch {}
      }
      return {
        page_number: pageNum,
        width: data.width || 820.35,
        height: data.height || 820.35,
        images: [],
        fidelityOverlays,
        blocks: (data.blocks || []).map((block: Block) => {
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
        }),
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

  // Navigate to a specific page (used by hyperlinks on Contents page)
  const navigateToPage = useCallback((pageNum: number) => {
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
  }, [viewMode]);

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
        setCurrentPage(p => Math.min(TOTAL_PAGES, p + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setCurrentPage(p => Math.max(1, p - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode]);

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(pageInput);
    if (!isNaN(num) && num >= 1 && num <= TOTAL_PAGES) {
      setCurrentPage(num);
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
              onClick={() => setViewMode('single')}
              title="Single Page View"
            >
              <Layout size={16} />
            </button>
            <button 
              className={`tool-btn ${viewMode === 'scroll' ? 'active' : ''}`}
              onClick={() => setViewMode('scroll')}
              title="Continuous Scroll"
            >
              <LayoutList size={16} />
            </button>
          </div>

          <div className="divider"></div>

          {/* Pagination Controls */}
          <div className="pagination-group">
            <button className="nav-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
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
            <button className="nav-btn" onClick={() => setCurrentPage(p => Math.min(TOTAL_PAGES, p + 1))}>
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
            onChange={(e) => setLanguage(e.target.value as 'en' | 'pt-BR')}
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
            onClick={() => setIsAdmin(!isAdmin)}
            title={isAdmin ? 'Exit Admin' : 'Enter Admin'}
          >
            <Edit3 size={16} />
            <span>Admin</span>
          </button>
        </div>
      </aside>
    </div>
  );
}

export default App;
