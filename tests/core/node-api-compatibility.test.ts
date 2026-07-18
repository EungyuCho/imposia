import { describe, expect, it } from "vitest";
import { ImposiaError } from "../../packages/node/src/index.js";
import {
  validateRenderInput,
  validateRenderOptions,
} from "../../packages/node/src/input-boundary.js";

describe("Node API compatibility boundaries", () => {
  it("keeps one well-formed source boundary for all engines", () => {
    expect(() => validateRenderInput({ html: "<p>One</p>", file: 1 })).toThrow(
      new ImposiaError(
        "INVALID_INPUT",
        "Render input must contain exactly one of html, file, or url.",
      ),
    );
    expect(() => validateRenderInput({ html: "<p>One</p>", baseUrl: "/relative" })).toThrow(
      new ImposiaError("INVALID_INPUT", "HTML baseUrl must be an absolute URL."),
    );
    expect(() => validateRenderInput({ url: "file:///book.html" })).toThrow(
      new ImposiaError("INVALID_INPUT", "URL input must use the HTTP or HTTPS protocol."),
    );
    expect(validateRenderInput({ url: "https://example.test/book.html" })).toEqual({
      url: "https://example.test/book.html",
    });
  });

  it("defaults to legacy and fails invalid engine-specific options before rendering", () => {
    expect(validateRenderOptions({})).toMatchObject({ engine: "legacy" });
    expect(() => validateRenderOptions({ engine: "experimental" })).toThrow(
      new ImposiaError("INVALID_ENGINE", 'engine must be either "legacy" or "core".'),
    );
    expect(() => validateRenderOptions({ core: { css: ["body{}"] } })).toThrow(
      new ImposiaError("ENGINE_OPTION_UNSUPPORTED", 'The core option requires engine: "core".'),
    );
    expect(() => validateRenderOptions({ engine: "core", core: { css: [1] } })).toThrow(
      new ImposiaError("INVALID_OPTIONS", "core.css must be an array of strings."),
    );
  });
});
