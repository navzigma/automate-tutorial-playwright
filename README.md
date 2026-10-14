# playwright-project

End-to-end tests written with [Playwright](https://playwright.dev/), run on Chromium, Firefox and WebKit.

## Test suites

| Folder | What it covers |
| --- | --- |
| `tests/login` | Login |
| `tests/register` | Registration |
| `tests/withdraw` | Withdrawal |
| `tests/create-rule` | Back-office rule creation (point, rate and referral rules) |
| `tests/pages` | Page objects shared by the specs |

## Setup

```sh
pnpm install
pnpm exec playwright install --with-deps
```

Create a `.env` file in the project root (it is git-ignored) with:

```sh
LOGIN_USERNAME=
LOGIN_PASSWORD=
BO_USERNAME=
BO_PASSWORD=
BO_OTP_CONFIG=
RULE_PROVIDER=
```

## Running tests

```sh
pnpm exec playwright test                       # all tests, all browsers
pnpm exec playwright test tests/login           # one suite
pnpm exec playwright test --project=chromium    # one browser
pnpm exec playwright test --ui                  # interactive UI mode
pnpm exec playwright show-report                # open the last HTML report
```

## CI

GitHub Actions runs the suite using `.github/workflows/playwright.yml`.
