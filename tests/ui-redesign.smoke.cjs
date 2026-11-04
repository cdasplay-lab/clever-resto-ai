/* Local UI smoke checks. All Supabase HTTP/WebSocket traffic is intercepted;
 * the fixture never reads a real session or writes a real restaurant/order.
 * Run with Node 24 + Playwright and an installed Chromium:
 *   node tests/ui-redesign.smoke.cjs
 * Optional: MADA_TEST_CHROMIUM, MADA_QA_OUTPUT, CODEX_PRIMARY_RUNTIME_NODE_MODULES.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");
const { chromium } = require(
  require.resolve("playwright", {
    paths: [root, process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean),
  }),
);
const output =
  process.env.MADA_QA_OUTPUT || path.join(require("node:os").tmpdir(), "mada-ui-smoke");
fs.mkdirSync(output, { recursive: true });
const now = new Date().toISOString();
const restaurantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const convId = "33333333-3333-4333-8333-333333333333";
const end = new Date(Date.now() + 86400000 * 20).toISOString();
const restaurant = {
  id: restaurantId,
  name: "2in1",
  owner_id: userId,
  created_at: now,
  is_active: true,
  description: "مطعم تجريبي",
  language: "ar",
  tone: "ودود ومحترف",
  currency: "IQD",
  min_order: 0,
  feature_flags: {},
  open_hours: null,
  telegram_bot_username: "demo_bot",
  telegram_bot_token: null,
  whatsapp_phone_number_id: null,
  menu_image_urls: [],
  menu_image_url: null,
  platform_webhook_url: null,
  platform_webhook_secret: null,
  google_maps_url: null,
  latitude: null,
  longitude: null,
};
const subscription = {
  id: "sub",
  status: "active",
  period_start: now,
  period_end: end,
  plan_code: "pro",
  plan_name: "الاحترافي",
  price_iqd: 0,
  max_branches: 3,
  max_ai_replies: 1000,
  max_confirmed_orders: 1000,
  features: {},
};
const conv = {
  id: convId,
  restaurant_id: restaurantId,
  channel: "telegram",
  customer_name: "أحمد",
  customer_handle: "demo",
  state: "confirm",
  is_bot_paused: false,
  last_message_at: now,
  created_at: now,
};
const health = {
  total_runs_24h: 4,
  errors_24h: 0,
  avg_latency_ms: 400,
  tool_calls_24h: 3,
  recent_logs: [],
};
const TAB_LABELS = {
  overview: "مطعمك، بنظرة واحدة.",
  orders: "الطلبات",
  conversations: "المحادثات",
  menu: "المنيو",
  branches: "الفروع",
  customers: "الزبائن",
  marketing: "التسويق",
  combos: "الكومبوهات",
  social: "ستوري وتعليقات",
  channels: "القنوات",
  analytics: "التحليلات",
  subscription: "الاشتراك",
  health: "صحة الوكيل",
  complaints: "الشكاوى",
  integration: "تكامل API",
  settings: "الإعدادات",
};

(async () => {
  const { createServer } = await import(
    pathToFileURL(require.resolve("vite", { paths: [root] })).href
  );
  const server = await createServer({
    root,
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "error",
  });
  let browser;
  const pages = [];
  const errors = [];
  const writes = [];
  const orders = [
    {
      id: "10480000-0000-4000-8000-000000000001",
      restaurant_id: restaurantId,
      customer_name: "أحمد",
      customer_phone: null,
      status: "pending",
      total: 14000,
      created_at: now,
      delivery_address: "رحيموا",
      conversation_id: convId,
      branch_id: "branch",
      items: [{ name: "برجر دجاج", qty: 2, price: 7000 }],
      meta: {},
    },
    {
      id: "10470000-0000-4000-8000-000000000002",
      restaurant_id: restaurantId,
      customer_name: "سارة",
      customer_phone: null,
      status: "preparing",
      total: 18000,
      created_at: now,
      delivery_address: "كركوك",
      conversation_id: convId,
      branch_id: "branch",
      items: [{ name: "وجبة برجر", qty: 2, price: 9000 }],
      meta: {},
    },
  ];
  try {
    await server.listen();
    const address = server.httpServer.address();
    const base = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({
      executablePath: process.env.MADA_TEST_CHROMIUM || undefined,
      headless: true,
      args: [
        "--no-sandbox",
        "--single-process",
        "--no-zygote",
        "--in-process-gpu",
        "--use-gl=angle",
        "--use-angle=swiftshader",
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: "ar-IQ",
      timezoneId: "Asia/Baghdad",
    });
    await context.routeWebSocket(/supabase\.co/, (socket) => socket.close());
    await context.route("https://bxebeiadccrbnaqsniko.supabase.co/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        method = request.method();
      const object = request.headers().accept?.includes("vnd.pgrst.object");
      let data = [],
        count = 0;
      const table = url.pathname.split("/").pop();
      if (url.pathname.includes("/auth/v1/"))
        data = {
          id: userId,
          aud: "authenticated",
          role: "authenticated",
          email: "demo@example.invalid",
          app_metadata: {},
          user_metadata: {},
        };
      else if (url.pathname.includes("/functions/v1/track-order"))
        data = {
          short_id: "1048",
          status: "preparing",
          eta_minutes: 25,
          remaining_minutes: 20,
          items: orders[0].items,
          subtotal: 14000,
          total: 14000,
          currency: "د.ع",
          restaurant_name: "2in1",
          branch_name: "الفرع الرئيسي",
          customer_name: "أحمد",
          customer_phone_masked: null,
          delivery_address_masked: "رحيموا",
          created_at: now,
        };
      else if (url.pathname.includes("/functions/v1/")) data = { ok: true };
      else if (url.pathname.includes("/rpc/")) {
        if (table === "is_platform_admin") data = true;
        else if (table === "get_my_subscription")
          data = {
            subscription,
            usage: { ai_replies_used: 4, confirmed_orders_used: 2, branches_used: 1 },
          };
        else if (table === "get_bot_health") data = health;
        else if (table === "admin_finance_summary")
          data = { mrr_iqd: 0, active_subs: 1, suspended_subs: 0, expiring_soon: [] };
        else if (table === "admin_bot_health_all")
          data = [
            {
              ...health,
              restaurant_id: restaurantId,
              restaurant_name: "2in1",
              is_active: true,
              bot_connected: true,
              last_activity_at: now,
            },
          ];
      } else if (table === "restaurants") data = object ? restaurant : [restaurant];
      else if (table === "orders") {
        if (method === "PATCH") {
          const patch = request.postDataJSON();
          writes.push(patch);
          const id = url.searchParams.get("id")?.replace(/^eq\./, "");
          const item = orders.find((order) => order.id === id);
          if (item) item.status = patch.status;
          data = object ? { id } : [{ id }];
        } else {
          data = orders;
          count = orders.length;
        }
      } else if (table === "conversations") {
        data = [conv];
        count = 1;
      } else if (table === "messages")
        data = object
          ? { content: "أريد برجرين دجاج", role: "user" }
          : [
              {
                id: "message",
                conversation_id: convId,
                role: "user",
                content: "أريد برجرين دجاج",
                created_at: now,
              },
            ];
      else if (table === "branches")
        data = [
          {
            id: "branch",
            restaurant_id: restaurantId,
            name: "الفرع الرئيسي",
            address: "كركوك",
            is_active: true,
            open_hours: {},
            delivery_zones: [],
          },
        ];
      else if (table === "restaurant_subscriptions")
        data = [
          {
            ...subscription,
            restaurant_id: restaurantId,
            plans: {
              code: "pro",
              name_ar: "الاحترافي",
              max_ai_replies: 1000,
              max_confirmed_orders: 1000,
            },
          },
        ];
      else if (table === "profiles") data = [{ id: userId, email: "demo@example.invalid" }];
      else if (table === "menu_items")
        data = [
          {
            id: "menu",
            restaurant_id: restaurantId,
            name: "برجر دجاج",
            category: "البرجر",
            price: 7000,
            is_available: true,
            image_url: null,
            options: [],
          },
        ];
      if (Array.isArray(data) && !count) count = data.length;
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "content-range",
          "content-range": `0-${Math.max(0, count - 1)}/${count}`,
        },
        body: method === "HEAD" ? "" : JSON.stringify(data),
      });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    const noOverflow = async (label) => {
      const size = await page.evaluate(() => ({
        width: innerWidth,
        content: document.documentElement.scrollWidth,
      }));
      assert.ok(
        size.content <= size.width + 2,
        `${label}: horizontal overflow ${JSON.stringify(size)}`,
      );
    };
    for (const route of [
      "/",
      "/auth",
      "/privacy",
      "/terms",
      "/data-deletion",
      "/reset-password",
      "/track/demo",
    ]) {
      await page.goto(base + route, { waitUntil: "networkidle" });
      await noOverflow(route + " desktop");
      assert.ok((await page.locator("body").innerText()).includes("MADA"), route + " branding");
      pages.push(route);
    }
    await page.goto(base + "/");
    await page.screenshot({ path: path.join(output, "website-desktop.png"), fullPage: true });
    await page.getByRole("button", { name: /أكد الطلب التجريبي/ }).click();
    assert.ok(await page.getByText("لم يُرسل طلب حقيقي للمطعم.").isVisible());
    const token = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(
        JSON.stringify({
          sub: userId,
          aud: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 86400,
        }),
      ).toString("base64url"),
      "fixture-only",
    ].join(".");
    await context.addInitScript(
      ({ token, userId }) =>
        localStorage.setItem(
          "sb-bxebeiadccrbnaqsniko-auth-token",
          JSON.stringify({
            access_token: token,
            refresh_token: "fixture-only",
            expires_at: Math.floor(Date.now() / 1000) + 86400,
            expires_in: 86400,
            token_type: "bearer",
            user: {
              id: userId,
              aud: "authenticated",
              role: "authenticated",
              email: "demo@example.invalid",
              app_metadata: {},
              user_metadata: {},
            },
          }),
        ),
      { token, userId },
    );
    await page.goto(base + "/dashboard");
    await page.getByRole("heading", { name: "مطعمك، بنظرة واحدة." }).waitFor();
    await page.getByRole("heading", { name: "الطلبات الجارية" }).waitFor();
    await page.screenshot({ path: path.join(output, "dashboard-desktop.png"), fullPage: true });
    await page.getByRole("button", { name: "قبول الطلب", exact: true }).click();
    await page.getByRole("button", { name: "بدء التحضير", exact: true }).waitFor();
    assert.equal(writes.length, 1, "one status mutation per acceptance");
    assert.equal(writes[0].status, "confirmed");
    for (const [tab, title] of Object.entries(TAB_LABELS)) {
      await page.goto(base + `/dashboard?tab=${tab}`);
      await page.getByRole("heading", { level: 1, name: title, exact: true }).waitFor();
      await noOverflow(tab + " desktop");
      assert.equal(
        await page.locator(".mada-sidebar .mada-nav-item[aria-current='page']").count(),
        1,
        tab + " navigation selection",
      );
      pages.push("dashboard:" + tab);
    }
    await page.goto(base + "/dashboard?tab=invalid");
    await page.getByRole("heading", { name: "مطعمك، بنظرة واحدة." }).waitFor();
    await page.getByRole("button", { name: /أحمد.*يتولى الرد الوكيل/ }).click();
    await page.getByRole("button", { name: "استلام المحادثة", exact: true }).waitFor();
    assert.ok(page.url().includes("conv="), "conversation deep link preserved");
    await page.goto(base + "/admin");
    await page.getByRole("heading", { level: 1, name: "لوحة السوبر أدمن" }).waitFor();
    await noOverflow("admin desktop");
    pages.push("/admin");
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of [
      "/",
      "/auth",
      "/privacy",
      "/terms",
      "/data-deletion",
      "/reset-password",
      "/track/demo",
      "/admin",
    ]) {
      await page.goto(base + route, { waitUntil: "networkidle" });
      await noOverflow(route + " mobile");
    }
    await page.goto(base + "/dashboard");
    await page.getByRole("heading", { name: "الطلبات الجارية" }).waitFor();
    await noOverflow("dashboard mobile");
    await page.screenshot({ path: path.join(output, "dashboard-mobile.png"), fullPage: true });
    await page.getByRole("button", { name: "المزيد", exact: true }).click();
    await page.getByRole("heading", { name: "أقسام مطعمك" }).waitFor();
    for (const label of Object.values(TAB_LABELS).slice(1))
      assert.ok(
        await page.getByRole("button", { name: label, exact: false }).count(),
        `mobile destination ${label}`,
      );
    await noOverflow("more mobile");
    await page.screenshot({ path: path.join(output, "sections-mobile.png"), fullPage: true });
    for (const [tab, title] of Object.entries(TAB_LABELS)) {
      await page.goto(base + `/dashboard?tab=${tab}`);
      await page.getByRole("heading", { level: 1, name: title, exact: true }).waitFor();
      await noOverflow(tab + " mobile");
    }
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/", "/dashboard"]) {
        await page.goto(base + route, { waitUntil: "networkidle" });
        await noOverflow(`${route} at ${width}px`);
      }
    }
    assert.deepEqual(errors, [], "no browser runtime errors");
    console.log(
      JSON.stringify(
        {
          ok: true,
          screens: pages.length,
          desktop: "1440x1000",
          mobile: "390x844",
          statusMutations: writes.length,
          errors,
          output,
        },
        null,
        2,
      ),
    );
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
