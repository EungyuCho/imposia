# ADR 0002: owned Chromium server lifecycle

Status: accepted for v1.

Core launches the pinned Chromium process with Playwright's public `BrowserServer` API and connects through its loopback endpoint. Renders reuse that browser connection. One successfully reset local-only page may remain idle; concurrent overflow gets an independent page, while failed, timed-out, remote-enabled, and excess pages are closed. Reusable pages have routes removed and navigate to `about:blank` before entering the one-slot pool.

`close()` first waits for external in-flight renders, then calls `BrowserServer.kill()` and awaits process termination; repeated calls share that shutdown. Direct `Browser.close()` can wait indefinitely when Chromium headless shell remains alive after tagged PDF work, including valid local subresources. The owned server handle provides deterministic cleanup without private Playwright protocols, PID discovery, or host-specific process commands. Chromium uses an isolated temporary profile, and process termination is the final authority for cleanup.
