import {
  mountPublication,
  type PublicationController,
  type PublicationDocument,
  type PublicationOptions,
  type PublicationSnapshot,
} from "@imposia/client";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

export type ImposiaPublicationStatus = "idle" | "loading" | "ready" | "error";

export type ImposiaPublicationState = Readonly<{
  status: ImposiaPublicationStatus;
  publication?: PublicationDocument;
  error?: unknown;
}>;

export type ImposiaPublicationCallbacks = Readonly<{
  onReady?: ((publication: PublicationDocument) => void) | undefined;
  onError?: ((error: unknown) => void) | undefined;
  onStateChange?: ((state: ImposiaPublicationState) => void) | undefined;
}>;

export type UseImposiaPublicationProps = ImposiaPublicationCallbacks & {
  readonly snapshot: PublicationSnapshot;
  readonly snapshotRevision?: string | number | undefined;
  readonly publicationOptions?: PublicationOptions | undefined;
  readonly publicationOptionsRevision?: string | number | undefined;
};

export type UseImposiaPublicationResult = Readonly<{
  hostRef: RefObject<HTMLDivElement | null>;
  state: ImposiaPublicationState;
  controller: PublicationController | undefined;
}>;

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function stateForLoading(current: PublicationDocument | undefined): ImposiaPublicationState {
  return current === undefined
    ? { status: "loading" }
    : { status: "loading", publication: current };
}

function stateForError(
  current: PublicationDocument | undefined,
  error: unknown,
): ImposiaPublicationState {
  return current === undefined
    ? { status: "error", error }
    : { status: "error", publication: current, error };
}

export function useImposiaPublication({
  snapshot,
  snapshotRevision,
  publicationOptions,
  publicationOptionsRevision,
  onReady,
  onError,
  onStateChange,
}: UseImposiaPublicationProps): UseImposiaPublicationResult {
  const hostRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef(snapshot);
  const snapshotRevisionRef = useRef(snapshotRevision);
  const optionsRef = useRef(publicationOptions);
  const progressRef = useRef(publicationOptions?.onProgress);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onStateChangeRef = useRef(onStateChange);
  const controllerRef = useRef<PublicationController | undefined>(undefined);
  const currentRef = useRef<PublicationDocument | undefined>(undefined);
  const previousSnapshotRef = useRef(snapshot);
  const previousSnapshotRevisionRef = useRef(snapshotRevision);
  const mountedOptionsRevisionRef = useRef(publicationOptionsRevision);
  const operationRef = useRef(0);
  const disposedRef = useRef(false);
  const [state, setState] = useState<ImposiaPublicationState>({ status: "idle" });

  snapshotRef.current = snapshot;
  snapshotRevisionRef.current = snapshotRevision;
  optionsRef.current = publicationOptions;
  progressRef.current = publicationOptions?.onProgress;
  onReadyRef.current = onReady;
  onErrorRef.current = onError;
  onStateChangeRef.current = onStateChange;

  const transition = useCallback((next: ImposiaPublicationState): void => {
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
    previousSnapshotRef.current = snapshotRef.current;
    previousSnapshotRevisionRef.current = snapshotRevisionRef.current;
    const mountedOptionsRevision = publicationOptionsRevision;
    mountedOptionsRevisionRef.current = mountedOptionsRevision;
    transition(stateForLoading(undefined));

    let controller: PublicationController | undefined;
    try {
      const initialOptions = optionsRef.current;
      const options: PublicationOptions = initialOptions === undefined ? {} : { ...initialOptions };
      if (initialOptions?.onProgress !== undefined) {
        options.onProgress = (progress) => progressRef.current?.(progress);
      }
      controller = mountPublication(host, snapshotRef.current, options);
      controllerRef.current = controller;
    } catch (error: unknown) {
      reportError(error);
      return;
    }

    const operation = operationRef.current;
    void controller.ready.then(
      (publication) => {
        if (
          disposedRef.current ||
          operationRef.current !== operation ||
          !Object.is(mountedOptionsRevisionRef.current, mountedOptionsRevision)
        ) {
          return;
        }
        currentRef.current = publication;
        transition({ status: "ready", publication });
        onReadyRef.current?.(publication);
      },
      (error: unknown) => {
        if (
          disposedRef.current ||
          operationRef.current !== operation ||
          !Object.is(mountedOptionsRevisionRef.current, mountedOptionsRevision) ||
          isAbortError(error)
        ) {
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
  }, [publicationOptionsRevision, reportError, transition]);

  useEffect(() => {
    const previous = previousSnapshotRef.current;
    const previousRevision = previousSnapshotRevisionRef.current;
    previousSnapshotRef.current = snapshot;
    previousSnapshotRevisionRef.current = snapshotRevision;
    if (Object.is(previous, snapshot) && Object.is(previousRevision, snapshotRevision)) return;

    const controller = controllerRef.current;
    if (controller === undefined || disposedRef.current) return;
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    transition(stateForLoading(currentRef.current));
    void controller.update(snapshot).then(
      (publication) => {
        if (disposedRef.current || operationRef.current !== operation) return;
        currentRef.current = publication;
        transition({ status: "ready", publication });
        onReadyRef.current?.(publication);
      },
      (error: unknown) => {
        if (disposedRef.current || operationRef.current !== operation || isAbortError(error))
          return;
        reportError(error);
      },
    );
  }, [reportError, snapshot, snapshotRevision, transition]);

  return { hostRef, state, controller: controllerRef.current };
}
