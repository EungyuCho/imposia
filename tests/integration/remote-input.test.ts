import { createServer, type Server } from "node:http";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { ImposiaError } from "../../packages/core/src/errors.js";
import { createRenderer } from "../../packages/core/src/renderer.js";

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Missing test port.");
  return address.port;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
}

async function textFrom(pdfBytes: Uint8Array): Promise<string> {
  const pdf = await getDocument({ data: pdfBytes.slice() }).promise;
  try {
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
  } finally {
    await pdf.destroy();
  }
}

describe("remote document input", () => {
  it("times out and aborts when a response body stalls after its headers", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.write("<h1>Partial");
    });
    const port = await listen(server);
    const renderer = createRenderer();
    try {
      await expect(
        renderer.render(
          { url: `http://127.0.0.1:${port}/stalled` },
          { allowRemoteResources: true, timeoutMs: 100 },
        ),
      ).rejects.toEqual(
        new ImposiaError("TIMEOUT", "Timed out waiting for URL input after 100ms."),
      );
    } finally {
      await renderer.close();
      await close(server);
    }
  });

  it("stops reading a remote body as soon as it exceeds the input limit", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<h1>${"x".repeat(128)}</h1>`);
    });
    const port = await listen(server);
    const renderer = createRenderer();
    try {
      await expect(
        renderer.render(
          { url: `http://127.0.0.1:${port}/large` },
          { allowRemoteResources: true, maxInputBytes: 32 },
        ),
      ).rejects.toEqual(
        new ImposiaError("INPUT_TOO_LARGE", "HTML input exceeds the 32-byte limit."),
      );
    } finally {
      await renderer.close();
      await close(server);
    }
  });

  it("removes refresh navigation before rendering an opted-in remote document", async () => {
    let redirectedRequests = 0;
    const server = createServer((_request, response) => {
      redirectedRequests += 1;
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<script>document.body.textContent='Compromised'</script>");
    });
    const port = await listen(server);
    const renderer = createRenderer();
    try {
      const result = await renderer.render(
        {
          html: `<meta http-equiv="refresh" content="0;url=http://127.0.0.1:${port}/redirected"><h1>Safe</h1>`,
        },
        { allowRemoteResources: true },
      );
      expect(redirectedRequests).toBe(0);
      expect(result.warnings.map((warning) => warning.code)).toEqual(["SCRIPT_REMOVED"]);
      const text = await textFrom(result.pdf);
      expect(text).toContain("Safe");
      expect(text).not.toContain("Compromised");
    } finally {
      await renderer.close();
      await close(server);
    }
  });
});
