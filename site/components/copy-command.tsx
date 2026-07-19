"use client";

import { useEffect, useRef, useState } from "react";

interface CopyCommandProps {
  copiedLabel: string;
  copyFailedLabel: string;
  copyLabel: string;
  value: string;
}

type CopyStatus = "copied" | "failed" | "idle";

async function copyText(value: string): Promise<boolean> {
  let textarea: HTMLTextAreaElement | undefined;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }

    textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea?.remove();
  }
}

export function CopyCommand({ copiedLabel, copyFailedLabel, copyLabel, value }: CopyCommandProps) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const statusLabel =
    status === "copied" ? copiedLabel : status === "failed" ? copyFailedLabel : copyLabel;

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  async function handleCopy() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    const copied = await copyText(value);
    setStatus(copied ? "copied" : "failed");
    resetTimer.current = setTimeout(() => setStatus("idle"), 1800);
  }

  return (
    <button
      aria-label={statusLabel}
      className="copy-command"
      data-status={status}
      onClick={handleCopy}
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20">
        {status === "copied" ? (
          <path d="m4.5 10.5 3.2 3.2 7.8-8" />
        ) : (
          <>
            <rect height="10" rx="2" width="10" x="6" y="3" />
            <path d="M4 7H3.5A1.5 1.5 0 0 0 2 8.5v8A1.5 1.5 0 0 0 3.5 18h8a1.5 1.5 0 0 0 1.5-1.5V16" />
          </>
        )}
      </svg>
      <span aria-live="polite">{statusLabel}</span>
    </button>
  );
}
