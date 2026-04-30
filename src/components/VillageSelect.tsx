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
};

function mergeClassNames(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function VillageSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  className,
}: VillageSelectProps) {
  const autoId = useId();
  const listId = `${autoId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

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
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
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
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          className="village-select-list absolute left-0 right-0 top-[calc(100%+0.35rem)] z-[100] max-h-60 overflow-y-auto rounded-lg border border-pine/18 bg-cream py-1 shadow-[0_14px_44px_-18px_rgba(12,24,20,0.45)] ring-1 ring-pine/8 motion-safe:animate-[village-select-in_140ms_ease-out]"
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
                  "mx-1 cursor-pointer rounded-md px-3 py-2.5 text-sm transition-colors motion-reduce:transition-none",
                  opt.disabled
                    ? "cursor-not-allowed text-ink/35"
                    : selected
                      ? "bg-pine-soft font-medium text-pine-2"
                      : hi
                        ? "bg-cream-muted text-ink"
                        : "text-ink hover:bg-pine-soft/70",
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
      ) : null}
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
