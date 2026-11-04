# MADA AI interface redesign

Carbon, warm ivory and lime, based on the approved desktop/mobile concepts.
This change updates the existing application; it does not replace its backend.

## Coverage

| Route | Updated interface |
| --- | --- |
| `/` | Responsive landing, product preview, interactive simulated order, features, plans and contact |
| `/auth` | Sign in, signup, Google/Apple buttons and password-recovery request |
| `/reset-password` | Password-recovery form in the shared account layout |
| `/dashboard` | Desktop sidebar, mobile navigation, all-sections screen and live overview |
| `/admin` | Platform overview, restaurants, health and financial tabs; existing access guard and confirmation dialogs retained |
| `/track/$orderId` | Branded public order tracking, loading and error states |
| `/privacy` | Shared legal layout; policy text/date retained |
| `/terms` | Shared legal layout; policy text/date retained |
| `/data-deletion` | Shared legal layout; policy text/date retained |
| Missing/failed routes | Arabic navigation and recovery messages |

All 16 restaurant destinations remain available: overview, orders, conversations,
menu, branches, customers, marketing, combos, social, channels, analytics,
subscription, health, complaints, integration and settings. Desktop and mobile
menus share one definition. Router-managed `tab` and `conv` parameters retain
direct links and browser navigation; invalid tabs fall back to overview.

The overview reads real orders, conversations, subscription/configuration and
health data. It does not render the example counts from the concept images.
Configuration labels are not a claim that a channel passed a live health check.
Order actions use existing status values and the existing notification function,
with a previous-status guard against concurrent acceptance.

The primary ink token stays legible on ivory; lime action buttons use a separate
token. Shared controls, cards, menus and dark-mode tokens apply throughout the
secondary tabs. Existing customer data, geolocation and delivery logic, channel
credentials, security checks and Edge Functions are not migrated or replaced.
The local restaurant banner is an optimized WebP; the previous missing landing
image/video dependencies and animation-heavy landing are no longer loaded.

## Verification

- Production build and TypeScript checks.
- Existing 19 checkout regression tests.
- `tests/ui-redesign.smoke.cjs`: public routes, all 16 dashboard sections,
  admin, invalid tabs, conversation links, one guarded order-status action,
  and mobile all-sections navigation.
- UI checked at 1440 and 390 pixels, with additional overflow checks at 360,
  768 and 1280 pixels.

The UI smoke script intercepts **all** Supabase HTTP/WebSocket traffic. Its
sessions, customers and orders are fixtures. It performs no production writes;
these checks do not prove a live Telegram/Meta integration or Lovable deployment.
Run it with Node 24, Vite dependencies, Playwright and Chromium installed:

```sh
node tests/ui-redesign.smoke.cjs
```

Optional variables: `MADA_TEST_CHROMIUM` selects a local Chromium binary and
`MADA_QA_OUTPUT` selects the screenshot directory. No real credentials needed.

## Lovable handoff

Sync the merged `main` branch and publish the frontend. No new database migration,
API secret, Edge Function or subscription change is required for this redesign.
Before publishing, review one actual restaurant's overview, order details,
handoff/resume, menu editor, delivery-location fields and subscription view.
