import {
  mountPageDocument,
  type PageDocument,
  type PageDocumentController,
  type PageDocumentOptions,
  type PageSource,
} from "@imposia/client";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

export type ImposiaDocumentStatus = "idle" | "loading" | "ready" | "error";

export type ImposiaDocumentState = Readonly<{
  status: ImposiaDocumentStatus;
  document?: PageDocument;
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
};

export type UseImposiaDocumentResult = Readonly<{
  hostRef: RefObject<HTMLDivElement | null>;
  state: ImposiaDocumentState;
  controller: PageDocumentController | undefined;
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
  const [state, setState] = useState<ImposiaDocumentState>({ status: "idle" });

  sourceRef.current = source;
  sourceRevisionRef.current = sourceRevision;
  optionsRef.current = documentOptions;
  progressRef.current = documentOptions?.onProgress;
  onReadyRef.current = onReady;
  onErrorRef.current = onError;
  onStateChangeRef.current = onStateChange;

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

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    disposedRef.current = false;
    previousSourceRef.current = sourceRef.current;
    previousSourceRevisionRef.current = sourceRevisionRef.current;
    const mountedOptionsRevision = documentOptionsRevision;
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
      controller = mountPageDocument(host, sourceRef.current, options);
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
        transition({ status: "ready", document: pageDocument });
        onReadyRef.current?.(pageDocument);
      },
      (error: unknown) => {
        if (
          disposedRef.current ||
          operationRef.current !== operation ||
          !Object.is(mountedDocumentOptionsRevisionRef.current, mountedOptionsRevision) ||
          isAbortError(error)
        )
          return;
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
  }, [documentOptionsRevision, reportError, transition]);

  useEffect(() => {
    const previous = previousSourceRef.current;
    const previousRevision = previousSourceRevisionRef.current;
    const next = source;
    previousSourceRef.current = next;
    previousSourceRevisionRef.current = sourceRevision;
    if (sameSource(previous, next) && Object.is(previousRevision, sourceRevision)) return;

    const controller = controllerRef.current;
    if (controller === undefined || disposedRef.current) return;

    const operation = operationRef.current + 1;
    operationRef.current = operation;
    transition(stateForLoading(currentRef.current));
    void controller.update(next).then(
      (pageDocument) => {
        if (disposedRef.current || operationRef.current !== operation) return;
        currentRef.current = pageDocument;
        transition({ status: "ready", document: pageDocument });
        onReadyRef.current?.(pageDocument);
      },
      (error: unknown) => {
        if (disposedRef.current || operationRef.current !== operation || isAbortError(error))
          return;
        reportError(error);
      },
    );
  }, [reportError, source, sourceRevision, transition]);

  return { hostRef, state, controller: controllerRef.current };
}
