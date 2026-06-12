import { describe, expect, it } from "vitest";
import { isAppLocale, parseAppLocale } from "./locales";
import { translate } from "./messages";

describe("i18n locales", () => {
  it("accepts supported locale codes", () => {
    expect(isAppLocale("en")).toBe(true);
    expect(isAppLocale("si")).toBe(true);
    expect(isAppLocale("ta")).toBe(true);
    expect(isAppLocale("fr")).toBe(false);
  });

  it("parses locale strings", () => {
    expect(parseAppLocale(" si ")).toBe("si");
    expect(parseAppLocale("xx")).toBeNull();
    expect(parseAppLocale(null)).toBeNull();
  });

  it("returns translated nav labels", () => {
    expect(translate("en", "nav.overview")).toBe("Overview");
    expect(translate("si", "nav.overview")).toBe("සාරාංශය");
    expect(translate("ta", "nav.overview")).toBe("கண்ணோட்டம்");
  });

  it("returns translated field labels in all locales", () => {
    expect(translate("en", "fields.email")).toBe("Email");
    expect(translate("si", "fields.email")).toBe("ඊමේල්");
    expect(translate("ta", "fields.email")).toBe("மின்னஞ்சல்");
  });
});
