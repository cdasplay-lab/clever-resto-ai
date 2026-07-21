import assert from "node:assert/strict";
import {
  cartFingerprint,
  classifyOrderConfirmation,
  CONFIRMATION_TTL_MS,
  isConfirmationFresh,
  sha256Hex,
} from "./order-domain.ts";

const cart = [
  {
    menu_item_id: "item-1",
    name: "برغر",
    qty: 2,
    unit_price: 7500,
    selected_options: [
      { group: "إضافة", choice: "جبن" },
      { group: "حجم", choice: "كبير" },
    ],
  },
];

Deno.test("order confirmation rejects corrections even when they include an affirmative word", () => {
  assert.equal(classifyOrderConfirmation("نعم أكد الطلب"), "confirmed");
  assert.equal(classifyOrderConfirmation("okay"), "confirmed");
  assert.equal(classifyOrderConfirmation("لا، تمام بس غير العنوان"), "rejected");
  assert.equal(classifyOrderConfirmation("خليني أفكر"), "ambiguous");
});

Deno.test("order confirmation expires at the deterministic ten-minute boundary", () => {
  const now = Date.parse("2026-07-21T12:10:00.000Z");
  assert.equal(
    isConfirmationFresh("2026-07-21T12:00:00.000Z", now, CONFIRMATION_TTL_MS),
    true,
  );
  assert.equal(
    isConfirmationFresh("2026-07-21T11:59:59.999Z", now, CONFIRMATION_TTL_MS),
    false,
  );
  assert.equal(isConfirmationFresh("not-a-date", now), false);
});

Deno.test("cart fingerprint ignores option ordering but binds order-changing fields", () => {
  const delivery = {
    address: "بغداد - المنصور",
    phone: "+9647700000000",
    payment_method: "cash" as const,
  };
  const original = cartFingerprint(cart, delivery, "branch-1", " علي ");
  const reorderedOptions = cartFingerprint(
    [{ ...cart[0], selected_options: [...cart[0].selected_options].reverse() }],
    delivery,
    "branch-1",
    "علي",
  );
  const changedQuantity = cartFingerprint(
    [{ ...cart[0], qty: 3 }],
    delivery,
    "branch-1",
    "علي",
  );
  const changedBranch = cartFingerprint(cart, delivery, "branch-2", "علي");

  assert.equal(original, reorderedOptions);
  assert.notEqual(original, changedQuantity);
  assert.notEqual(original, changedBranch);
});

Deno.test("sha256Hex produces a stable 256-bit preview token", async () => {
  assert.equal(
    await sha256Hex("clever-resto"),
    "b9b7ef3d62868f6f832c527e7570003359cc59e1c123dad1670fa5b4a941e148",
  );
});
