import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { AssetResolver } from "./browser-core-assets-support.js";
import { assertNoBrowserErrors, openAssetPage } from "./browser-core-assets-support.js";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
type Scenario = "initial" | "preserve" | "timeout" | "replace";
type FatalMode = "reject" | "malformed";
type ProbeInput = { scenario: Scenario; pngBase64: string };
type Failure = { status: "rejected"; error: { name: string; code: string; message: string } };
type Probe = { sandbox: string | null; created: string[]; revoked: string[]; data: unknown[] };
type Source = { html: string; baseUrl?: string };
type Doc = { iframe: HTMLIFrameElement; generation: number; warnings: { code: string }[] };
type Controller = { ready: Promise<Doc>; current?: Doc } & {
  update(s: Source): Promise<Doc>;
  destroy(): Promise<void>;
};
type Options = { assetResolver?: AssetResolver; limits?: { resourceDeadlineMs?: number } };
type Core = { mountPageDocument(...args: [HTMLElement, Source, Options]): Controller };

function assertUrlLedger(observation: Probe): void {
  const c = observation.created,
    r = observation.revoked;
  expect(new Set([...c, ...r]).size).toBe(c.length);
  expect(c.length).toBe(r.length);
}

function expectFatal(value: Failure, c: string): void {
  const message =
    c === "RESOURCE_TIMEOUT" ? "Resource loading timed out." : "Asset resolution failed.";
  expect(value).toEqual({ status: "rejected", error: { name: "ImposiaError", code: c, message } });
}

async function assetLifecycleProbe(input: ProbeInput): Promise<Probe> {
  const core = (await import("/packages/core/dist/index.js")) as Core;
  const mountPageDocument = core.mountPageDocument.bind(core);
  const png = Uint8Array.from(atob(input.pngBase64), (character) => character.charCodeAt(0));
  const baseUrl = "https://assets.example.test/book/";
  const host = document.body.appendChild(document.createElement("div"));
  const created: string[] = [],
    revoked: string[] = [];
  const create0 = URL.createObjectURL,
    revoke0 = URL.revokeObjectURL;
  let controller: Controller | undefined, onCreate: (() => void) | undefined;
  const good = { status: "resolved" as const, bytes: png, mimeType: "image/png" };
  const shapeError = (error: unknown): Failure["error"] => {
    const value = error instanceof Error ? error : new Error("unknown"),
      code = "code" in value && typeof value.code === "string" ? value.code : "";
    return { name: value.name, code, message: value.message };
  };
  const failure = (work: Promise<unknown>): Promise<Failure> =>
    work.then(
      () => Promise.reject(new Error("Expected operation to reject.")),
      (error: unknown) => ({ status: "rejected" as const, error: shapeError(error) }),
    );
  const malformed = () => {
    const value = { ...good };
    Reflect.deleteProperty(value, "bytes");
    return value;
  };
  const fatalResolver = (fail: string, mode: FatalMode, log: string[] = []): AssetResolver => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const outcome =
      mode === "reject" ? () => Promise.reject(new Error("host-private-secret")) : malformed;
    return async ({ url, signal }) => {
      signal.addEventListener("abort", () => log.push(url));
      if (url === "candidate.png") {
        onCreate = release;
        return good;
      }
      if (url === "old.png") return good;
      if (url === fail) return gate.then(outcome);
      return new Promise((r) =>
        signal.addEventListener("abort", () => r({ status: "blocked" as const })),
      );
    };
  };
  URL.createObjectURL = (blob) => {
    const url = create0(blob);
    created.push(url);
    onCreate?.();
    return url;
  };
  URL.revokeObjectURL = (url) => {
    revoked.push(url);
    revoke0(url);
  };
  const finish = (sandbox: string | null, data: unknown[]): Probe =>
    Object.assign({ sandbox, data }, { created: [...created], revoked: [...revoked] });
  const mount = (html: string, r: AssetResolver, l?: Options["limits"]) => {
    const options = { assetResolver: r, limits: l };
    const current = mountPageDocument(host, { html, baseUrl }, options);
    controller = current;
    return current;
  };
  const frame = (doc?: Doc) => doc?.iframe.contentDocument?.documentElement.outerHTML ?? "";
  const destroy = async () => {
    await controller?.destroy();
    controller = undefined;
  };
  try {
    if (input.scenario === "initial") {
      const run = async (kind: "reject" | "malformed") => {
        const aborted: string[] = [],
          failed = kind === "reject" ? "reject.png" : "malformed.png",
          sibling = `sibling-${kind}.png`;
        const resolver = fatalResolver(failed, kind, aborted),
          createdAt = created.length,
          revokedAt = revoked.length;
        const c = mount(`<img src=candidate.png><img src=${failed}><img src=${sibling}>`, resolver),
          result = await failure(c.ready),
          iframe = host.querySelector<HTMLIFrameElement>("iframe"),
          sandbox = iframe?.getAttribute("sandbox") ?? null,
          frameHtml = iframe?.contentDocument?.documentElement.outerHTML ?? "";
        const made = created.slice(createdAt),
          undone = revoked.slice(revokedAt);
        await destroy();
        return finish(sandbox, [result, aborted.includes(sibling), frameHtml, made, undone]);
      };
      const first = await run("reject");
      const second = await run("malformed");
      return finish(first.sandbox, [...first.data, ...second.data]);
    }
    if (input.scenario === "preserve") {
      const resolver = fatalResolver("fatal.png", "malformed");
      const c = mount('<p>old</p><img src="old.png">', resolver),
        initial = await c.ready,
        oldHtml = frame(initial),
        oldBlob = created[0] ?? "";
      const update = await failure(
        c.update({ html: "<p>new</p><img src=candidate.png><img src=fatal.png>", baseUrl }),
      );
      const current = c.current,
        before = [...revoked],
        sameFrame = oldHtml === frame(current);
      await destroy();
      const u = update,
        i = current?.iframe === initial.iframe,
        s = sameFrame,
        g = current?.generation ?? 0,
        n = !(current?.warnings.some((warning) => warning.code === "RESOURCE_BLOCKED") ?? false),
        h = oldHtml,
        b = oldBlob,
        r = before,
        v = [...revoked];
      return finish(initial.iframe.getAttribute("sandbox"), [u, i, s, g, n, h, b, r, v]);
    }
    if (input.scenario === "timeout") {
      let lateResolve: ((resolution: typeof good) => void) | undefined;
      const late = { aborted: false, settled: false };
      const resolver: AssetResolver = async ({ url, signal }) => {
        if (url === "candidate.png") return good;
        signal.addEventListener("abort", () => {
          late.aborted = true;
        });
        return new Promise((resolve) => {
          lateResolve = (resolution) => {
            late.settled = true;
            resolve(resolution);
          };
        });
      };
      const c = mount("<img src=candidate.png><img src=late.png>", resolver, {
        resourceDeadlineMs: 40,
      });
      const timeout = await failure(c.ready),
        iframe = host.querySelector<HTMLIFrameElement>("iframe");
      lateResolve?.(good);
      await Promise.resolve();
      const after = [...created];
      const d1 = c.destroy(),
        d2 = c.destroy();
      await Promise.all([d1, d2]);
      controller = undefined;
      const t = timeout,
        l = { aborted: late.aborted, settled: late.settled },
        a = after,
        d = d1 === d2;
      return finish(iframe?.getAttribute("sandbox") ?? null, [t, l, a, d]);
    }
    const snapshots: { url: string; generation: number; frameText: string }[] = [];
    const snap = (url: string, doc?: Doc) => ({
      url,
      generation: doc?.generation ?? 0,
      frameText: doc?.iframe.contentDocument?.body.textContent ?? "",
    });
    URL.revokeObjectURL = (url) => {
      snapshots.push(snap(url, controller?.current));
      revoked.push(url);
      revoke0(url);
    };
    const resolver: AssetResolver = async () => good;
    const c = mount('<p>old</p><img src="old.png">', resolver),
      initial = await c.ready,
      oldRevokedBeforeUpdate = [...revoked];
    const replacement = await c.update({ html: '<p>new</p><img src="new.png">', baseUrl });
    const d1 = c.destroy(),
      d2 = c.destroy();
    await Promise.all([d1, d2]);
    controller = undefined;
    const g1 = initial.generation,
      g2 = replacement.generation,
      r = oldRevokedBeforeUpdate,
      s = snapshots,
      d = d1 === d2;
    return finish(initial.iframe.getAttribute("sandbox"), [g1, g2, r, s, d]);
  } finally {
    await destroy();
    URL.createObjectURL = create0;
    URL.revokeObjectURL = revoke0;
    host.remove();
  }
}

async function runProbe(page: Page, browserName: string, scenario: Scenario): Promise<Probe> {
  const capture = await openAssetPage(page, browserName);
  try {
    const args = { scenario, pngBase64: PNG };
    const observation = (await page.evaluate(assetLifecycleProbe, args)) as Probe;
    expect(capture.authoredHostRequests).toEqual([]);
    return observation;
  } finally {
    assertNoBrowserErrors(capture.errors, capture.pageErrors);
  }
}

function lifecycleTest(name: string, scenario: Scenario, check: (o: Probe) => void): void {
  test(name, async ({ page, browserName }) => {
    const o = await runProbe(page, browserName, scenario);
    expect(o.sandbox).toBe("allow-same-origin allow-modals");
    assertUrlLedger(o);
    check(o);
  });
}

lifecycleTest("initial asset errors are fatal and clean candidates", "initial", (o) => {
  for (const i of [0, 5]) expectFatal(o.data[i] as Failure, "RESOURCE_RESOLUTION_FAILED");
  for (const i of [1, 6]) expect(o.data[i]).toBe(true);
  for (const i of [2, 7])
    expect(o.data[i]).not.toMatch(/assets\.example\.test|host-private-secret/);
  expect(o.data[3]).toEqual(o.data[4]);
  expect(o.data[8]).toEqual(o.data[9]);
});

lifecycleTest("failed replacement preserves the old generation", "preserve", (o) => {
  expectFatal(o.data[0] as Failure, "RESOURCE_RESOLUTION_FAILED");
  expect(o.data.slice(1, 5)).toEqual([true, true, 1, true]);
  expect(o.data[2]).toBe(true);
  expect(o.data[5]).toContain(o.data[6]);
  expect(o.data[7]).not.toContain(o.data[6]);
  expect(o.data[8]).toContain(o.data[6]);
});

lifecycleTest("late resolver times out, aborts, and settles idempotently", "timeout", (o) => {
  expectFatal(o.data[0] as Failure, "RESOURCE_TIMEOUT");
  expect(o.data[1]).toEqual({ aborted: true, settled: true });
  expect(o.data[2]).toHaveLength(1);
  expect(o.data[3]).toBe(true);
});

lifecycleTest("replacement commits before revoke and destroy is idempotent", "replace", (o) => {
  expect(o.data.slice(0, 3)).toEqual([1, 2, []]);
  const oldUrl = o.created[0];
  const newUrl = o.created[1];
  expect(o.data[3]).toEqual([
    { url: oldUrl, generation: 2, frameText: expect.stringContaining("new") },
    { url: newUrl, generation: 2, frameText: expect.stringContaining("new") },
  ]);
  expect(o.data[4]).toBe(true);
});
