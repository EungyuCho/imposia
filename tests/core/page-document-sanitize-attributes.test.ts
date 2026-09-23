// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { sanitizeFrameContent } from "../../packages/core/src/page-document-sanitize.js";

function sanitized(html: string): { readonly root: HTMLElement; readonly blocked: boolean } {
  const root = document.createElement("div");
  root.innerHTML = html;
  const blocked = sanitizeFrameContent(root, true, new Set(["blob:kept"]));
  return { root, blocked };
}

describe("attribute resource checks", () => {
  it("keeps prose attributes that mention CSS function names", () => {
    const { root, blocked } = sanitized(
      '<p title="Call local(x) first" aria-label="Figure image (left)">' +
        '<img alt="Sample image (left)" src="blob:kept"></p>',
    );
    expect(blocked).toBe(false);
    expect(root.querySelector("p")?.getAttribute("title")).toBe("Call local(x) first");
    expect(root.querySelector("p")?.getAttribute("aria-label")).toBe("Figure image (left)");
    expect(root.querySelector("img")?.getAttribute("alt")).toBe("Sample image (left)");
  });

  it("still blocks unsupported resource functions in style and SVG presentation attributes", () => {
    const { root, blocked } = sanitized(
      "<p style=\"background:image-set('https://assets.example.test/x.png' 1x)\">text</p>" +
        "<svg><rect mask=\"image-set('https://assets.example.test/x.png' 1x)\"></rect></svg>",
    );
    expect(blocked).toBe(true);
    expect(root.querySelector("p")?.hasAttribute("style")).toBe(false);
    expect(root.querySelector("rect")?.hasAttribute("mask")).toBe(false);
  });
});
