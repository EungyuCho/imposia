import { forwardRef } from "react";
import {
  ImposiaPageViewer,
  type ImposiaPageViewerHandle,
  type ImposiaPageViewerProps,
} from "./page-viewer.js";

export type ImposiaDocumentProps = ImposiaPageViewerProps;
export type ImposiaDocumentHandle = ImposiaPageViewerHandle;

export const ImposiaDocument = forwardRef<ImposiaDocumentHandle, ImposiaDocumentProps>(
  function ImposiaDocument(props, ref) {
    return <ImposiaPageViewer {...props} ref={ref} />;
  },
);
