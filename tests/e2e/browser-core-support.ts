import type { ConsoleMessage, Page } from "@playwright/test";

const SANDBOXED_SRCDOC_SCRIPT_ERROR =
  "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set.";
const WEBKIT_INSPECTOR_BOOTSTRAP_URL = "web-inspector://bootstrap.js";

type BrowserErrorCaptureOptions = {
  readonly allowConsoleError?: (message: ConsoleMessage) => boolean;
};

export function captureBrowserErrors(
  page: Page,
  browserName: string,
  options: BrowserErrorCaptureOptions = {},
) {
  const errors: Array<{ text: string; url: string }> = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    const url = message.location().url;
    const allowedSandboxTrace =
      message.type() === "error" &&
      message.text() === SANDBOXED_SRCDOC_SCRIPT_ERROR &&
      (url === "" ||
        url === WEBKIT_INSPECTOR_BOOTSTRAP_URL ||
        (browserName === "chromium" && url === "about:srcdoc"));
    if (
      message.type() === "error" &&
      !allowedSandboxTrace &&
      !options.allowConsoleError?.(message)
    ) {
      errors.push({ text: message.text(), url });
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { errors, pageErrors };
}
