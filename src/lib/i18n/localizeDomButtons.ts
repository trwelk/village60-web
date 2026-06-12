import type { AppLocale } from "./locales";
import { createTranslator, type TranslateFn } from "./messages";
import { UI_LITERAL_MAP } from "./uiLiterals";

const INTERACTIVE_SELECTOR = [
  "button",
  'input[type="submit"]',
  'input[type="button"]',
  '[role="button"]',
  "a.village-btn-primary",
  "a.village-btn-secondary",
  "a.village-button",
  "a.village-table-action",
].join(",");

const LABELED_SELECTOR = [
  ".village-field-label",
  ".village-label",
  ".village-th",
  ".village-section-title",
  ".village-kicker",
  "th",
  "label",
  "legend",
  "dt",
  "option",
].join(",");

const TEXT_SELECTOR = [
  LABELED_SELECTOR,
  "p.text-xs",
  "p.text-sm",
  "span.text-xs",
  "span.text-sm",
].join(",");

function translateLiteral(text: string, t: TranslateFn): string | null {
  const key = UI_LITERAL_MAP[text];
  return key ? t(key) : null;
}

function localizeTextNodes(el: HTMLElement, t: TranslateFn): void {
  for (const node of el.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const raw = node.textContent ?? "";
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const translated = translateLiteral(trimmed, t);
    if (translated) {
      node.textContent = raw.replace(trimmed, translated);
    }
  }
}

function localizeAttributes(el: HTMLElement, t: TranslateFn): void {
  for (const attr of ["aria-label", "title", "placeholder"] as const) {
    const value = el.getAttribute(attr);
    if (!value) continue;
    const translated = translateLiteral(value.trim(), t);
    if (translated) {
      el.setAttribute(attr, translated);
    }
  }
}

function localizeLabeledElement(el: HTMLElement, t: TranslateFn): void {
  if (el.closest("[data-i18n-skip]")) return;

  const tag = el.tagName.toLowerCase();
  if (tag === "option") {
    const translated = translateLiteral((el.textContent ?? "").trim(), t);
    if (translated) el.textContent = translated;
    return;
  }

  if (el.childElementCount === 0) {
    const trimmed = (el.textContent ?? "").trim();
    if (!trimmed) return;
    const translated = translateLiteral(trimmed, t);
    if (translated) el.textContent = translated;
    return;
  }

  localizeTextNodes(el, t);
}

export function localizeDomButtons(root: ParentNode, locale: AppLocale): void {
  const t = createTranslator(locale);

  for (const el of root.querySelectorAll(INTERACTIVE_SELECTOR)) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.closest("[data-i18n-skip]")) continue;
    localizeTextNodes(el, t);
    localizeAttributes(el, t);
  }

  for (const el of root.querySelectorAll(LABELED_SELECTOR)) {
    if (!(el instanceof HTMLElement)) continue;
    localizeLabeledElement(el, t);
    localizeAttributes(el, t);
  }

  for (const el of root.querySelectorAll("input, textarea, select")) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.closest("[data-i18n-skip]")) continue;
    localizeAttributes(el, t);
  }

  for (const el of root.querySelectorAll(TEXT_SELECTOR)) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.closest("[data-i18n-skip]")) continue;
    if (el.closest(INTERACTIVE_SELECTOR)) continue;
    localizeLabeledElement(el, t);
  }
}
