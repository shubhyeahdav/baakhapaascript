import React, { useEffect, useRef, useState } from "react";

/**
 * A dropdown for toolbar controls that do not need to be visible at all times.
 *
 * The editor toolbar had grown to thirteen controls in a single row, most of
 * them unlabelled icons, and a writer opening the page for the first time had
 * no way to tell which were safe to press. The row was also competing for
 * width with the one control that matters — Finalize & Storyboard.
 *
 * The rule applied here: a control stays on the surface if it is used *while
 * writing* (the script toggle, the view switcher, the page count). Everything
 * used occasionally — exporting, changing the page colour — goes behind a
 * labelled menu, because a named menu item explains itself and an icon in a
 * row of twelve does not.
 */
export default function ToolbarMenu({ label, title, items, align = "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        className={`text-xs py-1.5 px-3 rounded-lg border transition ${
          open
            ? "bg-goldDim border-gold/40 text-gold"
            : "border-border text-inkMuted hover:text-ink"
        }`}
      >
        {label}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute ${align === "right" ? "right-0" : "left-0"} mt-2 w-60 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-up`}
        >
          {items.map((item) =>
            item.divider ? (
              <div key={item.key} className="h-px bg-borderSoft my-1" />
            ) : (
              <button
                key={item.key}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
              >
                <span className="block text-[13px] text-inkSoft">
                  {item.label}
                  {item.active && <span className="text-gold ml-1.5">•</span>}
                </span>
                {item.hint && (
                  <span className="block text-[11px] text-inkMuted mt-0.5 leading-snug">
                    {item.hint}
                  </span>
                )}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
