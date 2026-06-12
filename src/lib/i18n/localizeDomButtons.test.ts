// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { localizeDomButtons } from "./localizeDomButtons";

describe("localizeDomButtons", () => {
  it("translates simple button text without removing icon children", () => {
    document.body.innerHTML = `
      <button type="button">
        <svg aria-hidden="true"></svg>
        Save
      </button>
      <button type="button">Cancel</button>
    `;

    localizeDomButtons(document.body, "si");

    const buttons = document.querySelectorAll("button");
    expect(buttons[0]?.textContent).toContain("සුරකින්න");
    expect(buttons[0]?.querySelector("svg")).not.toBeNull();
    expect(buttons[1]?.textContent).toBe("අවලංගු කරන්න");
  });

  it("translates aria-label on interactive elements", () => {
    document.body.innerHTML =
      '<button type="button" aria-label="Previous page">Previous</button>';

    localizeDomButtons(document.body, "ta");

    const button = document.querySelector("button");
    expect(button?.getAttribute("aria-label")).toBe("முந்தைய பக்கம்");
    expect(button?.textContent).toBe("முந்தைய");
  });

  it("leaves unknown labels unchanged", () => {
    document.body.innerHTML = '<button type="button">Custom action</button>';

    localizeDomButtons(document.body, "si");

    expect(document.querySelector("button")?.textContent).toBe("Custom action");
  });

  it("translates field labels and placeholders", () => {
    document.body.innerHTML = `
      <span class="village-field-label">Email</span>
      <input placeholder="Select a home" />
      <span class="village-th">Status</span>
    `;

    localizeDomButtons(document.body, "ta");

    expect(document.querySelector(".village-field-label")?.textContent).toBe(
      "மின்னஞ்சல்",
    );
    expect(document.querySelector("input")?.getAttribute("placeholder")).toBe(
      "இல்லம் தேர்வு",
    );
    expect(document.querySelector(".village-th")?.textContent).toBe(
      "நிலை",
    );
  });
});
