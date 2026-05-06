"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type VillageSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type VillageSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: VillageSelectOption[];
  /** When the current value is missing from `options`. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** For screen readers when there is no associated visible label. */
  ariaLabel?: string;
  ariaRequired?: boolean;
};

function mergeClassNames(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

const MENU_MAX_PX = 240; // matches max-h-60

type MenuPlacement = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

function computeMenuPlacement(trigger: DOMRectReadOnly): MenuPlacement {
  const gap = 6;
  const pad = 8;
  let left = trigger.left;
  if (left + trigger.width > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - pad - trigger.width);
  }
  if (left < pad) {
    left = pad;
  }
  const spaceBelow = window.innerHeight - trigger.bottom - gap - pad;
  const maxHeight = Math.min(MENU_MAX_PX, Math.max(120, spaceBelow));
  return {
    top: trigger.bottom + gap,
    left,
    width: trigger.width,
    maxHeight,
  };
}

export function VillageSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  className,
  ariaLabel,
  ariaRequired,
}: VillageSelectProps) {
  const autoId = useId();
  const listId = `${autoId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [menuPlacement, setMenuPlacement] = useState<MenuPlacement | null>(
    null,
  );

  const enabledIndices = useMemo(() => {
    const idx: number[] = [];
    options.forEach((o, i) => {
      if (!o.disabled) idx.push(i);
    });
    return idx;
  }, [options]);

  const selectedIndex = useMemo(
    () => options.findIndex((o) => o.value === value),
    [options, value],
  );

  const displayLabel =
    selectedIndex >= 0 ? options[selectedIndex]!.label : placeholder;

  const computeInitialHighlight = useCallback((): number => {
    if (selectedIndex >= 0 && !options[selectedIndex]?.disabled) {
      return selectedIndex;
    }
    const first = enabledIndices[0];
    return first !== undefined ? first : 0;
  }, [enabledIndices, options, selectedIndex]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-village-option-index="${highlight}"]`,
    );
    el?.scrollIntoView?.({ block: "nearest" });
  }, [highlight, open]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPlacement(null);
      return;
    }
    function updatePlacement() {
      const btn = btnRef.current;
      if (!btn) return;
      setMenuPlacement(computeMenuPlacement(btn.getBoundingClientRect()));
    }
    updatePlacement();
    window.addEventListener("scroll", updatePlacement, true);
    window.addEventListener("resize", updatePlacement);
    return () => {
      window.removeEventListener("scroll", updatePlacement, true);
      window.removeEventListener("resize", updatePlacement);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (
        !rootRef.current?.contains(t) &&
        !listRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function openAndFocusHighlight() {
    setHighlight(computeInitialHighlight());
    setOpen(true);
  }

  function pickIndex(i: number) {
    const opt = options[i];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    btnRef.current?.focus();
  }

  function moveHighlight(delta: number) {
    if (enabledIndices.length === 0) return;
    const cur = enabledIndices.indexOf(highlight);
    const pos = cur < 0 ? 0 : cur;
    const nextPos = (pos + delta + enabledIndices.length) % enabledIndices.length;
    setHighlight(enabledIndices[nextPos]!);
  }

  function onButtonKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openAndFocusHighlight();
        return;
      }
      moveHighlight(e.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pickIndex(highlight);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      const f = enabledIndices[0];
      if (f !== undefined) setHighlight(f);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      const f = enabledIndices[enabledIndices.length - 1];
      if (f !== undefined) setHighlight(f);
    }
  }

  const activeDescendantId =
    open && options.length > 0 ? `${listId}-opt-${highlight}` : undefined;

  const listMarkup =
    open && menuPlacement ? (
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        tabIndex={-1}
        className="village-select-list fixed z-[260] overflow-y-auto rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_46%,transparent)] bg-[var(--bg-elevated)] py-1.5 text-[var(--text-primary)] shadow-[0_18px_48px_-20px_color-mix(in_srgb,var(--text-primary)_32%,transparent)] ring-1 ring-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] motion-safe:animate-[village-select-in_140ms_ease-out]"
        style={{
          top: menuPlacement.top,
          left: menuPlacement.left,
          width: menuPlacement.width,
          maxHeight: menuPlacement.maxHeight,
        }}
      >
        {options.map((opt, i) => {
          const selected = opt.value === value;
          const hi = i === highlight;
          return (
            <li
              key={`${opt.value}-${i}`}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={selected}
              data-village-option-index={i}
              className={mergeClassNames(
                "mx-1 cursor-pointer rounded-[var(--radius-sm)] px-3 py-2.5 text-sm transition-colors motion-reduce:transition-none",
                opt.disabled
                  ? "cursor-not-allowed text-ink/35"
                  : selected
                    ? "bg-[color:color-mix(in_srgb,var(--accent)_14%,var(--bg-muted)_86%)] font-medium text-pine-2"
                    : hi
                      ? "bg-[color:color-mix(in_srgb,var(--accent)_9%,var(--bg-muted)_91%)] text-ink"
                      : "text-ink hover:bg-[color:color-mix(in_srgb,var(--accent)_7%,var(--bg-muted)_93%)]",
              )}
              onMouseEnter={() => {
                if (!opt.disabled) setHighlight(i);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => pickIndex(i)}
            >
              {opt.label}
            </li>
          );
        })}
      </ul>
    ) : null;

  return (
    <div ref={rootRef} className={mergeClassNames("relative w-full", className)}>
      <button
        ref={btnRef}
        id={id}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-autocomplete="none"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeDescendantId}
        aria-label={ariaLabel}
        aria-required={ariaRequired}
        className={mergeClassNames(
          "village-select-trigger flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 text-left",
          open ? "border-terracotta ring-2 ring-terracotta/25" : "",
        )}
        onClick={() => {
          if (disabled) return;
          setOpen((wasOpen) => {
            if (wasOpen) return false;
            setHighlight(computeInitialHighlight());
            return true;
          });
        }}
        onKeyDown={onButtonKeyDown}
      >
        <span className="min-w-0 truncate">{displayLabel}</span>
        <span
          className={mergeClassNames(
            "shrink-0 text-pine/50 transition-transform duration-200 motion-reduce:transition-none",
            open ? "-rotate-180" : "",
          )}
          aria-hidden
        >
          <ChevronIcon />
        </span>
      </button>
      {listMarkup && typeof document !== "undefined"
        ? createPortal(listMarkup, document.body)
        : null}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-ink/55"
    >
      <path
        d="M4 6.5L8 10.5L12 6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
