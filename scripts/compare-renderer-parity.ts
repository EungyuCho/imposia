import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createRenderer } from "../packages/node/dist/renderer.js";
import type { Renderer, RenderResult } from "../packages/node/src/types.js";
import { type ParityFixture, rendererParityFixtures } from "./renderer-parity-fixtures.js";

const DIMENSION_TOLERANCE_POINTS = 0.01;

export interface StructuralPage {
  readonly number: number;
  readonly widthPoints: number;
  readonly heightPoints: number;
  readonly orderedText: string;
  readonly decorationPresence: Readonly<Record<string, boolean>>;
  readonly blank: boolean;
}

export interface StructuralSnapshot {
  readonly pageCount: number;
  readonly pages: readonly StructuralPage[];
  readonly warnings: readonly { code: string; severity: string; message: string }[];
}

export interface ParityComparison {
  readonly fixture: string;
  readonly legacy: StructuralSnapshot;
  readonly core: StructuralSnapshot;
  readonly differences: readonly string[];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decorationPresence(text: string, fixture: ParityFixture): Record<string, boolean> {
  const presence: Record<string, boolean> = {};
  for (const [kind, markers] of Object.entries(fixture.decorations ?? {})) {
    for (const marker of markers) presence[`${kind}:${marker}`] = text.includes(marker);
  }
  return presence;
}

async function snapshotPdf(
  result: RenderResult,
  fixture: ParityFixture,
): Promise<StructuralSnapshot> {
  const pdf = await getDocument({ data: result.pdf.slice() }).promise;
  try {
    const pages: StructuralPage[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const [viewport, content] = await Promise.all([
        page.getViewport({ scale: 1 }),
        page.getTextContent(),
      ]);
      const orderedText = normalizeText(
        content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
      );
      const bodyPresent = fixture.bodyMarkers.some((marker) => orderedText.includes(marker));
      pages.push({
        number,
        widthPoints: viewport.width,
        heightPoints: viewport.height,
        orderedText,
        decorationPresence: decorationPresence(orderedText, fixture),
        blank: !bodyPresent,
      });
      page.cleanup();
    }
    return {
      pageCount: pdf.numPages,
      pages,
      warnings: result.warnings.map(({ code, severity, message }) => ({ code, severity, message })),
    };
  } finally {
    await pdf.destroy();
  }
}

function compareValue(differences: string[], label: string, legacy: unknown, core: unknown): void {
  if (JSON.stringify(legacy) !== JSON.stringify(core)) {
    differences.push(`${label}: legacy=${JSON.stringify(legacy)} core=${JSON.stringify(core)}`);
  }
}

export function compareStructuralSnapshots(
  legacy: StructuralSnapshot,
  core: StructuralSnapshot,
): readonly string[] {
  const differences: string[] = [];
  compareValue(differences, "pageCount", legacy.pageCount, core.pageCount);
  const pageCount = Math.max(legacy.pages.length, core.pages.length);
  for (let index = 0; index < pageCount; index += 1) {
    const legacyPage = legacy.pages[index];
    const corePage = core.pages[index];
    if (legacyPage === undefined || corePage === undefined) {
      differences.push(
        `page ${index + 1}: missing from ${legacyPage === undefined ? "legacy" : "core"}`,
      );
      continue;
    }
    if (Math.abs(legacyPage.widthPoints - corePage.widthPoints) > DIMENSION_TOLERANCE_POINTS) {
      differences.push(
        `page ${index + 1} widthPoints: legacy=${legacyPage.widthPoints} core=${corePage.widthPoints}`,
      );
    }
    if (Math.abs(legacyPage.heightPoints - corePage.heightPoints) > DIMENSION_TOLERANCE_POINTS) {
      differences.push(
        `page ${index + 1} heightPoints: legacy=${legacyPage.heightPoints} core=${corePage.heightPoints}`,
      );
    }
    compareValue(
      differences,
      `page ${index + 1} orderedText`,
      legacyPage.orderedText,
      corePage.orderedText,
    );
    compareValue(
      differences,
      `page ${index + 1} decorations`,
      legacyPage.decorationPresence,
      corePage.decorationPresence,
    );
    compareValue(differences, `page ${index + 1} blank`, legacyPage.blank, corePage.blank);
  }
  compareValue(differences, "warnings", legacy.warnings, core.warnings);
  return differences;
}

export async function compareRendererParity(
  renderer: Renderer,
  fixture: ParityFixture,
): Promise<ParityComparison> {
  const html = await readFile(fixture.file, "utf8");
  const legacyResult = await renderer.render({ html }, { engine: "legacy" });
  const coreResult = await renderer.render({ html }, { engine: "core" });
  const [legacy, core] = await Promise.all([
    snapshotPdf(legacyResult, fixture),
    snapshotPdf(coreResult, fixture),
  ]);
  return {
    fixture: fixture.name,
    legacy,
    core,
    differences: compareStructuralSnapshots(legacy, core),
  };
}

function selectedFixtures(arguments_: readonly string[]): readonly ParityFixture[] {
  const names = new Set(arguments_);
  if (names.size === 0) return rendererParityFixtures;
  const selected = rendererParityFixtures.filter((fixture) => names.has(fixture.name));
  if (selected.length !== names.size) {
    const known = new Set(selected.map((fixture) => fixture.name));
    throw new Error(
      `Unknown parity fixture: ${[...names].filter((name) => !known.has(name)).join(", ")}`,
    );
  }
  return selected;
}

async function main(): Promise<void> {
  const fixtures = selectedFixtures(process.argv.slice(2));
  const renderer = createRenderer();
  try {
    const comparisons: ParityComparison[] = [];
    for (const fixture of fixtures)
      comparisons.push(await compareRendererParity(renderer, fixture));
    const failures = comparisons.filter((comparison) => comparison.differences.length > 0);
    for (const comparison of comparisons) {
      if (comparison.differences.length === 0) {
        process.stdout.write(
          `PASS ${comparison.fixture}: ${comparison.legacy.pageCount} pages; ${comparison.legacy.warnings.length} warnings.\n`,
        );
      } else {
        process.stderr.write(
          `FAIL ${comparison.fixture}:\n${comparison.differences.map((difference) => `  ${difference}`).join("\n")}\n`,
        );
      }
    }
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await renderer.close();
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  void main();
}
