import { ImposiaError } from "./errors.js";
import { abortError } from "./page-document-frame.js";
import type {
  PageExtension,
  PageExtensionAssetRequest,
  PageExtensionContext,
  PageExtensionDecoration,
  PageExtensionEntryTransformInput,
  PageExtensionPage,
  PageExtensionTransformInput,
  PageExtensionTransformOutput,
  PageExtensionWarning,
  PageExtensionWarningCode,
  PageWarning,
  PublicationExtension,
} from "./page-document-types.js";

type ExtensionSnapshot = Readonly<{
  index: number;
  name: unknown;
  transform: unknown;
  transformEntry: unknown;
  allowAsset: unknown;
  decoratePage: unknown;
}>;

export type PageExtensionSnapshots = readonly ExtensionSnapshot[];

export type ValidatedPageExtension = Readonly<{
  index: number;
  name: string;
  transform?: PageExtension["transform"];
  transformEntry?: PublicationExtension["transformEntry"];
  allowAsset?: PageExtension["allowAsset"];
  decoratePage?: PageExtension["decoratePage"];
}>;

type ExtensionWarningEntry = Readonly<{
  extension: ValidatedPageExtension;
  sequence: number;
  code: PageExtensionWarningCode;
  message: string;
  entryId: string | undefined;
  page: number | undefined;
}>;

export type ExtensionWarningScope = Readonly<{
  entryId?: string;
  page?: number;
}>;

export interface ExtensionWarningCollector {
  context(extension: ValidatedPageExtension, scope?: ExtensionWarningScope): PageExtensionContext;
  finish(): readonly PageWarning[];
  cleanup(): void;
}

export type ExtensionTransformResult = Readonly<{
  html: string;
  css: readonly string[];
}>;

export type ExtensionDecorationResult = Readonly<{
  headerHtml?: string;
  footerHtml?: string;
}>;

const EXTENSION_NAME = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)+$/;

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function valueRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Readonly<Record<string, unknown>>;
}

function invalidExtension(message: string): TypeError {
  return new TypeError(`Invalid page extension: ${message}`);
}

export function snapshotExtensions(value: unknown): PageExtensionSnapshots {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) {
    return Object.freeze([
      Object.freeze({
        index: 0,
        name: undefined,
        transform: undefined,
        transformEntry: undefined,
        allowAsset: undefined,
        decoratePage: undefined,
      }),
    ]);
  }
  return Object.freeze(
    value.map((candidate, index) => {
      const record = valueRecord(candidate);
      return Object.freeze({
        index,
        name: record?.name,
        transform: record?.transform,
        transformEntry: record?.transformEntry,
        allowAsset: record?.allowAsset,
        decoratePage: record?.decoratePage,
      });
    }),
  );
}

export function validateExtensions(
  snapshots: PageExtensionSnapshots,
): readonly ValidatedPageExtension[] {
  const names = new Set<string>();
  const extensions: ValidatedPageExtension[] = [];
  for (const snapshot of snapshots) {
    if (typeof snapshot.name !== "string" || !EXTENSION_NAME.test(snapshot.name)) {
      throw invalidExtension("name must be a lowercase package-style identifier.");
    }
    if (names.has(snapshot.name)) {
      throw invalidExtension(`duplicate name "${snapshot.name}".`);
    }
    if (snapshot.transform !== undefined && typeof snapshot.transform !== "function") {
      throw invalidExtension(`transform for "${snapshot.name}" must be a function.`);
    }
    if (snapshot.transformEntry !== undefined && typeof snapshot.transformEntry !== "function") {
      throw invalidExtension(`transformEntry for "${snapshot.name}" must be a function.`);
    }
    if (snapshot.allowAsset !== undefined && typeof snapshot.allowAsset !== "function") {
      throw invalidExtension(`allowAsset for "${snapshot.name}" must be a function.`);
    }
    if (snapshot.decoratePage !== undefined && typeof snapshot.decoratePage !== "function") {
      throw invalidExtension(`decoratePage for "${snapshot.name}" must be a function.`);
    }
    names.add(snapshot.name);
    extensions.push(
      Object.freeze({
        index: snapshot.index,
        name: snapshot.name,
        ...(snapshot.transform === undefined
          ? {}
          : { transform: snapshot.transform as PageExtension["transform"] }),
        ...(snapshot.transformEntry === undefined
          ? {}
          : {
              transformEntry: snapshot.transformEntry as PublicationExtension["transformEntry"],
            }),
        ...(snapshot.allowAsset === undefined
          ? {}
          : { allowAsset: snapshot.allowAsset as PageExtension["allowAsset"] }),
        ...(snapshot.decoratePage === undefined
          ? {}
          : { decoratePage: snapshot.decoratePage as PageExtension["decoratePage"] }),
      }),
    );
  }
  return Object.freeze(extensions);
}

function validateWarning(value: unknown): Readonly<{
  code: PageExtensionWarningCode;
  message: string;
}> {
  const warning = valueRecord(value);
  if (
    warning === undefined ||
    typeof warning.code !== "string" ||
    !warning.code.startsWith("EXTENSION_") ||
    warning.code.length === "EXTENSION_".length ||
    typeof warning.message !== "string"
  ) {
    throw invalidExtension("warning code must start with EXTENSION_ and include a string message.");
  }
  return Object.freeze({
    code: warning.code as PageExtensionWarningCode,
    message: warning.message,
  });
}

export function createExtensionWarningCollector(signal: AbortSignal): ExtensionWarningCollector {
  const entries: ExtensionWarningEntry[] = [];
  const seen = new Set<string>();
  const contexts = new Map<string, PageExtensionContext>();
  const cleanups: Array<() => void> = [];
  let sequence = 0;
  let cleaned = false;
  return {
    context(extension, scope = {}) {
      const entryId = scope.entryId;
      const page = scope.page;
      const contextKey = `${extension.index}\u0000${entryId ?? ""}\u0000${page ?? ""}`;
      const existing = contexts.get(contextKey);
      if (existing !== undefined) return existing;
      const context = Object.freeze({
        signal,
        warn(value: PageExtensionWarning) {
          throwIfAborted(signal);
          const warning = validateWarning(value);
          const key = `${extension.name}\u0000${warning.code}\u0000${entryId ?? ""}\u0000${page ?? ""}`;
          if (seen.has(key)) return;
          seen.add(key);
          entries.push(
            Object.freeze({
              extension,
              sequence,
              code: warning.code,
              message: warning.message,
              entryId,
              page,
            }),
          );
          sequence += 1;
        },
        onCleanup(cleanup: () => void) {
          if (typeof cleanup !== "function") {
            throw invalidExtension("cleanup must be a function.");
          }
          if (cleaned || signal.aborted) {
            cleanup();
            throwIfAborted(signal);
            return;
          }
          cleanups.push(cleanup);
        },
      });
      contexts.set(contextKey, context);
      return context;
    },
    finish() {
      return Object.freeze(
        [...entries]
          .sort(
            (left, right) =>
              left.extension.index - right.extension.index || left.sequence - right.sequence,
          )
          .map((entry) =>
            Object.freeze({
              code: entry.code,
              message: entry.message,
              sourceIdentity: undefined,
              location: Object.freeze({
                generation: undefined,
                entryId: entry.entryId,
                page: entry.page,
              }),
              extension: entry.extension.name,
            }),
          ),
      );
    },
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      let firstError: unknown;
      for (const cleanup of cleanups.reverse()) {
        try {
          cleanup();
        } catch (error: unknown) {
          firstError ??= extensionCallbackError(error);
        }
      }
      cleanups.length = 0;
      if (firstError !== undefined) throw firstError;
    },
  };
}

function extensionCallbackError(error: unknown): unknown {
  if (error instanceof DOMException && error.name === "AbortError") return error;
  if (error instanceof ImposiaError) return error;
  if (error instanceof TypeError && error.message.startsWith("Invalid page extension:")) {
    return error;
  }
  return new ImposiaError(
    "EXTENSION_FAILED",
    error instanceof Error ? error.message : "An extension callback failed.",
  );
}

async function callExtension<T>(
  callback: () => PromiseLike<T> | T,
  signal: AbortSignal,
): Promise<T> {
  try {
    return await awaitWithAbort(callback(), signal);
  } catch (error: unknown) {
    throw extensionCallbackError(error);
  }
}

function callExtensionSync<T>(callback: () => T): T {
  try {
    return callback();
  } catch (error: unknown) {
    throw extensionCallbackError(error);
  }
}

function awaitWithAbort<T>(value: PromiseLike<T> | T, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    const finish = (callback: (value: T) => void, value: T) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback(value);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(value).then(
      (result) => finish(resolve, result),
      (error: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function validateTransformOutput(value: unknown): PageExtensionTransformOutput | undefined {
  if (value === undefined) return undefined;
  const output = valueRecord(value);
  if (output === undefined) throw invalidExtension("transform must return an object or undefined.");
  if (output.html !== undefined && typeof output.html !== "string") {
    throw invalidExtension("transform html must be a string.");
  }
  if (
    output.css !== undefined &&
    (!Array.isArray(output.css) || !output.css.every((item) => typeof item === "string"))
  ) {
    throw invalidExtension("transform css must be an array of strings.");
  }
  return Object.freeze({
    ...(output.html === undefined ? {} : { html: output.html }),
    ...(output.css === undefined ? {} : { css: Object.freeze([...output.css]) }),
  });
}

export async function applyExtensionTransforms(
  extensions: readonly ValidatedPageExtension[],
  input: PageExtensionTransformInput,
  signal: AbortSignal,
  warnings: ExtensionWarningCollector,
  ensureLimit: (html: string, css: readonly string[]) => void,
  prepareInput: (html: string, css: readonly string[]) => ExtensionTransformResult,
): Promise<ExtensionTransformResult> {
  let { html, css } = prepareInput(input.html, input.css);
  for (const extension of extensions) {
    if (extension.transform === undefined) continue;
    throwIfAborted(signal);
    const transformInput = Object.freeze({
      html,
      css,
      baseUrl: input.baseUrl,
    });
    const output = validateTransformOutput(
      await callExtension(
        () => extension.transform?.(transformInput, warnings.context(extension)),
        signal,
      ),
    );
    throwIfAborted(signal);
    if (output === undefined) continue;
    html = output.html ?? html;
    css = output.css === undefined ? css : Object.freeze([...output.css]);
    ensureLimit(html, css);
    ({ html, css } = prepareInput(html, css));
  }
  return Object.freeze({ html, css });
}

export async function applyExtensionEntryTransforms(
  extensions: readonly ValidatedPageExtension[],
  input: PageExtensionEntryTransformInput,
  signal: AbortSignal,
  warnings: ExtensionWarningCollector,
  ensureLimit: (html: string, css: readonly string[]) => void,
  prepareInput: (html: string, css: readonly string[]) => ExtensionTransformResult,
): Promise<ExtensionTransformResult> {
  let { html, css } = prepareInput(input.html, input.css);
  for (const extension of extensions) {
    if (extension.transformEntry === undefined) continue;
    throwIfAborted(signal);
    const transformInput = Object.freeze({
      html,
      css,
      publication: input.publication,
      entry: input.entry,
    });
    const output = validateTransformOutput(
      await callExtension(
        () =>
          extension.transformEntry?.(
            transformInput,
            warnings.context(extension, { entryId: input.entry.id }),
          ),
        signal,
      ),
    );
    throwIfAborted(signal);
    if (output === undefined) continue;
    html = output.html ?? html;
    css = output.css === undefined ? css : Object.freeze([...output.css]);
    ensureLimit(html, css);
    ({ html, css } = prepareInput(html, css));
  }
  return Object.freeze({ html, css });
}

export function allowExtensionAsset(
  extensions: readonly ValidatedPageExtension[],
  request: PageExtensionAssetRequest,
  signal: AbortSignal,
  warnings: ExtensionWarningCollector,
): boolean {
  for (const extension of extensions) {
    if (extension.allowAsset === undefined) continue;
    throwIfAborted(signal);
    const allowed = callExtensionSync(() =>
      extension.allowAsset?.(request, warnings.context(extension)),
    );
    throwIfAborted(signal);
    if (typeof allowed !== "boolean") {
      throw invalidExtension(`allowAsset for "${extension.name}" must return a boolean.`);
    }
    if (!allowed) return false;
  }
  return true;
}

function validateDecoration(value: unknown): PageExtensionDecoration | undefined {
  if (value === undefined) return undefined;
  const decoration = valueRecord(value);
  if (decoration === undefined)
    throw invalidExtension("decoratePage must return an object or undefined.");
  if (decoration.headerHtml !== undefined && typeof decoration.headerHtml !== "string") {
    throw invalidExtension("decoratePage headerHtml must be a string.");
  }
  if (decoration.footerHtml !== undefined && typeof decoration.footerHtml !== "string") {
    throw invalidExtension("decoratePage footerHtml must be a string.");
  }
  return Object.freeze({
    ...(decoration.headerHtml === undefined ? {} : { headerHtml: decoration.headerHtml }),
    ...(decoration.footerHtml === undefined ? {} : { footerHtml: decoration.footerHtml }),
  });
}

export function decorateExtensionPage(
  extensions: readonly ValidatedPageExtension[],
  page: PageExtensionPage,
  signal: AbortSignal,
  warnings: ExtensionWarningCollector,
): readonly ExtensionDecorationResult[] {
  const decorations: ExtensionDecorationResult[] = [];
  for (const extension of extensions) {
    if (extension.decoratePage === undefined) continue;
    throwIfAborted(signal);
    const output = validateDecoration(
      callExtensionSync(() =>
        extension.decoratePage?.(
          Object.freeze({ ...page }),
          warnings.context(extension, { page: page.number }),
        ),
      ),
    );
    throwIfAborted(signal);
    if (output === undefined) continue;
    decorations.push(output);
  }
  return Object.freeze(decorations);
}
