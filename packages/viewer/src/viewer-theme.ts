export type ViewerThemeProperty = `--imposia-viewer-${string}`;

export type ViewerTheme = Readonly<Partial<Record<ViewerThemeProperty, string>>>;

interface OriginalThemeValue {
  value: string;
  priority: string;
}

export interface ViewerThemeBinding {
  set(theme?: ViewerTheme): void;
  destroy(): void;
}

const THEME_PROPERTY_PATTERN = /^--imposia-viewer-[a-z0-9-]+$/u;

function themeEntries(theme: ViewerTheme | undefined): readonly [ViewerThemeProperty, string][] {
  if (theme === undefined) return [];
  if (theme === null || typeof theme !== "object" || Array.isArray(theme)) {
    throw new TypeError("Viewer theme must be an object of --imposia-viewer-* properties.");
  }
  const entries = Object.entries(theme);
  for (const [property, value] of entries) {
    if (!THEME_PROPERTY_PATTERN.test(property) || typeof value !== "string") {
      throw new TypeError("Viewer theme entries must be string --imposia-viewer-* properties.");
    }
  }
  return entries as readonly [ViewerThemeProperty, string][];
}

export function validateViewerTheme(theme?: ViewerTheme): void {
  themeEntries(theme);
}

export function bindViewerTheme(
  element: HTMLElement,
  initialTheme?: ViewerTheme,
): ViewerThemeBinding {
  const originals = new Map<ViewerThemeProperty, OriginalThemeValue>();
  let active = new Set<ViewerThemeProperty>();
  let destroyed = false;

  const restore = (property: ViewerThemeProperty): void => {
    const original = originals.get(property);
    if (original === undefined || original.value === "") {
      element.style.removeProperty(property);
      return;
    }
    element.style.setProperty(property, original.value, original.priority);
  };

  const set = (theme?: ViewerTheme): void => {
    if (destroyed) return;
    const entries = themeEntries(theme);
    const next = new Set(entries.map(([property]) => property));
    for (const property of active) {
      if (!next.has(property)) restore(property);
    }
    for (const [property, value] of entries) {
      if (!originals.has(property)) {
        originals.set(property, {
          value: element.style.getPropertyValue(property),
          priority: element.style.getPropertyPriority(property),
        });
      }
      element.style.setProperty(property, value);
    }
    active = next;
  };

  set(initialTheme);
  return {
    set,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const property of active) restore(property);
      active.clear();
    },
  };
}
