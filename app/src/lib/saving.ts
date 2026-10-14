/**
 * Saving a drawing as a picture or a PDF, built on this computer (StrataField's approach). Saved
 * files use fixed light colours, so they look the same whatever the app's theme.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PRINT_COLOURS: Record<string, string> = { "--foreground": "#16202a", "--muted-foreground": "#5a6774" };

/** The drawing as standalone SVG: namespace, a white page, fixed colours and a common font. */
export function printableSvg(markup: string): string {
  return markup
    .replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" `)
    .replace(/(<svg[^>]*>)/, `$1<style>text{font-family:Helvetica,Arial,sans-serif;font-size:11px}</style><rect width="100%" height="100%" fill="#ffffff"/>`)
    .replace(/var\((--[a-z-]+)\)/g, (_, name: string) => PRINT_COLOURS[name] ?? "#000000");
}

/** Standalone SVG as a PNG, `scale` times its size. */
export async function svgToPng(svg: string, scale = 2): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const [, width, height] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!.map(Number);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob: Blob = await new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("no picture"))), "image/png"));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** One A4 landscape page: a title, lines under it, the picture, and notes at the foot. */
export async function onePagePdf(title: string, lines: string[], png: { bytes: Uint8Array; width: number; height: number }, notes: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator("StrataVision");
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [W, H, M] = [841.89, 595.28, 36];
  const page = doc.addPage([W, H]);
  const ink = rgb(0.086, 0.125, 0.165), quiet = rgb(0.353, 0.404, 0.455);
  // The standard fonts only know Latin-1: the prime of A′ becomes an apostrophe.
  const safe = (s: string) => s.replace(/′/g, "'").replace(/…/g, "...").replace(/[^\x20-\xff]/g, "?");
  let y = H - M - 16;
  page.drawText(safe(title), { x: M, y, size: 16, font: bold, color: ink });
  for (const line of lines) page.drawText(safe(line), { x: M, y: (y -= 15), size: 10, font, color: quiet });
  const noteSize = 8.5, wrapped = notes.flatMap((n) => wrap(safe(n), (s) => font.widthOfTextAtSize(s, noteSize), W - 2 * M));
  const room = { width: W - 2 * M, height: y - 12 - (M + wrapped.length * 12 + 6) };
  const scale = Math.min(room.width / png.width, room.height / png.height);
  const image = await doc.embedPng(png.bytes);
  page.drawImage(image, { x: M + (room.width - png.width * scale) / 2, y: y - 12 - png.height * scale, width: png.width * scale, height: png.height * scale });
  wrapped.forEach((line, i) => page.drawText(line, { x: M, y: M + (wrapped.length - 1 - i) * 12, size: noteSize, font, color: quiet }));
  return doc.save();
}

/** Words into lines no wider than `max`. */
export function wrap(s: string, widthOf: (s: string) => number, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && widthOf(next) > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  return line ? [...lines, line] : lines;
}

/** Asks where to save and writes the file. The path saved to, or null if the Save dialog was cancelled. */
export async function saveFile(suggestedName: string, kind: "png" | "pdf", bytes: Uint8Array): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const filters = { png: [{ name: "Picture", extensions: ["png"] }], pdf: [{ name: "PDF", extensions: ["pdf"] }] }[kind];
  const path = await save({ defaultPath: suggestedName, filters });
  if (!path) return null;
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  await writeFile(path, bytes);
  return path;
}
