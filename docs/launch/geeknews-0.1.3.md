# GeekNews launch copy for Imposia 0.1.3

Use this copy only after `v0.1.3`, the four npm packages, and the production
demo are publicly reachable. The claims below are limited to the verified
contract; do not replace “declared flow” with “arbitrary HTML.”

## Suggested title

Imposia – CSR로 만든 HTML을 브라우저에서 페이지로 나누고 정합성을 검증하는 오픈소스

## Suggested post

웹 에디터나 리포트 빌더를 만들다 보면 현재 HTML을 A4 같은 페이지로 나누고,
각 페이지의 시작·끝 위치와 다음 페이지로 이어지는 내용이 맞는지 보장해야 합니다.
미리보기와 인쇄가 서로 다른 문서를 다시 렌더링하면 페이지 수나 내용 순서가
어긋나기 쉽습니다.

[Imposia](https://github.com/EungyuCho/imposia)는 이 문제를 브라우저 안에서
다루는 React 우선 오픈소스 라이브러리입니다. 호스트가 만든 현재 HTML/CSS를
임시 iframe에서 페이지화하고, 완성된 세대만 하나의 canonical iframe에
커밋합니다. CSR 갱신이 연속으로 들어와도 이전 커밋은 다음 세대가 완성될 때까지
유지됩니다. Viewer, 페이지 이동, 진단, 브라우저 기본 인쇄가 같은 커밋을
사용합니다.

0.1.3에서는 이 정합성을 말로만 설명하지 않고 공개 데모와 테스트로 드러냈습니다.

- 고유 토큰 96개를 여러 페이지에 걸쳐 배치합니다.
- 각 페이지의 첫 토큰, 마지막 토큰, 개수를 기록합니다.
- 모든 페이지를 다시 이었을 때 96개가 정확히 한 번씩 원문 순서대로 나오는지
  Chromium, Firefox, WebKit에서 검증합니다.
- 공개 React 데모에서 CSR 소스를 세 번 빠르게 갱신한 뒤에도 동일한 canonical
  iframe과 최종 96/96 순서를 확인할 수 있습니다.

직접 확인:

- [라이브 데모](https://imposia.pages.dev/examples/demo/index.html)
- [문서](https://imposia.pages.dev/ko/docs)
- [GitHub](https://github.com/EungyuCho/imposia)
- [npm 패키지](https://www.npmjs.com/org/imposia)

현재 범위도 명확히 제한했습니다. Chromium이 구조적 페이지네이션의 기준이며,
임의의 모든 HTML/CSS를 손실 없이 처리한다고 주장하지 않습니다. 브라우저마다
물리적인 페이지 번호가 같다고 보장하지 않고, Node/CLI 렌더러나 PDF 바이트 API도
제공하지 않습니다. 지원 범위를 벗어나면 가능한 한 성공처럼 근사하지 않고 타입이
있는 경고를 반환합니다. EPUB은 메인 기능이 아니라, 함께 커밋된 의미 구조에서
만드는 리플로우형 보조 출력입니다.

테이블, Grid/Flex, 다단, 한중일 조판처럼 실제 서비스에서 자주 부딪히는 페이지
경계 사례를 더 모으고 있습니다. 재현 가능한 HTML/CSS 예제가 있다면 이슈로
공유해 주세요.

## Verified facts

- Release candidate: `0.1.3`
- Public package family: `@imposia/core`, `@imposia/viewer`,
  `@imposia/client`, `@imposia/react`
- Full gate: `CI=true pnpm check`
- Browser matrix: 354 passed, 120 intentional skips, 0 failed, 474 total
- Site matrix: 8 passed
- Unit/integration matrix: 23 passed
- Production dependency audit: no known vulnerabilities
- License audit: 386 installed packages accepted by the reviewed policy

## Publish checklist

- [ ] PR is merged after GitHub Verify, CodeQL, and CodeRabbit pass.
- [ ] Protected `Release` workflow completes for exact version `0.1.3`.
- [ ] npm shows all four packages at `0.1.3` with provenance.
- [ ] GitHub Release `v0.1.3` contains four tarballs and `SHA256SUMS`.
- [ ] `https://imposia.pages.dev` serves the new continuity-first homepage.
- [ ] The live demo opens with `96 / 96`, page ranges, and the CSR burst action.
- [ ] Every link in the suggested post is checked in a signed-out browser.
- [ ] The post retains the compatibility limits above.
