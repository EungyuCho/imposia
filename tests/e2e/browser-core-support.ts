import type { Page } from "@playwright/test";

const WEBKIT_SANDBOX_TRACE_ERROR =
  "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set.";

export function captureBrowserErrors(page: Page, browserName: string) {
  const errors: Array<{ text: string; url: string }> = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    const allowedWebkitTrace =
      browserName === "webkit" &&
      message.type() === "error" &&
      message.text() === WEBKIT_SANDBOX_TRACE_ERROR &&
      message.location().url === "web-inspector://bootstrap.js";
    if (message.type() === "error" && !allowedWebkitTrace) {
      errors.push({ text: message.text(), url: message.location().url });
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { errors, pageErrors };
}
