import { useEffect, useRef, useState } from 'react';
import { BookOpen, CircleHelp, ListTree, Menu, ShieldAlert } from 'lucide-react';
import { MiddaraMark } from './MiddaraMark';
import './ShellNavigation.css';

export type ShellDestination = 'rulebook' | 'faq' | 'errata' | 'contents';
const touchDrawerQuery = '(max-width: 700px), (hover: none) and (pointer: coarse)';

interface ShellNavigationProps {
  pinned: boolean;
  active: ShellDestination;
  onPinnedChange: (pinned: boolean) => void;
  onSelect: (destination: ShellDestination) => void;
}

const destinations: Array<{ id: ShellDestination; label: string; icon: typeof BookOpen }> = [
  { id: 'rulebook', label: 'Rulebook', icon: BookOpen },
  { id: 'faq', label: 'FAQ', icon: CircleHelp },
  { id: 'errata', label: 'Errata', icon: ShieldAlert },
  { id: 'contents', label: 'Índice', icon: ListTree },
];

export function ShellNavigation({ pinned, active, onPinnedChange, onSelect }: ShellNavigationProps) {
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(touchDrawerQuery).matches);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const expanded = isNarrow ? mobileOpen : pinned || hoverOpen;

  useEffect(() => {
    const query = window.matchMedia(touchDrawerQuery);
    const update = () => {
      setIsNarrow(query.matches);
      if (!query.matches) setMobileOpen(false);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (isNarrow && pinned) onPinnedChange(false);
  }, [isNarrow, onPinnedChange, pinned]);

  useEffect(() => {
    if (!mobileOpen) return;
    firstItemRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMobileDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  const cancelClose = () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setHoverOpen(false);
      closeTimerRef.current = null;
    }, 220);
  };

  const closeMobileDrawer = () => {
    setMobileOpen(false);
    menuButtonRef.current?.focus();
  };

  const handleMenuClick = () => {
    if (isNarrow) {
      setMobileOpen(open => !open);
      return;
    }
    onPinnedChange(!pinned);
  };

  const handleSelect = (destination: ShellDestination) => {
    onSelect(destination);
    setHoverOpen(false);
    if (isNarrow) closeMobileDrawer();
  };

  return (
    <div className={`global-nav-slot ${pinned && !isNarrow ? 'is-pinned' : ''}`}>
      {isNarrow && mobileOpen && (
        <button
          className="global-nav-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={closeMobileDrawer}
        />
      )}
      <aside
        ref={panelRef}
        id="global-navigation"
        className={`global-nav-panel ${expanded ? 'is-expanded' : ''} ${pinned && !isNarrow ? 'is-pinned' : ''} ${isNarrow ? 'is-mobile' : ''}`}
        aria-label="Global navigation"
        onMouseEnter={() => {
          if (isNarrow) return;
          cancelClose();
          setHoverOpen(true);
        }}
        onMouseLeave={() => {
          if (!isNarrow && !pinned && !panelRef.current?.contains(document.activeElement)) scheduleClose();
        }}
        onFocusCapture={() => { if (!isNarrow) { cancelClose(); setHoverOpen(true); } }}
        onBlurCapture={event => {
          if (isNarrow || event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          if (!pinned) scheduleClose();
        }}
      >
        <div className="global-nav-header">
          <div className="global-nav-brand" aria-label="Middara Rulebook">
            <MiddaraMark className="global-nav-mark" />
            <span>Middara</span>
          </div>
          <button
            ref={menuButtonRef}
            className="global-nav-menu-button"
            type="button"
            aria-label={isNarrow
              ? (mobileOpen ? 'Close navigation' : 'Open navigation')
              : (pinned ? 'Unpin navigation open' : 'Pin navigation open')}
            aria-expanded={expanded}
            aria-controls="global-navigation"
            aria-pressed={!isNarrow && pinned}
            title={isNarrow
              ? (mobileOpen ? 'Close navigation' : 'Open navigation')
              : (pinned ? 'Unpin navigation open' : 'Pin navigation open')}
            onClick={handleMenuClick}
          >
            <Menu size={18} aria-hidden="true" />
          </button>
        </div>
        <nav className="global-nav-links" aria-label="Rulebook sections">
          {destinations.map(({ id, label, icon: Icon }, index) => (
            <button
              key={id}
              ref={index === 0 ? firstItemRef : undefined}
              type="button"
              className={`global-nav-link ${active === id ? 'is-active' : ''}`}
              aria-current={active === id ? 'page' : undefined}
              aria-label={label}
              title={label}
              onClick={() => handleSelect(id)}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>
    </div>
  );
}
