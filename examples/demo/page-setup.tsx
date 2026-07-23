import type { PageOrientation, PageSize } from "@imposia/react";

type PagePresetId = "a5" | "a4" | "a3" | "b5" | "b4" | "b3" | "b2" | "b1" | "letter";

export type PagePreset = Readonly<{
  id: PagePresetId;
  label: string;
  dimensions: string;
  size: PageSize;
}>;

export const DEFAULT_PAGE_PRESET = {
  id: "a4",
  label: "A4",
  dimensions: "210 × 297 mm",
  size: "A4",
} as const satisfies PagePreset;

const pagePresets = [
  { id: "a5", label: "A5", dimensions: "148 × 210 mm", size: { width: "148mm", height: "210mm" } },
  DEFAULT_PAGE_PRESET,
  { id: "a3", label: "A3", dimensions: "297 × 420 mm", size: { width: "297mm", height: "420mm" } },
  {
    id: "b5",
    label: "ISO B5",
    dimensions: "176 × 250 mm",
    size: { width: "176mm", height: "250mm" },
  },
  {
    id: "b4",
    label: "ISO B4",
    dimensions: "250 × 353 mm",
    size: { width: "250mm", height: "353mm" },
  },
  {
    id: "b3",
    label: "ISO B3",
    dimensions: "353 × 500 mm",
    size: { width: "353mm", height: "500mm" },
  },
  {
    id: "b2",
    label: "ISO B2",
    dimensions: "500 × 707 mm",
    size: { width: "500mm", height: "707mm" },
  },
  {
    id: "b1",
    label: "ISO B1",
    dimensions: "707 × 1000 mm",
    size: { width: "707mm", height: "1000mm" },
  },
  { id: "letter", label: "Letter", dimensions: "8.5 × 11 in", size: "Letter" },
] as const satisfies readonly PagePreset[];

const pageOrientations = [
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
] as const satisfies readonly { readonly value: PageOrientation; readonly label: string }[];

type PageSetupProps = Readonly<{
  preset: PagePreset;
  orientation: PageOrientation;
  onPresetChange: (preset: PagePreset) => void;
  onOrientationChange: (orientation: PageOrientation) => void;
}>;

export function PageSetup({
  preset,
  orientation,
  onPresetChange,
  onOrientationChange,
}: PageSetupProps) {
  return (
    <>
      <label className="demo-page-size">
        <span>Page size</span>
        <select
          value={preset.id}
          onChange={(event) => {
            const nextPreset = pagePresets[event.currentTarget.selectedIndex];
            if (nextPreset !== undefined) onPresetChange(nextPreset);
          }}
        >
          {pagePresets.map((candidate) => (
            <option value={candidate.id} key={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </select>
        <small>{preset.dimensions}</small>
      </label>
      <fieldset className="demo-orientation">
        <legend>Page orientation</legend>
        <div className="demo-orientation-options">
          {pageOrientations.map((candidate) => (
            <button
              type="button"
              aria-pressed={orientation === candidate.value}
              key={candidate.value}
              onClick={() => onOrientationChange(candidate.value)}
            >
              {candidate.label}
            </button>
          ))}
        </div>
        <small>Portrait by default</small>
      </fieldset>
    </>
  );
}
