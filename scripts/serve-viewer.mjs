import { createReadStream, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const realRoot = realpathSync(root);
const port = Number(process.env.PORT ?? 4178);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
]);

function resolveRequest(requestUrl) {
  try {
    const url = new URL(requestUrl, `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    const requested = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const file = path.resolve(root, `.${requested}`);
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) return undefined;
    return file;
  } catch {
    return null;
  }
}

function isWithinRoot(file) {
  const realFile = realpathSync(file);
  return realFile !== realRoot && realFile.startsWith(`${realRoot}${path.sep}`);
}

const server = createServer((request, response) => {
  if (request.url === undefined) {
    response.writeHead(400).end("Bad request");
    return;
  }
  const requestUrl = new URL(request.url, `http://127.0.0.1:${port}`);
  if (requestUrl.pathname === "/") {
    response.writeHead(302, { Location: `/site/${requestUrl.search}` }).end();
    return;
  }
  if (requestUrl.pathname === "/favicon.ico") {
    response.writeHead(204).end();
    return;
  }
  const resolved = resolveRequest(request.url);
  if (resolved === null) {
    response.writeHead(400).end("Bad request");
    return;
  }
  if (resolved === undefined) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    if (!isWithinRoot(resolved)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const stats = statSync(resolved);
    if (!stats.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(resolved)) ?? "application/octet-stream",
      "Content-Length": stats.size,
      "Cache-Control": "no-store",
    });
    createReadStream(resolved).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Imposia Viewer server listening on http://127.0.0.1:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
