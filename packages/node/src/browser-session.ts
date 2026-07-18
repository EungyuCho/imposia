import { type Browser, chromium } from "playwright";

export interface BrowserSession {
  browser: Browser;
  close(): Promise<void>;
}

export async function launchBrowserSession(executablePath?: string): Promise<BrowserSession> {
  const server = await chromium.launchServer({
    headless: true,
    host: "127.0.0.1",
    ...(executablePath === undefined ? {} : { executablePath }),
  });

  try {
    const browser = await chromium.connect(server.wsEndpoint());
    return {
      browser,
      async close() {
        await server.kill();
      },
    };
  } catch (error) {
    try {
      await server.kill();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Browser connection failed and its server could not be stopped.",
      );
    }
    throw error;
  }
}
