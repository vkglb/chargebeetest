import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string; // tooltip, e.g. why a disabled item is unavailable
}
export interface MenuSection {
  title?: string;
  items: MenuItem[];
}

// A kebab (⋮) button that opens a floating action menu, grouped into titled
// sections. The menu is fixed-positioned from the button's rect so it never
// gets clipped by table/overflow, and closes on outside-click, Esc or scroll.
export default function RowMenu({ sections, ariaLabel = "Row actions" }: { sections: MenuSection[]; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position the menu just below/left-aligned to the button, flipping up if it
  // would overflow the viewport bottom.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight ?? 320;
    const menuW = 240;
    let top = r.bottom + 4;
    if (top + menuH > window.innerHeight - 8) top = Math.max(8, r.top - menuH - 4);
    const left = Math.min(r.right - menuW, window.innerWidth - menuW - 8);
    setPos({ top, left: Math.max(8, left) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        className="kebab-btn"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ⋮
      </button>
      {open && (
        <div
          ref={menuRef}
          className="row-menu"
          role="menu"
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {sections.map((section, si) => (
            <div key={si} className="row-menu-section">
              {section.title && <div className="row-menu-title">{section.title}</div>}
              {section.items.map((item, ii) => (
                <button
                  key={ii}
                  role="menuitem"
                  className={`row-menu-item${item.danger ? " danger" : ""}`}
                  disabled={item.disabled}
                  title={item.title}
                  onClick={() => {
                    if (item.disabled) return;
                    setOpen(false);
                    item.onClick?.();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
