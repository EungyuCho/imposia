import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

// Equivalence oracle for the publishing convergence fast path: the same document is
// composed with the fixed-point short circuit enabled (default) and disabled
// (experimental.forceConvergencePasses), and every observable output — page markup,
// blank/name metadata, body text, warnings, and exported EPUB bytes — must match.

test("keeps the convergence short circuit structurally equivalent to forced verification passes", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium is the structural pagination reference.");
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async () => {
      type PageComposeProgress = Readonly<{ pass: number }>;
      type PageWarningView = Readonly<{ code: string; message: string }>;
      type PageDocument = Readonly<{
        readonly iframe: HTMLIFrameElement;
        readonly pages: readonly Readonly<{
          readonly blank: boolean;
          readonly bodyText: unknown;
          readonly name?: string;
        }>[];
        readonly warnings: readonly PageWarningView[];
        exportEpub(options: Readonly<{ metadata: Record<string, string> }>): Promise<Blob>;
      }>;
      type Controller = Readonly<{
        readonly ready: Promise<PageDocument>;
        destroy(): Promise<void>;
      }>;
      type Core = Readonly<{
        mountPageDocument(
          host: HTMLElement,
          source: Readonly<{ html: string }>,
          options?: Record<string, unknown>,
        ): Controller;
      }>;

      const core = (await import("/packages/core/dist/index.js")) as Core;
      const source = {
        html: `
          <style>
            @page {
              size: 360px 480px;
              margin: 44px;
              @top-left { content: string(chapter, first); }
              @bottom-center { content: counter(page) " / " counter(pages); }
            }
            body { margin: 0; font: 13px/1.5 Arial, sans-serif; }
            h2 { string-set: chapter content(); break-before: page; margin: 0 0 10px; }
            p { margin: 0 0 9px; }
            a.page-reference::after { content: " (p. " target-counter(attr(href), page) ")"; }
            a.title-reference::after { content: " — " target-text(attr(href)); }
          </style>
          <article>
            <h2 id="chapter-one">Chapter One</h2>
            <p>
              Forward references:
              <a class="page-reference" href="#chapter-three">Chapter Three</a>
              and <a class="title-reference" href="#chapter-three">see</a>.
            </p>
            <p><span data-footnote-anchor="alpha">Anchored claim.</span></p>
            <aside data-footnote="alpha" style="float: footnote;">Footnote body alpha.</aside>
            <p id="duplicate-id">First duplicate id occurrence.</p>
            ${Array.from(
              { length: 30 },
              (_, index) => `<p>Chapter one filler paragraph ${index + 1}.</p>`,
            ).join("")}
            <h2 id="chapter-two">Chapter Two</h2>
            <p id="duplicate-id">Second duplicate id occurrence.</p>
            ${Array.from(
              { length: 30 },
              (_, index) => `<p>Chapter two filler paragraph ${index + 1}.</p>`,
            ).join("")}
            <h2 id="chapter-three">Chapter Three</h2>
            <p>
              Backward references:
              <a class="page-reference" href="#chapter-one">Chapter One</a>
              and <a class="page-reference" href="#duplicate-id">the duplicate</a>.
            </p>
            ${Array.from(
              { length: 12 },
              (_, index) => `<p>Chapter three filler paragraph ${index + 1}.</p>`,
            ).join("")}
          </article>
        `,
      };

      const render = async (experimental: Record<string, unknown>) => {
        const host = document.body.appendChild(document.createElement("div"));
        let maxPass = 0;
        const controller = core.mountPageDocument(host, source, {
          experimental,
          onProgress: (progress: PageComposeProgress) => {
            if (progress.pass > maxPass) maxPass = progress.pass;
          },
        });
        try {
          const ready = await controller.ready;
          const frameDocument = ready.iframe.contentDocument;
          if (frameDocument === null) throw new Error("Missing canonical frame document.");
          const elements = [...frameDocument.querySelectorAll<HTMLElement>("[data-imposia-page]")];
          const epub = await ready.exportEpub({
            metadata: {
              title: "Convergence Equivalence",
              language: "en",
              identifier: "urn:imposia:convergence-equivalence",
              modified: "2026-01-01T00:00:00Z",
            },
          });
          const epubBytes = new Uint8Array(await epub.arrayBuffer());
          const digest = await crypto.subtle.digest("SHA-256", epubBytes);
          return {
            pages: ready.pages.map((pageResult, index) => ({
              blank: pageResult.blank,
              bodyText: pageResult.bodyText,
              ...(pageResult.name === undefined ? {} : { name: pageResult.name }),
              html: elements[index]?.innerHTML ?? "",
            })),
            warnings: ready.warnings.map((warning) => ({
              code: warning.code,
              message: warning.message,
            })),
            epubByteLength: epubBytes.byteLength,
            epubDigest: [...new Uint8Array(digest)]
              .map((byte) => byte.toString(16).padStart(2, "0"))
              .join(""),
            maxPass,
          };
        } finally {
          await controller.destroy();
          host.remove();
        }
      };

      const shortCircuit = await render({ footnotes: true });
      const forced = await render({ footnotes: true, forceConvergencePasses: true });
      return { shortCircuit, forced };
    });

    const { shortCircuit, forced } = observation;
    expect(shortCircuit.pages.length).toBeGreaterThan(3);
    expect(shortCircuit.pages).toEqual(forced.pages);
    expect(shortCircuit.warnings).toEqual(forced.warnings);
    expect(shortCircuit.warnings.map((warning) => warning.code)).toContain("REFERENCE_DUPLICATE");
    expect(shortCircuit.epubByteLength).toEqual(forced.epubByteLength);
    expect(shortCircuit.epubDigest).toEqual(forced.epubDigest);
    // The forced run needs at least one extra verification pass; the fast path
    // accepted the fixed point without it.
    expect(forced.maxPass).toBeGreaterThanOrEqual(2);
    expect(shortCircuit.maxPass).toBeLessThan(forced.maxPass);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
