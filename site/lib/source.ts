import { source as createSource, loader, type MetaData } from "fumadocs-core/source";
import type { ComponentType, ReactNode } from "react";
import type { MdxComponents } from "../mdx-components";
import { i18n } from "./i18n";

interface MdxModule {
  default: ComponentType<{ components?: MdxComponents }>;
  frontmatter: {
    description?: string;
    full?: boolean;
    title: string;
  };
  toc: Array<{ depth: number; title: ReactNode; url: string }>;
}

const pageModules = import.meta.glob<MdxModule>("../content/docs/*.{md,mdx}", {
  eager: true,
  query: { collection: "docs" },
});

const metaModules = import.meta.glob<MetaData>("../content/docs/*.{json,yaml}", {
  eager: true,
  import: "default",
  query: { collection: "docs" },
});

function fileName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

const docsSource = createSource({
  pages: Object.entries(pageModules).map(([path, module]) => ({
    type: "page" as const,
    path: fileName(path),
    data: {
      ...module.frontmatter,
      body: module.default,
      toc: module.toc,
    },
  })),
  metas: Object.entries(metaModules).map(([path, data]) => ({
    type: "meta" as const,
    path: fileName(path),
    data,
  })),
});

export const source = loader(docsSource, {
  baseUrl: "/docs",
  i18n,
});
