import type { Locale } from "../../lib/i18n";

const figureCopy = {
  en: {
    pipelineTitle: "From source to committed pages",
    pipelineSteps: [
      "HTML + CSS",
      "Sanitize + resolve assets",
      "Measure + paginate",
      "Commit complete pages",
      "Preview + print",
    ],
    pipelineCaption:
      "Core prepares and measures in a temporary staging frame. Only a complete generation reaches the persistent reader frame.",
    timelineAlt:
      "Two update outcomes. On success, the reader frame shows Generation 1 while the staging frame prepares Generation 2, then switches in one synchronous commit. On failure, cancellation, or a newer update, staging is discarded and Generation 1 remains visible.",
    timelineCaption:
      "If preparation fails or a newer update supersedes it, the staging frame is discarded and Generation 1 remains visible.",
  },
  ko: {
    pipelineTitle: "원본에서 확정된 페이지까지",
    pipelineSteps: [
      "HTML + CSS",
      "정제 + 자산 확인",
      "측정 + 페이지 분할",
      "완성된 페이지 확정",
      "미리보기 + 인쇄",
    ],
    pipelineCaption:
      "Core는 임시 작업 프레임에서 준비하고 측정합니다. 완성된 세대만 독자가 보는 영구 프레임으로 옮깁니다.",
    timelineAlt:
      "갱신의 두 결과. 성공하면 준비 프레임에서 2세대를 만드는 동안 독자 프레임은 1세대를 보여 주고, 한 번의 동기 확정으로 2세대로 바뀝니다. 실패·취소되거나 새 갱신이 오면 준비 프레임을 버리고 1세대가 그대로 보입니다.",
    timelineCaption:
      "준비가 실패하거나 더 새로운 갱신이 도착하면 작업 프레임을 버리고 1세대를 그대로 보여줍니다.",
  },
} as const;

type FigureLocale = Extract<Locale, "en" | "ko">;

export function PipelineFigure({ locale }: { locale: FigureLocale }) {
  const copy = figureCopy[locale];
  return (
    <figure className="blog-figure">
      <figcaption className="blog-figure-title">{copy.pipelineTitle}</figcaption>
      <ol className="blog-pipeline">
        {copy.pipelineSteps.map((step, index) => (
          <li key={step}>
            <span className="blog-step-number">{String(index + 1).padStart(2, "0")}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="blog-figure-caption">{copy.pipelineCaption}</p>
    </figure>
  );
}

export function GenerationFigure({ locale }: { locale: FigureLocale }) {
  const copy = figureCopy[locale];
  return (
    <figure className="blog-illustration">
      <picture>
        <source
          media="(max-width: 640px)"
          srcSet={`/images/articles/how-imposia-works-${locale}-mobile.png`}
          width="343"
          height={locale === "ko" ? "802" : "857"}
        />
        <img
          src={`/images/articles/how-imposia-works-${locale}-desktop.png`}
          width="780"
          height={locale === "ko" ? "783" : "798"}
          loading="lazy"
          decoding="async"
          alt={copy.timelineAlt}
        />
      </picture>
      <figcaption className="blog-figure-caption">{copy.timelineCaption}</figcaption>
    </figure>
  );
}
