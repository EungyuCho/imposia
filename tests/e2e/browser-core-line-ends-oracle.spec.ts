import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

// Function-level oracle for the ASA-425 rendered-line-ends fast path and the
// grapheme-segmentation cache. The spec imports the compiled pagination module
// directly (via the fixture page's import map, which stubs postcss) and proves
// that renderedLineEndsFast returns offset arrays identical to the sequential
// per-grapheme implementation across scripts, and that seedGraphemeSuffix
// seeds segmentations byte-identical to re-segmenting the suffix from scratch.

type LineEndsObservation = Readonly<{
  id: string;
  lineCount: number;
  sequential: readonly number[];
  fast: readonly number[] | null;
  sequentialRectCalls: number;
  fastRectCalls: number;
}>;

type SegmentationObservation = Readonly<{
  id: string;
  fullMatchesDirect: boolean;
  boundaryMismatches: readonly string[];
  seededFromCache: number;
  nonBoundaryMismatches: readonly string[];
}>;

type LineEndsCase = Readonly<{
  id: string;
  text: string;
  css?: string;
  dir?: string;
  width?: number;
}>;

const SENTENCE =
  "The harbour clerks compared the tide tables against the merchants' claims every spring, and the ledger kept every correction in the margin. ";
const CJK_SENTENCE =
  "静かな港町では帳簿をすべて手書きで管理しており、春になると書記たちは潮汐表と商人たちの申告を突き合わせて確認していた。";
const THAI_SENTENCE =
  "เจ้าหน้าที่ท่าเรือเปรียบเทียบตารางน้ำขึ้นน้ำลงกับคำกล่าวอ้างของพ่อค้าทุกฤดูใบไม้ผลิและบัญชีเก็บการแก้ไขทุกครั้งไว้ที่ขอบ";
const NFC_SENTENCE = "Élan café résumé naïveté crème brûlée señor jalapeño déjà vu ";
const HEBREW_RUN = "שלום עולם ושוב שלום";

const LINE_ENDS_CASES: readonly LineEndsCase[] = [
  { id: "english-long", text: SENTENCE.repeat(90) },
  { id: "english-narrow", text: SENTENCE.repeat(40), width: 272 },
  { id: "cjk-long", text: CJK_SENTENCE.repeat(110) },
  { id: "cjk-narrow", text: CJK_SENTENCE.repeat(40), width: 272 },
  { id: "thai-long", text: THAI_SENTENCE.repeat(40) },
  { id: "combining-nfc", text: NFC_SENTENCE.repeat(60) },
  { id: "combining-nfd", text: NFC_SENTENCE.repeat(60).normalize("NFD") },
  {
    id: "zwj-emoji",
    text: `crew 🧑‍🚀 and family 👩‍👩‍👧‍👦 met the keeper 👨‍🌾 at dawn ${SENTENCE}`.repeat(24),
  },
  {
    id: "regional-indicators",
    text: `flags 🇰🇷🇯🇵🇺🇸🇫🇷🇩🇪🇧🇷🇨🇦🇦🇺 lined the quay ${SENTENCE}`.repeat(24),
  },
  {
    id: "pre-wrap-newlines",
    text: `${SENTENCE}\n${CJK_SENTENCE}\n${SENTENCE}\n`.repeat(20),
    css: "white-space: pre-wrap;",
  },
  { id: "bidi-mixed", text: `${SENTENCE}${HEBREW_RUN} `.repeat(40) },
  { id: "rtl-paragraph", text: `${HEBREW_RUN} `.repeat(160), dir: "rtl" },
];

// The fast path must engage (and cut getClientRects calls by 95% or better)
// at least on these; the rest — narrow columns and forced pre-wrap breaks —
// may cost more or legally fall back, but must be identical whenever they do
// engage.
const MUST_ENGAGE = new Set([
  "english-long",
  "cjk-long",
  "thai-long",
  "combining-nfc",
  "combining-nfd",
  "zwj-emoji",
  "regional-indicators",
  "bidi-mixed",
  "rtl-paragraph",
]);

const SEGMENTATION_STRINGS: readonly Readonly<{ id: string; text: string }>[] = [
  { id: "ascii-words", text: "abc def ghi jkl" },
  { id: "regional-indicators", text: "🇰🇷🇯🇵🇺🇸🇫🇷🇩🇪" },
  { id: "zwj-emoji", text: "👩‍👩‍👧‍👦👨‍👩‍👧x🧑‍🚀y👨‍🌾" },
  { id: "combining-nfc", text: "éèêë ñç åø" },
  { id: "combining-nfd", text: "éèêë ñç åø".normalize("NFD") },
  { id: "thai", text: "สวัสดีครับผมมาจากท่าเรือ" },
  { id: "devanagari", text: "क्षत्रिय संस्कृति" },
  { id: "newlines", text: "line\nbreak\ntext\n" },
  { id: "bidi", text: "שלום עולם abc והלאה" },
];

test("fast rendered line ends match the sequential scan and slash getClientRects calls", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/tests/e2e/fixtures/line-ends-oracle.html");

  try {
    const observations = await page.evaluate(async (cases) => {
      type Checkpoint = () => undefined;
      type Api = Readonly<{
        graphemeEnds(text: Text, checkpoint: Checkpoint): Promise<readonly number[]>;
        renderedLineEndsSequential(
          text: Text,
          graphemes: readonly number[],
          checkpoint: Checkpoint,
        ): Promise<readonly number[]>;
        renderedLineEndsFast(
          text: Text,
          graphemes: readonly number[],
          checkpoint: Checkpoint,
        ): Promise<readonly number[] | undefined>;
      }>;
      const module = (await import("/packages/core/dist/page-document-generation.js")) as Readonly<{
        internalTextSplitTestApi: Api;
      }>;
      const api = module.internalTextSplitTestApi;
      const checkpoint: Checkpoint = () => undefined;

      const nativeGetClientRects = Range.prototype.getClientRects;
      let rectCalls = 0;
      Range.prototype.getClientRects = function instrumented(this: Range) {
        rectCalls += 1;
        return nativeGetClientRects.call(this);
      };

      const results = [];
      try {
        for (const item of cases) {
          const container = document.createElement("div");
          container.style.cssText = `width: ${item.width ?? 640}px; font: 13px/1.5 Arial, sans-serif; ${item.css ?? ""}`;
          if (item.dir !== undefined) container.dir = item.dir;
          const text = document.createTextNode(item.text);
          container.append(text);
          document.body.append(container);
          try {
            const graphemes = await api.graphemeEnds(text, checkpoint);
            rectCalls = 0;
            const sequential = await api.renderedLineEndsSequential(text, graphemes, checkpoint);
            const sequentialRectCalls = rectCalls;
            rectCalls = 0;
            const fast = await api.renderedLineEndsFast(text, graphemes, checkpoint);
            const fastRectCalls = rectCalls;
            results.push({
              id: item.id,
              lineCount: sequential.length,
              sequential: [...sequential],
              fast: fast === undefined ? null : [...fast],
              sequentialRectCalls,
              fastRectCalls,
            });
          } finally {
            container.remove();
          }
        }
      } finally {
        Range.prototype.getClientRects = nativeGetClientRects;
      }
      return results;
    }, LINE_ENDS_CASES);

    for (const observation of observations as readonly LineEndsObservation[]) {
      console.log(
        `[line-ends] ${observation.id}: lines=${observation.lineCount} fast=${observation.fast === null ? "fallback" : "engaged"} rects ${observation.sequentialRectCalls} -> ${observation.fastRectCalls}`,
      );
      expect(observation.lineCount, `${observation.id}: exercises many lines`).toBeGreaterThan(8);
      if (observation.fast !== null) {
        expect(observation.fast, `${observation.id}: fast path offsets`).toEqual(
          observation.sequential,
        );
      }
      if (MUST_ENGAGE.has(observation.id)) {
        expect(observation.fast, `${observation.id}: fast path must engage`).not.toBeNull();
        expect(
          observation.fastRectCalls,
          `${observation.id}: getClientRects reduction (fast ${observation.fastRectCalls} vs sequential ${observation.sequentialRectCalls})`,
        ).toBeLessThanOrEqual(Math.ceil(observation.sequentialRectCalls * 0.05));
      }
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("seeded grapheme suffixes are identical to re-segmenting from scratch", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/tests/e2e/fixtures/line-ends-oracle.html");

  try {
    const observations = await page.evaluate(async (strings) => {
      type Checkpoint = () => undefined;
      type Api = Readonly<{
        graphemeEnds(text: Text, checkpoint: Checkpoint): Promise<readonly number[]>;
        seedGraphemeSuffix(
          remainder: Text,
          sourceData: string,
          sourceEnds: readonly number[],
          offset: number,
        ): void;
        isGraphemeBoundary(ends: readonly number[], offset: number): boolean;
      }>;
      const module = (await import("/packages/core/dist/page-document-generation.js")) as Readonly<{
        internalTextSplitTestApi: Api;
      }>;
      const api = module.internalTextSplitTestApi;
      const checkpoint: Checkpoint = () => undefined;
      const directEnds = (value: string): readonly number[] => {
        const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
        const ends: number[] = [];
        for (const segment of segmenter.segment(value)) {
          ends.push(segment.index + segment.segment.length);
        }
        return ends;
      };
      const equal = (left: readonly number[], right: readonly number[]): boolean =>
        left.length === right.length && left.every((value, index) => value === right[index]);

      const results = [];
      const globalIntl = globalThis as { Intl: typeof Intl };
      const NativeSegmenter = Intl.Segmenter;
      const ThrowingSegmenter = function ThrowingSegmenter(): never {
        throw new Error("Segmentation was expected to come from the seeded cache.");
      } as unknown as typeof Intl.Segmenter;
      for (const item of strings) {
        const source = document.createTextNode(item.text);
        const fullEnds = await api.graphemeEnds(source, checkpoint);
        const fullMatchesDirect = equal(fullEnds, directEnds(item.text));
        const boundaryMismatches: string[] = [];
        const nonBoundaryMismatches: string[] = [];
        let seededFromCache = 0;
        for (let offset = 1; offset < item.text.length; offset += 1) {
          const suffix = item.text.slice(offset);
          const expected = directEnds(suffix);
          const remainder = document.createTextNode(suffix);
          api.seedGraphemeSuffix(remainder, item.text, fullEnds, offset);
          if (api.isGraphemeBoundary(fullEnds, offset)) {
            // Prove the segmentation really came from the seeded cache: with
            // Intl.Segmenter disabled, only a cache hit can produce a result.
            globalIntl.Intl.Segmenter = ThrowingSegmenter;
            try {
              const seeded = await api.graphemeEnds(remainder, checkpoint);
              seededFromCache += 1;
              if (!equal(seeded, expected)) {
                boundaryMismatches.push(
                  `${item.id}@${offset}: seeded [${seeded.join(",")}] expected [${expected.join(",")}]`,
                );
              }
            } catch (error) {
              boundaryMismatches.push(`${item.id}@${offset}: ${String(error)}`);
            } finally {
              globalIntl.Intl.Segmenter = NativeSegmenter;
            }
          } else {
            const resegmented = await api.graphemeEnds(remainder, checkpoint);
            if (!equal(resegmented, expected)) {
              nonBoundaryMismatches.push(
                `${item.id}@${offset}: resegmented [${resegmented.join(",")}] expected [${expected.join(",")}]`,
              );
            }
          }
        }
        results.push({
          id: item.id,
          fullMatchesDirect,
          boundaryMismatches,
          seededFromCache,
          nonBoundaryMismatches,
        });
      }
      return results;
    }, SEGMENTATION_STRINGS);

    for (const observation of observations as readonly SegmentationObservation[]) {
      expect(observation.fullMatchesDirect, `${observation.id}: full segmentation`).toBe(true);
      expect(observation.boundaryMismatches, `${observation.id}: seeded suffixes`).toEqual([]);
      expect(observation.nonBoundaryMismatches, `${observation.id}: mid-cluster splits`).toEqual(
        [],
      );
      expect(observation.seededFromCache, `${observation.id}: cache engaged`).toBeGreaterThan(0);
    }
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
