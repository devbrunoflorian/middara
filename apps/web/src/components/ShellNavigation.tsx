import { useEffect, useRef, useState } from 'react';
import { BookOpen, CircleHelp, ListTree, Menu, ShieldAlert } from 'lucide-react';
import { MiddaraMark } from './MiddaraMark';
import './ShellNavigation.css';

export type ShellDestination = 'rulebook' | 'faq' | 'errata' | 'contents';
const touchDrawerQuery = '(max-width: 700px), (hover: none) and (pointer: coarse)';

interface ShellNavigationProps {
  active: ShellDestination;
  onSelect: (destination: ShellDestination) => void;
  workspaceEditing?: boolean;
  openRequest?: number;
  onExpandedChange?: (expanded: boolean) => void;
}

const destinations: Array<{ id: ShellDestination; label: string; icon: typeof BookOpen }> = [
  { id: 'rulebook', label: 'Rulebook', icon: BookOpen },
  { id: 'faq', label: 'FAQ', icon: CircleHelp },
  { id: 'errata', label: 'Errata', icon: ShieldAlert },
  { id: 'contents', label: 'Índice', icon: ListTree },
];

export function ShellNavigation({ active, onSelect, workspaceEditing = false, openRequest = 0, onExpandedChange }: ShellNavigationProps) {
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(touchDrawerQuery).matches);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [clickOpen, setClickOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const handledOpenRequestRef = useRef(openRequest);
  const panelRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const expanded = isNarrow ? mobileOpen : clickOpen || (!workspaceEditing && (hoverOpen || focusOpen));

  useEffect(() => {
    if (handledOpenRequestRef.current === openRequest) return;
    handledOpenRequestRef.current = openRequest;
    if (isNarrow) setMobileOpen(true);
    else setClickOpen(true);
  }, [isNarrow, openRequest]);

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  useEffect(() => {
    const query = window.matchMedia(touchDrawerQuery);
    const update = () => {
      setIsNarrow(query.matches);
      setMobileOpen(false);
      setClickOpen(false);
      setHoverOpen(false);
      setFocusOpen(false);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    if (isNarrow && mobileOpen) firstItemRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || panelRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return;
      if (isNarrow) closeMobileDrawer();
      else {
        setClickOpen(false);
        setHoverOpen(false);
        setFocusOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (isNarrow) closeMobileDrawer();
      else {
        setClickOpen(false);
        setHoverOpen(false);
        setFocusOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expanded, isNarrow, mobileOpen]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!workspaceEditing) return;
    cancelClose();
    setHoverOpen(false);
    setFocusOpen(false);
    setClickOpen(false);
  }, [workspaceEditing]);

  const cancelClose = () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setHoverOpen(false);
      setFocusOpen(current => current && Boolean(panelRef.current?.contains(document.activeElement)));
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
    setClickOpen(open => !open);
  };

  const handleSelect = (destination: ShellDestination) => {
    onSelect(destination);
    setHoverOpen(false);
    setClickOpen(false);
    setFocusOpen(false);
    if (isNarrow) closeMobileDrawer();
  };

  return (
    <div className={`global-nav-slot ${expanded ? 'is-expanded' : ''} ${workspaceEditing ? 'is-editing' : ''}`}>
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
        className={`global-nav-panel arcane-glass-surface ${expanded ? 'is-expanded' : ''} ${isNarrow ? 'is-mobile' : ''} ${workspaceEditing ? 'is-editing' : ''}`}
        aria-label="Global navigation"
        onMouseEnter={() => {
          if (isNarrow || workspaceEditing) return;
          cancelClose();
          setHoverOpen(true);
        }}
        onMouseLeave={() => {
          if (!isNarrow && !clickOpen && !panelRef.current?.contains(document.activeElement)) scheduleClose();
        }}
        onFocusCapture={event => {
          if (!isNarrow && !workspaceEditing && event.target !== menuButtonRef.current) {
            cancelClose();
            setFocusOpen(true);
          }
        }}
        onBlurCapture={event => {
          if (isNarrow || event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setFocusOpen(false);
          if (!clickOpen) scheduleClose();
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
              : 'Toggle navigation'}
            aria-expanded={expanded}
            aria-controls="global-navigation"
            title={isNarrow
              ? (mobileOpen ? 'Close navigation' : 'Open navigation')
              : (clickOpen ? 'Close navigation' : 'Open navigation')}
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
