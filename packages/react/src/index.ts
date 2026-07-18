export * from "@imposia/client";
export type { ImposiaDocumentHandle, ImposiaDocumentProps } from "./document.js";
export { ImposiaDocument } from "./document.js";
export type { ImposiaPageViewerHandle, ImposiaPageViewerProps } from "./page-viewer.js";
export { ImposiaPageViewer } from "./page-viewer.js";
export {
  type ImposiaDocumentCallbacks,
  type ImposiaDocumentState,
  type ImposiaDocumentStatus,
  type UseImposiaDocumentProps,
  type UseImposiaDocumentResult,
  useImposiaDocument,
} from "./use-imposia-document.js";
