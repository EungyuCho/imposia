import { source as createSource, loader, type MetaData } from "fumadocs-core/source";
import type { ComponentType, ReactNode } from "react";
import type { MdxComponents } from "../mdx-components";
import { i18n } from "./i18n";

interface MdxModule {
  readonly default: ComponentType<{ readonly components?: MdxComponents }>;
  readonly frontmatter: {
    readonly description?: string;
    readonly full?: boolean;
    readonly title: string;
  };
  readonly toc: { depth: number; title: ReactNode; url: string }[];
}

const CONTENT_ROOT = "../content/docs/";

const pageModules = import.meta.glob<MdxModule>("../content/docs/**/*.{md,mdx}", {
  eager: true,
  query: { collection: "docs" },
});

const metaModules = import.meta.glob<MetaData>("../content/docs/**/*.{json,yaml}", {
  eager: true,
  import: "default",
  query: { collection: "docs" },
});

function contentPath(path: string): string {
  return path.slice(CONTENT_ROOT.length);
}

const docsSource = createSource({
  pages: Object.entries(pageModules).map(([path, module]) => ({
    type: "page" as const,
    path: contentPath(path),
    data: {
      ...module.frontmatter,
      body: module.default,
      toc: module.toc,
    },
  })),
  metas: Object.entries(metaModules).map(([path, data]) => ({
    type: "meta" as const,
    path: contentPath(path),
    data,
  })),
});

export const source = loader(docsSource, {
  baseUrl: "/docs",
  i18n,
});
