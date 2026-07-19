# Security Policy

Imposia processes caller-supplied HTML, CSS, and resolved assets inside a
browser publishing boundary. Security reports are handled privately so a fix
can be prepared before exploit details are disclosed.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest `0.1.x` release | Yes |
| Older releases | No |
| Unreleased `main` | Best effort |

## Reporting a vulnerability

Use GitHub's **Security > Report a vulnerability** form for this repository.
Include the affected version, reproduction steps, impact, and any suggested
mitigation. Do not include secrets, personal data, or unrelated user content.

If private vulnerability reporting is temporarily unavailable, open a public
issue titled `Security contact request` without technical or exploit details.
A maintainer will establish a private channel before requesting more
information.

Maintainers aim to acknowledge a report within five business days and provide
an initial assessment within ten. Timelines for a fix and disclosure depend on
severity, exploitability, and downstream coordination. Reporters will be
credited when desired and when disclosure is safe.

## Scope

Reports involving iframe isolation, CSP or sandbox escape, HTML/CSS
sanitization, resolver-only asset loading, Blob URL lifecycle, EPUB archive
generation, dependency vulnerabilities, or cross-document data exposure are in
scope. General support requests and unsupported CSS parity differences belong
in the public issue tracker.
