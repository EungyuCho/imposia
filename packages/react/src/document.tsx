import { ImposiaPageViewer, type ImposiaPageViewerProps } from "./page-viewer.js";

export type ImposiaDocumentProps = ImposiaPageViewerProps;

export function ImposiaDocument(props: ImposiaDocumentProps) {
  return <ImposiaPageViewer {...props} />;
}
