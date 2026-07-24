export interface PaginationAssetDocument {
  readonly fonts?: Readonly<{ readonly ready: Promise<unknown> }>;
}

export interface PaginationAssetImage {
  decode?(): Promise<unknown>;
}

export interface PaginationAssetRoot {
  readonly images: readonly PaginationAssetImage[];
}

function aborted(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function ignoreFailure(task: Promise<unknown>): Promise<void> {
  return task.then(
    () => undefined,
    () => undefined,
  );
}

function abortable(task: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(aborted());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    task.then(
      () => {
        cleanup();
        resolve();
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export function settlePaginationAssets(
  documentTarget: PaginationAssetDocument,
  root: PaginationAssetRoot,
  signal: AbortSignal,
): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (documentTarget.fonts !== undefined) {
    tasks.push(ignoreFailure(documentTarget.fonts.ready));
  }
  for (const image of root.images) {
    if (image.decode === undefined) continue;
    try {
      tasks.push(ignoreFailure(image.decode()));
    } catch {
      // A synchronous decode failure is equivalent to a rejected decode promise.
    }
  }
  return abortable(
    Promise.all(tasks).then(() => undefined),
    signal,
  );
}
