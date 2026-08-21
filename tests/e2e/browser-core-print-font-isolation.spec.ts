import { expect, test } from "@playwright/test";

test("hoisted print @font-face families are namespaced away from the host document", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "One engine suffices for the CSSOM rewrite probe.");

  await page.goto("/examples/book.html");
  const probe = await page.evaluate(async () => {
    const print = (await import("/packages/core/dist/page-document-print.js")) as {
      commitPrintRoot(
        topDocument: Document,
        sourceDocument: Document,
      ): Readonly<{ root: HTMLElement; shadow: ShadowRoot; isolationStyle: HTMLStyleElement }>;
    };

    // The host application declares the same family the composed document uses. Without
    // namespacing, host faces could satisfy weights the composed document never loaded.
    const hostFace = document.createElement("style");
    hostFace.textContent =
      '@font-face{font-family:"Shared Face";font-weight:900;src:url("/host-heavy.woff2")}';
    document.head.append(hostFace);

    const sourceFrame = document.createElement("iframe");
    document.body.append(sourceFrame);
    const sourceDocument = sourceFrame.contentDocument;
    if (sourceDocument === null) throw new Error("Missing source frame document.");
    sourceDocument.open();
    // The inline usage spells the family in a different case on purpose: CSS matches
    // font-family case-insensitively, so the rewrite must too.
    sourceDocument.write(
      '<!doctype html><html><head><style>@font-face{font-family:"Shared Face";src:url("/shared.woff2")}p{font-family:"Shared Face",serif}</style></head><body><p style="font-family:\'shared face\'">composed</p></body></html>',
    );
    sourceDocument.close();

    const { root, shadow, isolationStyle } = print.commitPrintRoot(document, sourceDocument);
    try {
      const hoistedCss = isolationStyle.textContent ?? "";
      const fontFaceFamilies = [
        ...hoistedCss.matchAll(/@font-face\s*\{[^}]*?font-family\s*:\s*("[^"]+"|[^;}]+)/g),
      ].map((match) => match[1] ?? "");
      const paragraph = shadow.querySelector("p");
      const computedFamily = paragraph === null ? "" : getComputedStyle(paragraph).fontFamily;
      return {
        hoistedContainsHostHeavy: hoistedCss.includes("host-heavy"),
        fontFaceFamilies,
        computedFamily,
      };
    } finally {
      root.remove();
      isolationStyle.remove();
      sourceFrame.remove();
      hostFace.remove();
    }
  });

  // Only the composed document's face is hoisted, and it carries the namespace.
  expect(probe.hoistedContainsHostHeavy).toBe(false);
  expect(probe.fontFaceFamilies.length).toBeGreaterThan(0);
  for (const family of probe.fontFaceFamilies) {
    expect(family).toMatch(/imposia-print-\d+--Shared Face/);
  }
  // The cloned content resolves to the namespaced family, not the host's.
  expect(probe.computedFamily).toMatch(/imposia-print-\d+--Shared Face/);
});
