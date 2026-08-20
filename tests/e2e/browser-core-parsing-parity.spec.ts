import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-core-support.js";

// Pins HTML parser error-recovery parity across Chromium, Firefox, and WebKit.
// prepareDocument now parses with the engine's native parser (ADR 0013); every
// engine must recover malformed markup to the same document and serialize it
// identically, otherwise prepared output would diverge per browser. The
// expected strings are the WHATWG parsing/serialization results, not any
// single engine's oracle.

type PreparedView = Readonly<{
  html: string;
  headerTemplate: string | null;
  warnings: readonly Readonly<{ code: string; sourceIndex: number | undefined }>[];
}>;

const FIXTURES: Record<string, string> = {
  fosterParenting: "<table><div>foster</div><tr><td>cell</td></tr></table>",
  misnestedFormatting: "<b>bold<i>both</b>italic</i>",
  unclosedElements: "<p>one<p>two<ul><li>a<li>b",
  entities: "<p>&nbsp;&amp;&lt;café&copy;</p>",
  attributeEscaping: `<p title='a"b<c>'>x</p>`,
  templateFragmentContext:
    "<template data-page-header><tr><td>H</td></tr></template><main>body</main>",
  sanitizedRecovery:
    '<style>h1 { break-before: column; }</style><img src="https://blocked.example/x.png" onclick="evil()"><p>tail</p>',
};

const EXPECTED: Record<string, PreparedView> = {
  fosterParenting: {
    html: "<!DOCTYPE html><html><head></head><body><div>foster</div><table><tbody><tr><td>cell</td></tr></tbody></table></body></html>",
    headerTemplate: null,
    warnings: [],
  },
  misnestedFormatting: {
    html: "<!DOCTYPE html><html><head></head><body><b>bold<i>both</i></b><i>italic</i></body></html>",
    headerTemplate: null,
    warnings: [],
  },
  unclosedElements: {
    html: "<!DOCTYPE html><html><head></head><body><p>one</p><p>two</p><ul><li>a</li><li>b</li></ul></body></html>",
    headerTemplate: null,
    warnings: [],
  },
  entities: {
    html: "<!DOCTYPE html><html><head></head><body><p>&nbsp;&amp;&lt;café©</p></body></html>",
    headerTemplate: null,
    warnings: [],
  },
  attributeEscaping: {
    html: '<!DOCTYPE html><html><head></head><body><p title="a&quot;b&lt;c&gt;">x</p></body></html>',
    headerTemplate: null,
    warnings: [],
  },
  templateFragmentContext: {
    html: "<!DOCTYPE html><html><head></head><body><main>body</main></body></html>",
    headerTemplate: "<tr><td>H</td></tr>",
    warnings: [],
  },
  sanitizedRecovery: {
    html: "<!DOCTYPE html><html><head><style>h1 { }</style></head><body><img><p>tail</p></body></html>",
    headerTemplate: null,
    warnings: [
      { code: "UNSUPPORTED_BREAK_VALUE", sourceIndex: 0 },
      { code: "RESOURCE_BLOCKED", sourceIndex: 0 },
      { code: "SCRIPT_REMOVED", sourceIndex: 1 },
    ],
  },
};

test("prepares error-recovered markup identically in every engine", async ({
  page,
  browserName,
}) => {
  const { errors, pageErrors } = captureBrowserErrors(page, browserName);
  await page.goto("/examples/book.html");

  try {
    const observation = await page.evaluate(async (fixtures) => {
      const core = (await import("/packages/core/dist/index.js")) as {
        prepareDocument(html: string): {
          html: string;
          headerTemplate?: string;
          warnings: readonly { code: string; sourceIndex?: number }[];
        };
      };
      const results: Record<string, unknown> = {};
      for (const [name, html] of Object.entries(fixtures)) {
        const prepared = core.prepareDocument(html);
        results[name] = {
          html: prepared.html,
          headerTemplate: prepared.headerTemplate ?? null,
          warnings: prepared.warnings.map((warning) => ({
            code: warning.code,
            sourceIndex: warning.sourceIndex,
          })),
        };
      }
      return results;
    }, FIXTURES);

    expect(observation).toEqual(EXPECTED);
  } finally {
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});
