export type DocumentWarningCode =
  | "OVERRIDDEN_LEGACY_BREAK"
  | "UNSUPPORTED_BREAK_VALUE"
  | "OVERRIDDEN_EMBEDDED_HEADER"
  | "OVERRIDDEN_EMBEDDED_FOOTER"
  | "UNSUPPORTED_DECORATION_TOKEN"
  | "UNSUPPORTED_CSS_FEATURE"
  | "RESOURCE_BLOCKED"
  | "RESOURCE_TIMEOUT"
  | "FONT_TIMEOUT"
  | "SCRIPT_REMOVED"
  | "PAGE_OVERFLOW"
  | "PAGE_RULE_UNSUPPORTED"
  | "BROWSER_DIFFERENCE";

export interface DocumentWarning {
  code: DocumentWarningCode;
  severity: "warning";
  message: string;
  feature?: string;
  property?: string;
  value?: string;
  recovery?: string;
  sourceIndex?: number;
}

export type WarningInput = Omit<DocumentWarning, "severity">;

interface PendingWarning {
  order: number;
  sequence: number;
  warning: DocumentWarning;
}

function identity(warning: WarningInput): string {
  return [warning.code, warning.property ?? "", warning.value ?? ""].join("\u0000");
}

export interface WarningCollector {
  add(warning: WarningInput, order?: number): boolean;
  finish(): DocumentWarning[];
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
