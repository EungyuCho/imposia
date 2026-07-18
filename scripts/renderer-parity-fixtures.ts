import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ParityFixture {
  readonly name: string;
  readonly file: string;
  readonly bodyMarkers: readonly string[];
  readonly decorations?: {
    readonly header?: readonly string[];
    readonly footer?: readonly string[];
  };
}

const fixtureDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/parity",
);

export const rendererParityFixtures: readonly ParityFixture[] = [
  {
    name: "ordered-pages",
    file: path.join(fixtureDirectory, "ordered-pages.html"),
    bodyMarkers: ["PARITY-ORDER-ONE", "PARITY-ORDER-TWO", "PARITY-ORDER-THREE"],
  },
  {
    name: "recto-blank",
    file: path.join(fixtureDirectory, "recto-blank.html"),
    bodyMarkers: ["PARITY-RECTO-ONE", "PARITY-RECTO-TWO"],
  },
  {
    name: "decorations",
    file: path.join(fixtureDirectory, "decorations.html"),
    bodyMarkers: ["PARITY-DECORATION-ONE", "PARITY-DECORATION-TWO"],
    decorations: {
      header: ["PARITY-HEADER"],
      footer: ["PARITY-FOOTER"],
    },
  },
  {
    name: "sanitization-warning",
    file: path.join(fixtureDirectory, "sanitization-warning.html"),
    bodyMarkers: ["PARITY-WARNING"],
  },
];
