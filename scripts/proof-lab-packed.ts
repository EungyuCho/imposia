/**
 * Proof-lab packed-artifact lane (ASA-446).
 *
 * Rebuilds the public demo and React example bundles from the *packaged*
 * @imposia artifacts instead of workspace sources, then runs the lab's
 * browser specs against that build. This proves the lab exercises what a
 * consumer installs, not what the workspace aliases happen to resolve.
 *
 * Modes (decision recorded on ASA-446):
 * - default: pack the four workspace packages with `pnpm pack` and consume
 *   the tarballs. Network-free and verifiable at any commit — this is the
 *   lane the repository's own verification can always run.
 * - `--published[=<version>]`: install the four packages from the npm
 *   registry (default: the workspace version) and consume those. Stronger
 *   adopter evidence, but only exists for released versions and needs the
 *   network — run it as a post-publish smoke, not as the default gate.
 *
 * The lane fails if any bundle input resolves into `packages/` — a leaked
 * workspace alias — or if the consumed package versions do not match the
 * expectation for the mode.
 *
 * Usage:
 *   node --import tsx scripts/proof-lab-packed.ts [--published[=x.y.z]]
 *     [--keep] [--skip-build]
 *
 * `--keep` leaves the packed-built bundles in place (they are untracked,
 * ASA-448); by default the workspace bundles are restored afterwards.
 */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageNames = ["core", "viewer", "client", "react"] as const;

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const skipBuild = args.includes("--skip-build");
const publishedArg = args.find((arg) => arg === "--published" || arg.startsWith("--published="));
const unknown = args.filter(
  (arg) =>
    arg !== "--keep" &&
    arg !== "--skip-build" &&
    arg !== "--published" &&
    !arg.startsWith("--published="),
);
if (unknown.length > 0) {
  console.error(`Unknown arguments: ${unknown.join(" ")}`);
  process.exit(2);
}

async function workspaceVersion(name: (typeof packageNames)[number]): Promise<string> {
  const manifest = JSON.parse(
    await readFile(path.join(root, "packages", name, "package.json"), "utf8"),
  ) as { version: string };
  return manifest.version;
}

async function main(): Promise<void> {
  const stage = await mkdtemp(path.join(os.tmpdir(), "imposia-proof-lab-"));
  let failed = false;
  try {
    const expectedVersion = await workspaceVersion("core");
    let base: string;
    let modeLabel: string;

    if (publishedArg !== undefined) {
      const version = publishedArg.includes("=")
        ? (publishedArg.split("=")[1] ?? expectedVersion)
        : expectedVersion;
      modeLabel = `published @imposia/*@${version} from the npm registry`;
      const prefix = path.join(stage, "install");
      await mkdir(prefix, { recursive: true });
      await run(
        "npm",
        [
          "install",
          "--prefix",
          prefix,
          "--no-audit",
          "--no-fund",
          "--no-save",
          ...packageNames.map((name) => `@imposia/${name}@${version}`),
        ],
        { cwd: root, maxBuffer: 16 * 1024 * 1024 },
      );
      base = path.join(prefix, "node_modules");
      for (const name of packageNames) {
        const manifest = JSON.parse(
          await readFile(path.join(base, "@imposia", name, "package.json"), "utf8"),
        ) as { version: string };
        if (manifest.version !== version) {
          throw new Error(`@imposia/${name} resolved to ${manifest.version}, expected ${version}.`);
        }
      }
    } else {
      modeLabel = `locally packed tarballs at workspace version ${expectedVersion}`;
      if (!skipBuild) {
        await run("pnpm", ["exec", "tsc", "-b"], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
        await run("node", ["--import", "tsx", "scripts/build-core-browser.ts"], {
          cwd: root,
          maxBuffer: 16 * 1024 * 1024,
        });
      }
      const tarballDirectory = path.join(stage, "tarballs");
      await mkdir(tarballDirectory, { recursive: true });
      base = path.join(stage, "node_modules");
      for (const name of packageNames) {
        await run(
          "pnpm",
          [
            "--dir",
            path.join(root, "packages", name),
            "pack",
            "--pack-destination",
            tarballDirectory,
          ],
          { cwd: root, maxBuffer: 16 * 1024 * 1024 },
        );
        const tarball = (await readdir(tarballDirectory)).find(
          (candidate) => candidate.startsWith(`imposia-${name}-`) && candidate.endsWith(".tgz"),
        );
        if (tarball === undefined) throw new Error(`Packed @imposia/${name} tarball is missing.`);
        const target = path.join(base, "@imposia", name);
        await mkdir(target, { recursive: true });
        await run(
          "tar",
          ["-xzf", path.join(tarballDirectory, tarball), "-C", target, "--strip-components", "1"],
          { cwd: root },
        );
        const manifest = JSON.parse(await readFile(path.join(target, "package.json"), "utf8")) as {
          version: string;
        };
        if (manifest.version !== expectedVersion) {
          throw new Error(
            `Packed @imposia/${name} is ${manifest.version}, expected workspace ${expectedVersion}.`,
          );
        }
        console.log(`Consuming ${tarball} (${manifest.version}).`);
      }
    }

    const alias = {
      ...Object.fromEntries(
        packageNames.map((name) => [`@imposia/${name}`, path.join(base, "@imposia", name)]),
      ),
      // Exactly one React copy: npm >=7 installs peer dependencies, so a
      // published install carries its own react/react-dom next to the
      // packages. Bundling that copy alongside the repository's would split
      // the hook dispatcher across two Reacts.
      react: path.join(root, "node_modules/react"),
      "react-dom": path.join(root, "node_modules/react-dom"),
    };
    const shared = {
      absWorkingDir: root,
      bundle: true,
      format: "esm" as const,
      platform: "browser" as const,
      target: ["es2022"],
      minify: true,
      sourcemap: false,
      metafile: true,
      alias,
      // react/react-dom stay resolvable from the repository install; the
      // packed packages declare them as peer dependencies.
      nodePaths: [path.join(root, "node_modules")],
    };
    const [demoResult, reactResult] = await Promise.all([
      build({ ...shared, entryPoints: ["examples/demo/app.tsx"], outfile: "examples/demo/app.js" }),
      build({
        ...shared,
        entryPoints: ["examples/react/app.tsx"],
        outfile: "examples/react/app.js",
        define: { "process.env.NODE_ENV": '"development"' },
      }),
    ]);

    const leaks = new Set<string>();
    for (const result of [demoResult, reactResult]) {
      for (const input of Object.keys(result.metafile?.inputs ?? {})) {
        // Inputs are relative to the repository root. Workspace sources —
        // including pnpm's node_modules/@imposia symlinks, which esbuild
        // resolves to their packages/ real paths — are a leaked alias.
        if (input.startsWith("packages/") || input.includes("/packages/")) leaks.add(input);
        if (input.includes("node_modules/@imposia/") && !input.startsWith("..")) leaks.add(input);
      }
    }
    if (leaks.size > 0) {
      throw new Error(
        `Workspace aliases leaked into the packed bundle:\n- ${[...leaks].sort().join("\n- ")}`,
      );
    }
    await writeFile(
      path.join(root, "examples/demo/viewer.css"),
      await readFile(path.join(base, "@imposia/viewer/src/styles.css"), "utf8"),
      "utf8",
    );
    console.log(`Bundled the lab examples from ${modeLabel}; no workspace inputs leaked.`);

    await new Promise<void>((resolve, reject) => {
      const child = execFile(
        "pnpm",
        [
          "exec",
          "playwright",
          "test",
          "tests/e2e/demo-showcase.spec.ts",
          "tests/e2e/react-adapter.spec.ts",
          "tests/e2e/react-adapter-generation-race.spec.ts",
        ],
        { cwd: root, maxBuffer: 64 * 1024 * 1024 },
        (error) => (error === null ? resolve() : reject(error)),
      );
      child.stdout?.pipe(process.stdout);
      child.stderr?.pipe(process.stderr);
    });
    console.log(`Proof-lab specs passed against ${modeLabel}.`);
  } catch (error) {
    failed = true;
    console.error(error instanceof Error ? error.message : error);
  } finally {
    await rm(stage, { recursive: true, force: true });
    if (!keep) {
      await run("node", ["--import", "tsx", "scripts/build-demo.ts"], {
        cwd: root,
        maxBuffer: 16 * 1024 * 1024,
      });
      console.log("Restored the workspace-built example bundles.");
    }
  }
  if (failed) process.exit(1);
}

await main();
