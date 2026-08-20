import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Callout } from "fumadocs-ui/components/callout";
import { Card, Cards } from "fumadocs-ui/components/card";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";

export type MdxComponents = Record<string, unknown>;

/**
 * Documentation components available to every MDX page without an import.
 * Keep this list small and purposeful: each entry should carry a distinct
 * documentation job, so a page never has two ways to express one thing.
 *
 * - `Steps`/`Step` — an ordered procedure the reader performs.
 * - `Tabs`/`Tab` — the same task expressed for different package managers.
 * - `Cards`/`Card` — navigation between pages, not decoration.
 * - `Callout` — a constraint the reader will otherwise discover by failing.
 * - `Accordions`/`Accordion` — detail that most readers should skip.
 */
const docsComponents = {
  Accordion,
  Accordions,
  Callout,
  Card,
  Cards,
  Step,
  Steps,
  Tab,
  Tabs,
} satisfies MdxComponents;

export function getMDXComponents(components?: MdxComponents): MdxComponents {
  return {
    ...defaultMdxComponents,
    ...docsComponents,
    ...components,
  };
}
