import defaultMdxComponents from "fumadocs-ui/mdx";

export type MdxComponents = Record<string, unknown>;

export function getMDXComponents(components?: MdxComponents): MdxComponents {
  return {
    ...defaultMdxComponents,
    ...components,
  };
}
