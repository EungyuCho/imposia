import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import type { MetaFunction } from "react-router";
import { Link, Navigate, useParams } from "react-router";
import { isSupportedLocale } from "../../components/marketing-copy";
import { baseOptions } from "../../lib/layout.shared";
import { source } from "../../lib/source";
import { getMDXComponents } from "../../mdx-components";

const notFoundCopy = {
  en: {
    description: "The requested documentation page does not exist.",
    link: "Return to the documentation",
    title: "Page not found",
  },
  ko: {
    description: "요청한 문서 페이지를 찾을 수 없습니다.",
    link: "문서 첫 페이지로 돌아가기",
    title: "페이지를 찾을 수 없습니다",
  },
  "zh-CN": {
    description: "找不到你请求的文档页面。",
    link: "返回文档首页",
    title: "未找到页面",
  },
  ja: {
    description: "指定されたドキュメントページは見つかりませんでした。",
    link: "ドキュメントのトップへ戻る",
    title: "ページが見つかりません",
  },
} as const;

function pathToSlugs(path: string | undefined): string[] | undefined {
  if (!path) return undefined;
  const slugs = path.split("/").filter(Boolean);
  return slugs.length > 0 ? slugs : undefined;
}

export const meta: MetaFunction = ({ params }) => {
  const lang = params.lang;
  if (!lang || !isSupportedLocale(lang)) return [];
  const page = source.getPage(pathToSlugs(params["*"]), lang);
  if (!page) return [];

  return [
    { title: `${page.data.title} · Imposia` },
    { content: page.data.description, name: "description" },
  ];
};

export default function DocumentationRoute() {
  const params = useParams<"lang" | "*">();
  const lang = params.lang;
  if (!lang || !isSupportedLocale(lang)) {
    return <Navigate replace to="/en/docs" />;
  }

  const page = source.getPage(pathToSlugs(params["*"]), lang);
  const tree = source.getPageTree(lang);
  const missing = notFoundCopy[lang];

  return (
    <DocsLayout {...baseOptions(lang)} themeSwitch={{ enabled: false }} tree={tree}>
      {page ? (
        <DocsPage full={page.data.full} toc={page.data.toc}>
          <DocsTitle>{page.data.title}</DocsTitle>
          <DocsDescription>{page.data.description}</DocsDescription>
          <DocsBody>
            <page.data.body components={getMDXComponents()} />
          </DocsBody>
        </DocsPage>
      ) : (
        <DocsPage tableOfContent={{ enabled: false }}>
          <DocsTitle>{missing.title}</DocsTitle>
          <DocsDescription>{missing.description}</DocsDescription>
          <DocsBody>
            <p>
              <Link to={`/${lang}/docs`}>{missing.link}</Link>
            </p>
          </DocsBody>
        </DocsPage>
      )}
    </DocsLayout>
  );
}
