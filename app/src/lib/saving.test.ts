import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { onePagePdf, printableSvg, wrap } from "./saving";

describe("saving", () => {
  it("makes a drawing standalone, in fixed colours whatever the theme", () => {
    const svg = printableSvg('<svg viewBox="0 0 10 10"><text fill="var(--foreground)">A</text><line stroke="var(--border)"/></svg>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('fill="#16202a"');
    expect(svg).not.toContain("var(");
    expect(svg).toContain("font-size:11px"); // the screen's text size, which a class would lose
  });

  it("wraps words into lines that fit", () => {
    expect(wrap("aa bb cc dd", (s) => s.length, 5)).toEqual(["aa bb", "cc dd"]);
    expect(wrap("toolongword x", (s) => s.length, 5)).toEqual(["toolongword", "x"]);
  });

  it("puts the picture and its words on one landscape page", async () => {
    const dot = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const pdf = await PDFDocument.load(await onePagePdf("Section A to A′", ["Line A to A′: 2.0 km"], { bytes: dot, width: 1000, height: 600 }, ["A note"]));
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Section A to A′");
    expect(pdf.getPage(0).getWidth()).toBeGreaterThan(pdf.getPage(0).getHeight());
  });
});
