import remapping from "@ampproject/remapping";
import { minify } from "oxc-minify";

export interface MinifiedBrowserBundle {
  readonly code: string;
  /** Composed source map (input map ∘ minify map) serialized as JSON, when requested. */
  readonly map?: string;
}

/**
 * Minifies an unminified browser bundle with oxc-minify, matching the previous
 * esbuild settings (es2022, ES module, browser). When `inputMap` is provided the
 * minifier's map is composed on top of it so the final map still points at the
 * original sources (including `node_modules` paths consumed by the license audit);
 * `sourcesContent` stays excluded, as before.
 */
export async function minifyBrowserBundle(
  filename: string,
  code: string,
  inputMap?: string,
): Promise<MinifiedBrowserBundle> {
  const result = await minify(filename, code, {
    module: true,
    compress: { target: "es2022" },
    sourcemap: inputMap !== undefined,
  });
  if (result.errors.length > 0) {
    throw new Error(
      `oxc-minify failed for ${filename}:\n${result.errors
        .map((error) => `- ${error.message}`)
        .join("\n")}`,
    );
  }
  if (inputMap === undefined) return Object.freeze({ code: result.code });
  if (result.map === undefined) {
    throw new Error(`oxc-minify did not produce a source map for ${filename}.`);
  }
  const composed = remapping(
    JSON.stringify(result.map),
    (file) => (file === filename ? inputMap : null),
    { excludeContent: true },
  );
  return Object.freeze({ code: result.code, map: JSON.stringify(composed) });
}
