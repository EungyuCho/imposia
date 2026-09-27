import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

for (const forceConvergencePasses of [false, true]) {
  test(`publishing references stay current through shrink, growth and missing-target recovery (verification=${forceConvergencePasses})`, async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "Structural pagination is Chromium-reference only.");
    const { errors, pageErrors } = captureBrowserErrors(page, browserName);
    await page.goto("/examples/book.html");
    const observed = await page.evaluate(async (forceConvergencePasses) => {
      const path = "/packages/core/dist/index.js";
      const core = (await import(path)) as typeof import("../../packages/core/src/index.js");
      const host = document.createElement("div");
      document.body.replaceChildren(host);
      const source = (count: number, title: string, missing = false) => ({
        html: `<style>
      @page {size:320px 440px;margin:20px;@top-center {content:string(chapter)} @bottom-center {content:counter(page) "/" counter(pages)}}
      body {margin:0;font:12px/20px monospace} p,h2 {margin:0;font:inherit} p {height:40px;widows:1;orphans:1}
      h2 {string-set:chapter content()} #destination {break-before:page}
      a.page::after {content:target-counter(attr(href),page)} a.title::after {content:target-text(attr(href),content)}
      </style><h2>Opening ${title}</h2><p><a class="page" href="#destination">Page </a><a class="title" href="#destination">Title </a></p>${Array.from({ length: count }, (_, i) => `<p>K${String(i).padStart(4, "0")}</p>`).join("")}<h2 ${missing ? "" : 'id="destination"'}>${title}</h2>`,
      });
      const controller = core.mountPageDocument(host, source(82, "North"), {
        experimental: { forceConvergencePasses },
      });
      try {
        const first = await controller.ready;
        const iframe = first.iframe;
        const snapshot = (ready: typeof first) => {
          const doc = ready.iframe.contentDocument;
          if (!doc) throw new Error("Missing frame");
          const sheets = [...doc.querySelectorAll<HTMLElement>("[data-imposia-page]")];
          const target = doc.querySelector("#destination");
          return {
            generation: ready.generation,
            sameFrame: ready.iframe === iframe,
            pageCount: ready.pageCount,
            metadataNumbers: ready.pages.map((p) => p.number),
            domNumbers: sheets.map((p) => Number(p.dataset.imposiaPageNumber)),
            tokens: sheets.flatMap(
              (p) =>
                p.querySelector("[data-imposia-page-flow]")?.textContent?.match(/K\d{4}/g) ?? [],
            ),
            targetPage: target
              ? Number(
                  target.closest<HTMLElement>("[data-imposia-page]")?.dataset.imposiaPageNumber,
                )
              : null,
            targetText: target?.textContent ?? null,
            pageMarkers: [...doc.querySelectorAll('[data-imposia-generated="target-counter"]')].map(
              (n) => n.textContent,
            ),
            textMarkers: [...doc.querySelectorAll('[data-imposia-generated="target-text"]')].map(
              (n) => n.textContent,
            ),
            headers: sheets.map(
              (p) => p.querySelector('[data-imposia-margin-box="top-center"]')?.textContent,
            ),
            footers: sheets.map(
              (p) => p.querySelector('[data-imposia-margin-box="bottom-center"]')?.textContent,
            ),
            warnings: ready.warnings.map((w) => ({
              code: w.code,
              generation: w.location.generation,
            })),
          };
        };
        const snapshots = [snapshot(first)];
        for (const [count, title, missing] of [
          [1, "South", false],
          [92, "West", false],
          [1, "Gone", true],
          [82, "North", false],
        ] as const)
          snapshots.push(snapshot(await controller.update(source(count, title, missing))));
        return snapshots;
      } finally {
        await controller.destroy();
        host.remove();
      }
    }, forceConvergencePasses);
    await testInfo.attach("publishing-transitions", {
      body: JSON.stringify(observed, null, 2),
      contentType: "application/json",
    });
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(observed.map((s) => s.generation)).toEqual([1, 2, 3, 4, 5]);
    expect(observed[0]?.pageCount).toBeGreaterThanOrEqual(10);
    expect(observed[1]?.pageCount).toBeLessThan(observed[0]?.pageCount ?? 0);
    expect(observed[2]?.pageCount).toBeGreaterThan(observed[1]?.pageCount ?? 0);
    observed.forEach((s, i) => {
      expect(s.sameFrame).toBe(true);
      expect(s.metadataNumbers).toEqual(Array.from({ length: s.pageCount }, (_, i) => i + 1));
      expect(s.domNumbers).toEqual(s.metadataNumbers);
      expect(s.tokens).toEqual(
        Array.from(
          { length: [82, 1, 92, 1, 82][i] ?? 0 },
          (_, n) => `K${String(n).padStart(4, "0")}`,
        ),
      );
      expect(s.footers).toEqual(
        Array.from({ length: s.pageCount }, (_, i) => `${i + 1}/${s.pageCount}`),
      );
      if (i === 3) {
        expect(s.targetPage).toBeNull();
        expect(s.pageMarkers).toEqual([""]);
        expect(s.textMarkers).toEqual([""]);
        expect(s.warnings.map((w) => w.code)).toContain("REFERENCE_MISSING");
        for (const w of s.warnings) expect(w.generation).toBe(s.generation);
      } else {
        expect(s.pageMarkers).toEqual([String(s.targetPage)]);
        expect(s.textMarkers).toEqual([s.targetText]);
        expect(s.targetPage).toBe(s.pageCount);
        expect(s.headers).toEqual(
          Array.from({ length: s.pageCount }, (_, n) =>
            n === s.pageCount - 1 ? s.targetText : `Opening ${s.targetText}`,
          ),
        );
        expect(s.warnings).toEqual([]);
      }
    });
    expect({ ...observed[4], generation: 1 }).toEqual(observed[0]);
  });
}
