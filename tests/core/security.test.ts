import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertFileWithinRoot,
  prepareDocument,
  validateRenderInput,
  withTimeout,
} from "../../packages/core/src/document.js";
import { ImposiaError } from "../../packages/core/src/errors.js";

describe("untrusted HTML and input boundaries", () => {
  it("rejects ambiguous, empty, and oversized render inputs", () => {
    expect(() => validateRenderInput({ html: "", url: "https://example.test" })).toThrowError(
      new ImposiaError(
        "INVALID_INPUT",
        "Render input must contain exactly one of html, file, or url.",
      ),
    );
    expect(() => validateRenderInput({ html: "" })).toThrowError(
      new ImposiaError("INVALID_INPUT", "HTML input must not be empty."),
    );
    expect(() => validateRenderInput({ html: "한글" }, 5)).toThrowError(
      new ImposiaError("INPUT_TOO_LARGE", "HTML input exceeds the 5-byte limit."),
    );
    expect(
      validateRenderInput({ html: '<img src="cover.png">', baseUrl: "file:///book/" }),
    ).toEqual({ html: '<img src="cover.png">', baseUrl: "file:///book/" });
  });

  it("removes scripts, inline event handlers, and javascript URLs deterministically", () => {
    const source = `
      <button onclick="steal()">Safe label</button>
      <script>alert(1)</script><script src="https://evil.test/x.js"></script>
      <meta http-equiv="refresh" content="0;url=https://evil.test/document">
      <a href="javascript:steal()">bad link</a>
      <img src="javascript:steal()" onerror="steal()">
    `;

    const first = prepareDocument(source);
    const second = prepareDocument(source);

    expect(first).toEqual(second);
    expect(first.html).not.toMatch(/<script|http-equiv="refresh"|onclick|onerror|javascript:/i);
    expect(first.html).toContain("Safe label");
    expect(first.warnings).toEqual([
      {
        code: "SCRIPT_REMOVED",
        severity: "warning",
        message: "Executable content was removed.",
        feature: "security",
        sourceIndex: 0,
      },
      {
        code: "RESOURCE_BLOCKED",
        severity: "warning",
        message: "Resource was blocked by the loading policy.",
        feature: "resource-policy",
        value: "javascript:steal()",
        sourceIndex: 1,
      },
    ]);
  });

  it("blocks remote subresources by default and allows them only when opted in", () => {
    const html = `
      <link rel="stylesheet" href="https://cdn.example.test/book.css">
      <img src="https://cdn.example.test/cover.png">
    `;
    const blocked = prepareDocument(html);
    const allowed = prepareDocument(html, { allowRemoteResources: true });

    expect(blocked.html).not.toContain("https://cdn.example.test");
    expect(blocked.warnings).toEqual([
      {
        code: "RESOURCE_BLOCKED",
        severity: "warning",
        message: "Resource was blocked by the loading policy.",
        feature: "resource-policy",
        value: "https://cdn.example.test/book.css",
        sourceIndex: 0,
      },
      {
        code: "RESOURCE_BLOCKED",
        severity: "warning",
        message: "Resource was blocked by the loading policy.",
        feature: "resource-policy",
        value: "https://cdn.example.test/cover.png",
        sourceIndex: 1,
      },
    ]);
    expect(allowed.html).toContain("https://cdn.example.test/book.css");
    expect(allowed.html).toContain("https://cdn.example.test/cover.png");
    expect(allowed.warnings).toEqual([]);
  });

  it("normalizes malformed HTML without executing or dropping readable content", () => {
    const prepared = prepareDocument("<main><h1>Title</h1><p>Paragraph</p><script>bad()</script>");

    expect(prepared.html).toContain("<!DOCTYPE html>");
    expect(prepared.html).toContain("<h1>Title</h1><p>Paragraph</p>");
    expect(prepared.html).not.toContain("bad()");
  });

  it("sanitizes embedded and API decorations through the same resource policy", () => {
    const prepared = prepareDocument(
      `
        <template data-page-header><script>evil()</script><img src="https://evil.test/a" onerror="evil()"></template>
        <template data-page-footer><a href="javascript:evil()">Footer</a></template>
      `,
      {
        footerTemplate:
          '<iframe src="https://evil.test/frame"></iframe><img src="data:text/html,evil" onload="evil()">',
      },
    );

    expect(prepared.headerTemplate).not.toMatch(/script|onerror|evil\.test/i);
    expect(prepared.footerTemplate).not.toMatch(/iframe|onload|data:text\/html/i);
    expect(prepared.warnings.map((warning) => warning.code)).toEqual([
      "SCRIPT_REMOVED",
      "RESOURCE_BLOCKED",
      "OVERRIDDEN_EMBEDDED_FOOTER",
      "RESOURCE_BLOCKED",
    ]);
  });

  it("enforces an explicit canonical file root against lexical and symlink escapes", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "imposia-root-"));
    const root = path.join(temporary, "root");
    const outside = path.join(temporary, "outside");
    await mkdir(path.join(root, "chapters"), { recursive: true });
    await mkdir(outside);
    const insideFile = path.join(root, "chapters", "one.html");
    const outsideFile = path.join(outside, "secret.html");
    const escapeLink = path.join(root, "escape.html");
    await writeFile(insideFile, "inside");
    await writeFile(outsideFile, "outside");
    await symlink(outsideFile, escapeLink);

    try {
      expect(await assertFileWithinRoot(insideFile, root)).toBe(await realpath(insideFile));
      await expect(
        assertFileWithinRoot(path.join(temporary, "root-escape", "one.html"), root),
      ).rejects.toMatchObject({ code: "FILE_OUTSIDE_ROOT" });
      await expect(assertFileWithinRoot(escapeLink, root)).rejects.toEqual(
        new ImposiaError(
          "FILE_OUTSIDE_ROOT",
          "File input is outside the configured allowFileRoot.",
        ),
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("turns readiness deadlines into stable timeout errors", async () => {
    await expect(withTimeout(new Promise(() => undefined), 5, "resources")).rejects.toEqual(
      new ImposiaError("RESOURCE_TIMEOUT", "Resource loading timed out."),
    );
    await expect(withTimeout(new Promise(() => undefined), 5, "fonts")).rejects.toEqual(
      new ImposiaError("FONT_TIMEOUT", "Font readiness timed out."),
    );
  });
});
