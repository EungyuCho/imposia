import type { RenderWarning } from "./types.js";

export type WarningInput = Omit<RenderWarning, "severity">;

interface PendingWarning {
  order: number;
  sequence: number;
  warning: RenderWarning;
}

function identity(warning: WarningInput): string {
  return [warning.code, warning.property ?? "", warning.value ?? ""].join("\u0000");
}

export interface WarningCollector {
  add(warning: WarningInput, order?: number): boolean;
  finish(): RenderWarning[];
}

export function createWarningCollector(): WarningCollector {
  const pending: PendingWarning[] = [];
  const seen = new Set<string>();
  let sequence = 0;

  return {
    add(warning, order = Number.MAX_SAFE_INTEGER) {
      const key = identity(warning);
      if (seen.has(key)) return false;
      seen.add(key);
      pending.push({
        order,
        sequence,
        warning: { severity: "warning", ...warning },
      });
      sequence += 1;
      return true;
    },
    finish() {
      return pending
        .sort((left, right) => left.order - right.order || left.sequence - right.sequence)
        .map((item) => item.warning);
    },
  };
}
