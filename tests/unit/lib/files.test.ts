import { describe, expect, it } from "vitest";
import { ACCEPTED_FILE_TYPES, fileGlyph, fileProblem, formatBytes } from "@/lib/files";

describe("Datei-Hilfen (B-81)", () => {
  it("formatiert Größen auf Deutsch", () => {
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1_572_864)).toBe("1,5 MB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
  });
  it("erlaubt nur Dateien der Positivliste und innerhalb der Grenze", () => {
    const max = 4 * 1024 * 1024;
    expect(fileProblem({ name: "Plan.PDF", size: 1000 }, max)).toBeNull();
    expect(fileProblem({ name: "daten.zip", size: max }, max)).toBeNull();
    expect(fileProblem({ name: "setup.exe", size: 10 }, max)).toMatch(/nicht erlaubt/);
    expect(fileProblem({ name: "seite.html", size: 10 }, max)).toMatch(/nicht erlaubt/);
    expect(fileProblem({ name: "ohne-endung", size: 10 }, max)).toMatch(/nicht erlaubt/);
    expect(fileProblem({ name: "leer.pdf", size: 0 }, max)).toMatch(/leer/);
    expect(fileProblem({ name: "gross.pdf", size: max + 1 }, max)).toMatch(/Zu groß/);
    expect(ACCEPTED_FILE_TYPES).toContain(".pdf");
    expect(ACCEPTED_FILE_TYPES).not.toContain(".exe");
  });
  it("ordnet Symbole zu", () => {
    expect(fileGlyph("a.pdf")).toBe("pdf");
    expect(fileGlyph("a.docx")).toBe("doc");
    expect(fileGlyph("a.xlsx")).toBe("sheet");
    expect(fileGlyph("a.csv")).toBe("sheet");
    expect(fileGlyph("a.pptx")).toBe("slides");
    expect(fileGlyph("a.zip")).toBe("zip");
    expect(fileGlyph("a.txt")).toBe("text");
  });
});
