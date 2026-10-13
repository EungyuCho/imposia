import {
  mountPageDocument,
  type PageDocument,
  type PageDocumentController,
  type PageDocumentOptions,
  type PageSource,
} from "@imposia/client";
import { useCallback, useEffect, useRef, useState } from "react";

export type ImposiaDocumentStatus = "idle" | "loading" | "ready" | "aborted" | "error";

export type ImposiaDocumentState = Readonly<{
  status: ImposiaDocumentStatus;
  document?: PageDocument;
  /** The source the `document` was built from; set only while `status` is `ready`. */
  source?: PageSource;
  error?: unknown;
}>;

export type ImposiaDocumentCallbacks = Readonly<{
  onReady?: ((pageDocument: PageDocument) => void) | undefined;
  onError?: ((error: unknown) => void) | undefined;
  onStateChange?: ((state: ImposiaDocumentState) => void) | undefined;
}>;

export type UseImposiaDocumentProps = ImposiaDocumentCallbacks & {
  readonly source: PageSource;
  readonly sourceRevision?: string | number | undefined;
  readonly documentOptions?: PageDocumentOptions | undefined;
  readonly documentOptionsRevision?: string | number | undefined;
  /**
   * When preparation starts. `immediate` (default) mounts at once, `idle` waits for an idle
   * period, `manual` waits for `prepare()` or `retry()`.
   */
  readonly preparation?: "immediate" | "idle" | "manual" | undefined;
};

export type UseImposiaDocumentResult = Readonly<{
  hostRef: { current: HTMLDivElement | null };
  state: ImposiaDocumentState;
  controller: PageDocumentController | undefined;
  /** Starts preparation; repeated calls are no-ops. */
  prepare(): void;
  /** Starts preparation if needed, or rebuilds the current source with the same controller. */
  retry(): void;
}>;

function sameSource(left: PageSource, right: PageSource): boolean {
  if ("html" in left && "html" in right) {
    return left.html === right.html && left.baseUrl === right.baseUrl;
  }
  if ("lightDom" in left && "lightDom" in right) {
    return left.lightDom === right.lightDom && left.baseUrl === right.baseUrl;
  }
  return false;
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function stateForLoading(current: PageDocument | undefined): ImposiaDocumentState {
  return current === undefined ? { status: "loading" } : { status: "loading", document: current };
}

/**
 * A generation that was abandoned while this hook was still the live owner.
 *
 * Distinct from `idle`, which means no generation was ever started, and from `error`,
 * which means one failed. Nothing is in flight and nothing new was committed, so a caller
 * that gates a loading overlay on `status` must treat this as a terminal state.
 */
function stateForAborted(current: PageDocument | undefined): ImposiaDocumentState {
  return current === undefined ? { status: "aborted" } : { status: "aborted", document: current };
}

function stateForError(current: PageDocument | undefined, error: unknown): ImposiaDocumentState {
  return current === undefined
    ? { status: "error", error }
    : { status: "error", document: current, error };
}

export function useImposiaDocument({
  source,
  sourceRevision,
  documentOptions,
  documentOptionsRevision,
  preparation = "immediate",
  onReady,
  onError,
  onStateChange,
}: UseImposiaDocumentProps): UseImposiaDocumentResult {
  const hostRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef(source);
  const sourceRevisionRef = useRef(sourceRevision);
  const optionsRef = useRef(documentOptions);
  const progressRef = useRef(documentOptions?.onProgress);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onStateChangeRef = useRef(onStateChange);
  const controllerRef = useRef<PageDocumentController | undefined>(undefined);
  const currentRef = useRef<PageDocument | undefined>(undefined);
  const previousSourceRef = useRef(source);
  const previousSourceRevisionRef = useRef(sourceRevision);
  const mountedDocumentOptionsRevisionRef = useRef(documentOptionsRevision);
  const operationRef = useRef(0);
  const disposedRef = useRef(false);
  const previousRetryRef = useRef(0);
  const retryRevisionRef = useRef(0);
  const [started, setStarted] = useState(preparation === "immediate");
  const [retryRevision, setRetryRevision] = useState(0);
  const [mountRevision, setMountRevision] = useState(0);
  const [state, setState] = useState<ImposiaDocumentState>({ status: "idle" });

  sourceRef.current = source;
  sourceRevisionRef.current = sourceRevision;
  optionsRef.current = documentOptions;
  progressRef.current = documentOptions?.onProgress;
  onReadyRef.current = onReady;
  onErrorRef.current = onError;
  onStateChangeRef.current = onStateChange;
  retryRevisionRef.current = retryRevision;

  const prepare = useCallback((): void => setStarted(true), []);

  const retry = useCallback((): void => {
    setStarted(true);
    if (controllerRef.current === undefined) setMountRevision((revision) => revision + 1);
    setRetryRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    if (started || preparation === "manual") return;
    if (preparation === "immediate") {
      prepare();
      return;
    }
    if (typeof requestIdleCallback === "function") {
      const handle = requestIdleCallback(prepare, { timeout: 1500 });
      return () => cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(prepare, 200);
    return () => window.clearTimeout(handle);
  }, [preparation, prepare, started]);

  const transition = useCallback((next: ImposiaDocumentState): void => {
    setState(next);
    onStateChangeRef.current?.(next);
  }, []);

  const reportError = useCallback(
    (error: unknown): void => {
      transition(stateForError(currentRef.current, error));
      onErrorRef.current?.(error);
    },
    [transition],
  );

  // `mountRevision` is not read in the body: bumping it re-runs this effect so that
  // `retry()` can mount again after a synchronous mount failure left no controller.
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry trigger, see above
  useEffect(() => {
    const host = hostRef.current;
    if (host === null || !started) return;

    disposedRef.current = false;
    previousRetryRef.current = retryRevisionRef.current;
    previousSourceRef.current = sourceRef.current;
    previousSourceRevisionRef.current = sourceRevisionRef.current;
    const mountedOptionsRevision = documentOptionsRevision;
    // The source this controller was mounted with; sourceRef may already hold a newer one
    // (for example when a later render suspended), which must not label this document.
    const mountedSource = sourceRef.current;
    mountedDocumentOptionsRevisionRef.current = mountedOptionsRevision;
    transition(stateForLoading(undefined));

    let controller: PageDocumentController | undefined;
    try {
      const initialOptions = optionsRef.current;
      const options: PageDocumentOptions =
        initialOptions === undefined ? {} : { ...initialOptions };
      if (initialOptions?.onProgress !== undefined) {
        options.onProgress = (progress) => progressRef.current?.(progress);
      }
      controller = mountPageDocument(host, mountedSource, options);
      controllerRef.current = controller;
    } catch (error: unknown) {
      reportError(error);
      return;
    }

    const operation = operationRef.current;
    void controller.ready.then(
      (pageDocument) => {
        if (
          disposedRef.current ||
          operationRef.current !== operation ||
          !Object.is(mountedDocumentOptionsRevisionRef.current, mountedOptionsRevision)
        )
          return;
        currentRef.current = pageDocument;
        transition({ status: "ready", document: pageDocument, source: mountedSource });
        onReadyRef.current?.(pageDocument);
      },
      (error: unknown) => {
        // Superseded or unmounted: another run owns the state now, so say nothing.
        if (
          disposedRef.current ||
          operationRef.current !== operation ||
          !Object.is(mountedDocumentOptionsRevisionRef.current, mountedOptionsRevision)
        )
          return;
        // Aborted while still the live run. Nothing failed, so `error` would misreport it,
        // but returning without a transition strands the caller in `loading` with no
        // further state change to wait for -- this effect does not re-run on its own.
        if (isAbortError(error)) {
          transition(stateForAborted(currentRef.current));
          return;
        }
        reportError(error);
      },
    );

    return () => {
      disposedRef.current = true;
      operationRef.current += 1;
      controllerRef.current = undefined;
      currentRef.current = undefined;
      if (controller !== undefined) void controller.destroy();
    };
  }, [started, mountRevision, documentOptionsRevision, reportError, transition]);

  useEffect(() => {
    const previous = previousSourceRef.current;
    const previousRevision = previousSourceRevisionRef.current;
    const next = source;
    const previousRetry = previousRetryRef.current;
    previousSourceRef.current = next;
    previousSourceRevisionRef.current = sourceRevision;
    previousRetryRef.current = retryRevision;
    if (
      sameSource(previous, next) &&
      Object.is(previousRevision, sourceRevision) &&
      previousRetry === retryRevision
    )
      return;

    const controller = controllerRef.current;
    if (controller === undefined || disposedRef.current) return;

    const operation = operationRef.current + 1;
    operationRef.current = operation;
    transition(stateForLoading(currentRef.current));
    void controller.update(next).then(
      (pageDocument) => {
        if (disposedRef.current || operationRef.current !== operation) return;
        currentRef.current = pageDocument;
        transition({ status: "ready", document: pageDocument, source: next });
        onReadyRef.current?.(pageDocument);
      },
      (error: unknown) => {
        if (disposedRef.current || operationRef.current !== operation) return;
        if (isAbortError(error)) {
          transition(stateForAborted(currentRef.current));
          return;
        }
        reportError(error);
      },
    );
  }, [reportError, retryRevision, source, sourceRevision, transition]);

  return { hostRef, state, controller: controllerRef.current, prepare, retry };
}
