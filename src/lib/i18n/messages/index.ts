import type { AppLocale } from "../locales";
import { DEFAULT_LOCALE } from "../locales";
import { en, type MessageTree } from "./en";
import { si } from "./si";
import { ta } from "./ta";

export const messages: Record<AppLocale, MessageTree> = {
  en,
  si,
  ta,
};

function lookup(
  tree: Record<string, unknown>,
  key: string,
): string | undefined {
  const parts = key.split(".");
  let cur: unknown = tree;
  for (const part of parts) {
    if (typeof cur !== "object" || cur === null || !(part in cur)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function translate(locale: AppLocale, key: string): string {
  const primary = messages[locale] ?? messages[DEFAULT_LOCALE];
  return (
    lookup(primary as Record<string, unknown>, key) ??
    lookup(messages.en as Record<string, unknown>, key) ??
    key
  );
}

export type TranslateFn = (key: string) => string;

export function createTranslator(locale: AppLocale): TranslateFn {
  return (key: string) => translate(locale, key);
}

export function translateWith(
  locale: AppLocale,
  key: string,
  vars: Record<string, string | number>,
): string {
  let text = translate(locale, key);
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}
