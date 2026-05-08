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

export type ResidentComboboxOption = {
  /** Stable resident identifier used as the selected value. */
  value: string;
  /** Resident display name used for filtering and rendering. */
  label: string;
  /** Optional secondary text shown beneath the label (e.g. status). */
  hint?: string;
};

type Props = {
  id?: string;
  /** Currently selected resident id, or null when nothing is selected. */
  value: string | null;
  onChange: (value: string | null) => void;
  options: ResidentComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
};

const MENU_MAX_PX = 320;

type MenuPlacement = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

function mergeClassNames(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(" ");
}

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
  const maxHeight = Math.min(MENU_MAX_PX, Math.max(160, spaceBelow));
  return {
    top: trigger.bottom + gap,
    left,
    width: trigger.width,
    maxHeight,
  };
}

function normalizeForFilter(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Typable combobox for picking a resident. Filters options by case-insensitive
 * substring match on `label`. Keyboard support: Arrow up/down to move, Enter
 * to select, Escape to close, Backspace on empty input clears the selection.
 */
export function ResidentCombobox({
  id,
  value,
  onChange,
  options,
  placeholder = "Search residents…",
  disabled,
  className,
  ariaLabel,
}: Props) {
  const autoId = useId();
  const listId = `${autoId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [menuPlacement, setMenuPlacement] = useState<MenuPlacement | null>(null);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    const q = normalizeForFilter(query);
    if (!q) return options;
    return options.filter((o) => normalizeForFilter(o.label).includes(q));
  }, [options, query]);

  const displayValue = open ? query : selectedOption?.label ?? "";

  useEffect(() => {
    if (highlight >= filteredOptions.length) {
      setHighlight(0);
    }
  }, [filteredOptions, highlight]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-resident-option-index="${highlight}"]`,
    );
    el?.scrollIntoView?.({ block: "nearest" });
  }, [highlight, open]);

  const updatePlacement = useCallback(() => {
    const trigger = inputRef.current;
    if (!trigger) return;
    setMenuPlacement(computeMenuPlacement(trigger.getBoundingClientRect()));
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPlacement(null);
      return;
    }
    updatePlacement();
    window.addEventListener("scroll", updatePlacement, true);
    window.addEventListener("resize", updatePlacement);
    return () => {
      window.removeEventListener("scroll", updatePlacement, true);
      window.removeEventListener("resize", updatePlacement);
    };
  }, [open, updatePlacement]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (
        !rootRef.current?.contains(t) &&
        !listRef.current?.contains(t)
      ) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function pickIndex(i: number) {
    const opt = filteredOptions[i];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function clearSelection() {
    onChange(null);
    setQuery("");
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlight(0);
        return;
      }
      setHighlight((h) =>
        filteredOptions.length === 0 ? 0 : (h + 1) % filteredOptions.length,
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlight(Math.max(0, filteredOptions.length - 1));
        return;
      }
      setHighlight((h) =>
        filteredOptions.length === 0
          ? 0
          : (h - 1 + filteredOptions.length) % filteredOptions.length,
      );
      return;
    }
    if (e.key === "Enter" && open) {
      e.preventDefault();
      pickIndex(highlight);
      return;
    }
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setQuery("");
      }
      return;
    }
    if (e.key === "Backspace" && query === "" && selectedOption) {
      e.preventDefault();
      clearSelection();
      return;
    }
  }

  const activeDescendantId =
    open && filteredOptions.length > 0
      ? `${listId}-opt-${highlight}`
      : undefined;

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
        {filteredOptions.length === 0 ? (
          <li
            className="mx-1 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm text-[var(--text-secondary)]"
            role="presentation"
          >
            No matching residents.
          </li>
        ) : (
          filteredOptions.map((opt, i) => {
            const selected = opt.value === value;
            const hi = i === highlight;
            return (
              <li
                key={opt.value}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={selected}
                data-resident-option-index={i}
                className={mergeClassNames(
                  "mx-1 cursor-pointer rounded-[var(--radius-sm)] px-3 py-2.5 text-sm transition-colors motion-reduce:transition-none",
                  selected
                    ? "bg-[color:color-mix(in_srgb,var(--accent)_14%,var(--bg-muted)_86%)] font-medium text-pine-2"
                    : hi
                      ? "bg-[color:color-mix(in_srgb,var(--accent)_9%,var(--bg-muted)_91%)] text-ink"
                      : "text-ink hover:bg-[color:color-mix(in_srgb,var(--accent)_7%,var(--bg-muted)_93%)]",
                )}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => pickIndex(i)}
              >
                <div className="truncate">{opt.label}</div>
                {opt.hint ? (
                  <div className="text-xs text-[var(--text-secondary)]">
                    {opt.hint}
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    ) : null;

  return (
    <div ref={rootRef} className={mergeClassNames("relative w-full", className)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeDescendantId}
          aria-label={ariaLabel}
          value={displayValue}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="village-input w-full pr-9"
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onKeyDown={onInputKeyDown}
        />
        {selectedOption && !open ? (
          <button
            type="button"
            aria-label="Clear resident"
            tabIndex={-1}
            className="absolute inset-y-0 right-2 my-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-pine/60 hover:bg-pine/8 hover:text-pine"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clearSelection}
          >
            <ClearIcon />
          </button>
        ) : (
          <span
            className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-pine/45"
            aria-hidden
          >
            <ChevronIcon />
          </span>
        )}
      </div>
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

function ClearIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 4L12 12M12 4L4 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
