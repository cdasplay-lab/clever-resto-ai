// Exercise the real legacy Edge entrypoint offline. Only imports, environment
// access, and Deno.serve are replaced; checkout functions are not duplicated.
// Node 24 supplies stripTypeScriptTypes; no test dependencies or API keys.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');

const sourcePath = process.env.AGENT_SOURCE || resolve(__dirname, '../supabase/functions/agent-run/index.ts');
const source = readFileSync(sourcePath, 'utf8').replace(/^import .*;\r?$/gm, '');

class MemoryDb {
  constructor({ coverage = false, insertError = false, previewError = false, lockError = false } = {}) {
    this.insertError = insertError;
    this.previewError = previewError;
    this.lockError = lockError;
    this.tables = {
      restaurants: [{ id: 'restaurant-1', name: 'Test', currency: 'IQD', min_order: 0, open_hours: {} }],
      branches: [{ id: 'branch-1', restaurant_id: 'restaurant-1', name: 'Main', is_active: true, min_order: 0, coverage_type: coverage ? 'radius' : 'none', coverage_radius_km: 10, latitude: 35.47, longitude: 44.39, open_hours: {} }],
      conversations: [{ id: 'conversation-1', restaurant_id: 'restaurant-1', customer_name: 'Test Customer', state: 'confirm', is_bot_paused: false,
        cart: [{ menu_item_id: 'item-1', name: 'برجر دجاج', qty: 1, unit_price: 7000 }],
        delivery: { address: 'Test address', phone: '07700000000', payment_method: 'cash', customer_location: { lat: 35.47, lng: 44.39 } },
        meta: { checkout_upsell_offered: true } }],
      orders: [], messages: [], agent_logs: [], menu_items: [], delivery_zones: [], combos: [],
    };
    this.rpcCalls = [];
  }
  addUserMessage(content) {
    const message = {
      id: `message-${this.tables.messages.length + 1}`, role: 'user', content,
      conversation_id: 'conversation-1', created_at: new Date().toISOString(),
    };
    this.tables.messages.push(message);
    return message;
  }
  from(table) {
    const db = this;
    const filters = [];
    let operation = 'select', value, max = Infinity, descending = false;
    const q = {
      select() { return q; },
      insert(v) { operation = 'insert'; value = v; return q; },
      update(v) { operation = 'update'; value = v; return q; },
      eq(k, v) { filters.push(r => r[k] === v); return q; },
      neq(k, v) { filters.push(r => r[k] !== v); return q; },
      in(k, vs) { filters.push(r => vs.includes(r[k])); return q; },
      not() { return q; }, gte() { return q; }, lte() { return q; },
      order(_key, opts) { descending = opts?.ascending === false; return q; },
      limit(n) { max = n; return q; },
      single() { return execute(true); }, maybeSingle() { return execute(true); },
      then(ok, bad) { return execute(false).then(ok, bad); },
    };
    async function execute(single) {
      const rows = db.tables[table] ||= [];
      if (operation === 'insert') {
        assert.notEqual(table, 'orders', 'checkout writes orders through the transaction RPC');
        const inserted = (Array.isArray(value) ? value : [value]).map(v => ({ id: `${table}-${rows.length + 1}`, created_at: new Date().toISOString(), ...structuredClone(v) }));
        rows.push(...inserted);
        return { data: structuredClone(single ? inserted[0] : inserted), error: null };
      }
      let found = rows.filter(r => filters.every(f => f(r)));
      if (operation === 'update') {
        if (table === 'conversations' && value.meta?.pending_confirmation && db.previewError) return { data: null, error: { message: 'test preview write failure' } };
        found.forEach(r => Object.assign(r, structuredClone(value)));
      }
      if (descending) found = [...found].reverse();
      found = found.slice(0, max);
      return { data: structuredClone(single ? found[0] || null : found), error: null };
    }
    return q;
  }
  async rpc(name, args) {
    this.rpcCalls.push({ name, args });
    if (name === 'claim_conversation') return this.lockError ? { data: false, error: { message: 'claim failed' } } : { data: true, error: null };
    if (name === 'consume_quota') return { data: { allowed: true }, error: null };
    if (name === 'recall_customer') return { data: { found: false }, error: null };
    if (name === 'commit_agent_checkout') {
      const previous = this.tables.orders.find(order => order.checkout_preview_id === args._preview_id);
      if (previous) return { data: { outcome: 'replayed', order_id: previous.id }, error: null };
      if (!args._expected) return { data: { outcome: 'stale_preview' }, error: null };
      if (this.insertError) return { data: null, error: { code: 'P0001' } };

      const conv = this.tables.conversations[0];
      assert.equal(args._preview_id, conv.meta.pending_confirmation.token);
      assert.equal(args._confirmation_message_id, this.tables.messages.findLast(m => m.role === 'user').id);
      const { cart, delivery, branch_id, customer_location } = args._expected;
      const total = cart.reduce((sum, item) => sum + item.qty * item.unit_price, 0);
      const id = `orders-${this.tables.orders.length + 1}`;
      this.tables.orders.push(structuredClone({
        id, checkout_preview_id: args._preview_id, items: cart, branch_id,
        delivery_address: delivery.address, total, scheduled_for: args._scheduled_for,
        meta: { customer_location },
      }));
      Object.assign(conv, {
        cart: [], delivery: {}, state: 'submitted',
        meta: { ...conv.meta, pending_confirmation: null, last_order_id: id },
      });
      return { data: { outcome: 'committed', order_id: id, total }, error: null };
    }
    return { data: null, error: null };
  }
}

function loadAgent(db, coverageCheck = () => ({ covered: true })) {
  let handler;
  const sandbox = {
    Deno: { env: { get: () => '' }, serve: fn => { handler = fn; } },
    admin: () => db,
    corsHeaders: {}, json: (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }),
    isInternalCall: () => true,
    checkBranchCoverage: coverageCheck, IQ_GOVS: [],
    embedText: async () => [],
    retryFetch: async () => { throw new Error('unexpected external request'); },
    fetch: async () => new Response('{}'),
    crypto: globalThis.crypto, TextEncoder, Response, Request, URL,
    setTimeout, clearTimeout, setInterval, clearInterval,
    console: { log() {}, warn() {}, error() {} },
  };
  vm.createContext(sandbox);
  const code = stripTypeScriptTypes(source, { mode: 'transform' });
  const api = vm.runInContext(`${code}\n;({runTool, sanitizeToolResultForModel, cartFingerprint, sha256Hex, isRestaurantLocationRequest});`, sandbox);
  return { ...api, handler: req => handler(req), setModel: fn => { sandbox.callModel = fn; } };
}

function snapshot(db) { return structuredClone(db.tables.conversations[0]); }
function restaurant(db) { return { ...structuredClone(db.tables.restaurants[0]), __branches: structuredClone(db.tables.branches) }; }
async function preview(api, db, conv = snapshot(db)) {
  const message = db.addUserMessage('هذا عنوان الطلب والدفع نقداً');
  const result = await api.runTool(db, conv, restaurant(db), 'preview_order', {}, [], [], undefined, message);
  assert.equal(result.ok, true, JSON.stringify(result));
  return { conv, result, message };
}
async function confirm(api, db, conv, token, word = 'نعم') {
  return api.runTool(db, conv, restaurant(db), 'submit_order', { confirmation_token: token }, [], [], undefined, db.addUserMessage(word));
}

test('automatic covered branch keeps the same fingerprint on the next turn', async () => {
  const db = new MemoryDb({ coverage: true });
  const api = loadAgent(db);
  const { result } = await preview(api, db);
  const next = snapshot(db);
  assert.equal(next.meta.branch_id, 'branch-1');
  const submitted = await confirm(api, db, next, result.confirmation_token);
  assert.equal(submitted.ok, true, JSON.stringify(submitted));
  assert.equal(db.tables.orders.length, 1);
  assert.equal(db.tables.orders[0].branch_id, 'branch-1');
  assert.deepEqual(db.tables.orders[0].meta.customer_location, { lat: 35.47, lng: 44.39 });
});

test('the only active branch is included in the preview and committed order', async () => {
  const db = new MemoryDb();
  const api = loadAgent(db);
  const { conv, result } = await preview(api, db);
  assert.match(result.summary, /Main/);
  assert.equal((await confirm(api, db, conv, result.confirmation_token)).ok, true);
  assert.equal(db.tables.orders[0].branch_id, 'branch-1');
});

test('changing payment preserves the shared customer location and delivery fields', async () => {
  const db = new MemoryDb();
  const api = loadAgent(db), conv = snapshot(db);
  await api.runTool(db, conv, restaurant(db), 'set_delivery_info', { payment_method: 'card_on_delivery' }, [], []);
  assert.deepEqual(structuredClone(conv.delivery.customer_location), { lat: 35.47, lng: 44.39 });
  assert.equal(conv.delivery.address, 'Test address');
  assert.equal(conv.delivery.phone, '07700000000');
  assert.equal(conv.delivery.payment_method, 'card_on_delivery');
});

test('a stale token exposes a safe recovery action instead of only ok=false', async () => {
  const db = new MemoryDb(), api = loadAgent(db);
  const { conv } = await preview(api, db);
  const result = api.sanitizeToolResultForModel(await confirm(api, db, conv, 'wrong-token'));
  assert.equal(result.ok, false);
  assert.equal(result.recovery, 'refresh_preview');
  assert.ok(result.user_message?.length > 0);
  assert.equal(db.tables.orders.length, 0);
  assert.ok(!JSON.stringify(result).includes('wrong-token'));
});

test('a changed basket requires a fresh preview and does not insert an order', async () => {
  const db = new MemoryDb(), api = loadAgent(db);
  const { conv, result } = await preview(api, db);
  conv.cart[0].qty = 2;
  const failure = api.sanitizeToolResultForModel(await confirm(api, db, conv, result.confirmation_token));
  assert.equal(failure.recovery, 'refresh_preview');
  assert.equal(db.tables.orders.length, 0);
  const refreshed = await preview(api, db, conv);
  assert.equal((await confirm(api, db, conv, refreshed.result.confirmation_token)).ok, true);
  assert.equal(db.tables.orders[0].items[0].qty, 2);
});

test('failed preview storage does not create an unusable confirmation', async () => {
  const db = new MemoryDb({ previewError: true }), api = loadAgent(db), conv = snapshot(db);
  const result = await api.runTool(db, conv, restaurant(db), 'preview_order', {}, [], [], undefined, db.addUserMessage('عنواني صحيح'));
  assert.equal(result.error_code, 'PREVIEW_SAVE_FAILED');
  assert.equal(conv.meta.pending_confirmation, undefined);
  assert.equal(db.tables.orders.length, 0);
});

for (const word of ['نعم', 'إي', 'أكد', 'نعم، أكّد الطلب']) test(`confirmation with ${word} creates one order and clears this run's basket`, async () => {
  const db = new MemoryDb(), api = loadAgent(db);
  const { conv, result } = await preview(api, db);
  const first = await confirm(api, db, conv, result.confirmation_token, word);
  assert.equal(first.ok, true);
  const again = await confirm(api, db, snapshot(db), result.confirmation_token, word);
  assert.equal(again.already_submitted, true);
  assert.equal(again.order_id, first.order_id);
  assert.match(again.message, /مثبّت مسبقاً/);
  assert.equal(db.tables.orders.length, 1);
  assert.equal(conv.state, 'submitted');
  assert.equal(conv.cart.length, 0);
  assert.equal(conv.meta.pending_confirmation, null);
});

test('a fresh preview allows identical items and replay cannot clear the new cart', async () => {
  const db = new MemoryDb(), api = loadAgent(db);
  const first = await preview(api, db);
  const basket = structuredClone(first.conv.cart);
  const delivery = structuredClone(first.conv.delivery);
  const firstOrder = await confirm(api, db, first.conv, first.result.confirmation_token, 'إي');
  Object.assign(db.tables.conversations[0], { cart: basket, delivery, state: 'collecting_items' });

  const second = await preview(api, db);
  assert.notEqual(second.result.confirmation_token, first.result.confirmation_token);
  const replay = await confirm(api, db, second.conv, first.result.confirmation_token, 'إي');
  assert.equal(replay.order_id, firstOrder.order_id);
  assert.equal(second.conv.cart.length, 1);
  assert.equal(db.tables.conversations[0].meta.pending_confirmation.token, second.result.confirmation_token);

  const secondOrder = await confirm(api, db, second.conv, second.result.confirmation_token, 'إي');
  assert.equal(secondOrder.ok, true);
  assert.notEqual(secondOrder.order_id, firstOrder.order_id);
  assert.equal(db.tables.orders.length, 2);
});

test('an approval from the preview turn cannot approve the newly generated preview', async () => {
  const db = new MemoryDb(), api = loadAgent(db), conv = snapshot(db);
  const message = db.addUserMessage('إي');
  const result = await api.runTool(db, conv, restaurant(db), 'preview_order', {}, [], [], undefined, message);
  const failure = await api.runTool(db, conv, restaurant(db), 'submit_order',
    { confirmation_token: result.confirmation_token }, [], [], undefined, message);
  assert.equal(failure.error_code, 'ORDER_CONFIRMATION_REQUIRED');
  assert.equal(db.rpcCalls.some(call => call.name === 'commit_agent_checkout'), false);
});

test('a combo suggestion cannot be mistaken for a confirmation preview', async () => {
  const db = new MemoryDb(), api = loadAgent(db);
  db.tables.conversations[0].meta.checkout_upsell_offered = false;
  db.tables.menu_items.push({ id: 'item-1', restaurant_id: 'restaurant-1', price: 7000 });
  db.tables.combos.push({
    id: 'combo-1', restaurant_id: 'restaurant-1', is_active: true, name: 'عرض', price: 6000,
    items: [{ menu_item_id: 'item-1', qty: 1 }],
  });
  const offer = await preview(api, db);
  assert.equal(offer.result.combo_suggestion.id, 'combo-1');
  assert.equal(offer.result.confirmation_token, undefined);
  assert.equal(db.tables.conversations[0].meta.pending_confirmation, null);
  const actualPreview = await preview(api, db);
  assert.ok(actualPreview.result.confirmation_token);
  assert.equal(db.tables.orders.length, 0);
});

test('negative or ambiguous messages are rejected even when the tool arguments claim approval', async () => {
  const db = new MemoryDb(), api = loadAgent(db);
  const { conv, result } = await preview(api, db);
  for (const text of ['تمام لا تأكد', 'إي بس غيّر العنوان', 'تمام؟']) {
    const args = { confirmation_token: result.confirmation_token, user_confirmation_text: 'نعم' };
    const failure = await api.runTool(db, conv, restaurant(db), 'submit_order', args, [], [], undefined, db.addUserMessage(text));
    assert.equal(failure.error_code, 'ORDER_CONFIRMATION_REQUIRED', text);
  }
  assert.equal(db.rpcCalls.some(call => call.name === 'commit_agent_checkout'), false);
});

test('changing the shared location requires a new confirmation preview', async () => {
  const db = new MemoryDb(), api = loadAgent(db);
  const { result } = await preview(api, db);
  db.tables.conversations[0].delivery.customer_location = { lat: 35.48, lng: 44.41 };
  const failure = await confirm(api, db, snapshot(db), result.confirmation_token, 'إي');
  assert.equal(failure.error_code, 'ORDER_CHANGED');
  assert.equal(db.tables.orders.length, 0);
});

test('a preview from before the migration must be refreshed', async () => {
  const db = new MemoryDb(), api = loadAgent(db), conv = snapshot(db);
  conv.meta.pending_confirmation = { token: 'ord_7b7b1d5ac58a4254', fp: 'old-fingerprint' };
  const failure = await confirm(api, db, conv, conv.meta.pending_confirmation.token);
  assert.equal(failure.recovery, 'refresh_preview');
  assert.equal(db.tables.orders.length, 0);
});

test('database failure is reported without losing the basket or claiming success', async () => {
  const db = new MemoryDb({ insertError: true }), api = loadAgent(db);
  const { conv, result } = await preview(api, db);
  const failure = api.sanitizeToolResultForModel(await confirm(api, db, conv, result.confirmation_token));
  assert.equal(failure.ok, false);
  assert.equal(failure.recovery, 'support');
  assert.match(failure.user_message, /ما كدرت أتأكد/);
  assert.equal(conv.cart.length, 1);
  assert.equal(db.tables.orders.length, 0);
});

test('a successful scheduled order also consumes the current basket', async () => {
  const db = new MemoryDb(), api = loadAgent(db);
  const { conv, result } = await preview(api, db);
  const args = { confirmation_token: result.confirmation_token, scheduled_for: new Date(Date.now() + 3600000).toISOString(), scheduled_for_human: 'بعد ساعة' };
  const scheduled = await api.runTool(db, conv, restaurant(db), 'schedule_order', args, [], [], undefined, db.addUserMessage('نعم'));
  assert.equal(scheduled.ok, true, JSON.stringify(scheduled));
  assert.equal(conv.state, 'submitted');
  assert.equal(conv.cart.length, 0);
  assert.equal(db.tables.orders.length, 1);
});

test('a failed conversation lock does not process or submit the basket', async () => {
  const db = new MemoryDb({ lockError: true }), api = loadAgent(db);
  api.setModel(async () => { throw new Error('model must not run without a lock'); });
  const response = await api.handler(new Request('https://unit.test/agent-run', { method: 'POST', body: JSON.stringify({ conversation_id: 'conversation-1' }) }));
  const body = await response.json();
  assert.equal(body.skipped, 'conversation_busy');
  assert.ok(body.reply.length > 0);
  assert.equal(db.tables.orders.length, 0);
});

test('handler finishes after commit even if the model also requested handoff', async () => {
  const db = new MemoryDb(), api = loadAgent(db);
  const { result } = await preview(api, db);
  db.addUserMessage('نعم');
  let modelCalls = 0;
  api.setModel(async () => {
    modelCalls++;
    assert.equal(modelCalls, 1, 'must not call the model after committing an order');
    return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [
      { id: 'submit-1', type: 'function', function: { name: 'submit_order', arguments: JSON.stringify({ confirmation_token: result.confirmation_token, user_confirmation_text: 'نعم' }) } },
      { id: 'handoff-1', type: 'function', function: { name: 'handoff_to_human', arguments: JSON.stringify({ reason: 'test' }) } },
    ] } }] };
  });
  const response = await api.handler(new Request('https://unit.test/agent-run', { method: 'POST', body: JSON.stringify({ conversation_id: 'conversation-1' }) }));
  const body = await response.json();
  assert.equal(modelCalls, 1);
  assert.match(body.reply, /تم استلام طلبك/);
  assert.equal(body.state, 'submitted');
  assert.equal(db.tables.orders.length, 1);
  assert.equal(db.tables.conversations[0].is_bot_paused, false);
});

test('a recoverable confirmation failure cannot automatically pause the customer for handoff', async () => {
  const db = new MemoryDb(), api = loadAgent(db);
  await preview(api, db);
  db.addUserMessage('نعم');
  let step = 0;
  api.setModel(async messages => {
    if (step++ === 0) return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [
      { id: 'bad-submit', type: 'function', function: { name: 'submit_order', arguments: JSON.stringify({ confirmation_token: 'stale', user_confirmation_text: 'نعم' }) } },
      { id: 'auto-handoff', type: 'function', function: { name: 'handoff_to_human', arguments: JSON.stringify({ reason: 'confirmation failure' }) } },
    ] } }] };
    const failure = JSON.parse(messages.at(-1).content);
    assert.equal(failure.recovery, 'refresh_preview');
    return { choices: [{ message: { role: 'assistant', content: 'أحتاج أعرض لك ملخص الطلب المحدّث قبل التثبيت.' } }] };
  });
  const response = await api.handler(new Request('https://unit.test/agent-run', { method: 'POST', body: JSON.stringify({ conversation_id: 'conversation-1' }) }));
  assert.equal(response.status, 200);
  assert.equal(db.tables.orders.length, 0);
  assert.equal(db.tables.conversations[0].is_bot_paused, false);
});

test('editing delivery invalidates a cached preview in the same model run', async () => {
  const db = new MemoryDb(), api = loadAgent(db);
  db.addUserMessage('غير العنوان');
  let step = 0;
  api.setModel(async messages => {
    const current = step++;
    if (current === 3) {
      const lastPreview = JSON.parse(messages.at(-1).content);
      assert.match(lastPreview.summary, /Updated address/);
      assert.equal(lastPreview.confirmation_token, db.tables.conversations[0].meta.pending_confirmation.token);
      return { choices: [{ message: { role: 'assistant', content: 'هذا ملخص الطلب المحدّث. أأكد الطلب؟' } }] };
    }
    const name = current === 1 ? 'set_delivery_info' : 'preview_order';
    const args = current === 1 ? { customer_name: 'Test Customer', address: 'Updated address', phone: '07700000000' } : {};
    return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [
      { id: `tool-${current}`, type: 'function', function: { name, arguments: JSON.stringify(args) } },
    ] } }] };
  });
  const response = await api.handler(new Request('https://unit.test/agent-run', { method: 'POST', body: JSON.stringify({ conversation_id: 'conversation-1' }) }));
  assert.equal(response.status, 200);
  assert.equal(step, 4);
  assert.equal(db.tables.conversations[0].delivery.address, 'Updated address');
});

test('written-address checkout remains available when the customer cannot share GPS', async () => {
  const db = new MemoryDb({ coverage: true }), api = loadAgent(db);
  delete db.tables.conversations[0].delivery.customer_location;
  const { conv, result } = await preview(api, db);
  assert.equal(conv.meta.manual_address_check, true);
  assert.equal(db.tables.conversations[0].meta.manual_address_check, true);
  assert.match(result.summary, /Test address/);
  assert.equal((await confirm(api, db, conv, result.confirmation_token)).ok, true);
  assert.equal(db.tables.orders[0].delivery_address, 'Test address');
});

test('GPS saved in conversation metadata survives delivery updates, preview and submit', async () => {
  const db = new MemoryDb({ coverage: true }), api = loadAgent(db);
  const conv = snapshot(db);
  delete conv.delivery.customer_location;
  conv.meta.customer_location = { lat: 35.47, lng: 44.39 };
  await api.runTool(db, conv, restaurant(db), 'set_delivery_info', { payment_method: 'cash' }, [], []);
  assert.deepEqual(structuredClone(conv.delivery.customer_location), { lat: 35.47, lng: 44.39 });
  const { result } = await preview(api, db, conv);
  assert.match(result.summary, /GPS/);
  assert.equal((await confirm(api, db, conv, result.confirmation_token)).ok, true);
  assert.deepEqual(db.tables.orders[0].meta.customer_location, { lat: 35.47, lng: 44.39 });
});

test('messages about the customer location are not mistaken for restaurant directions', () => {
  const api = loadAgent(new MemoryDb());
  for (const text of ['[موقع الزبون: lat=35.47, lng=44.39]', 'هذا موقعي', 'ليش ما اخذت اللوكيشن', 'عنوان التوصيل', 'دزيتلك لوكيشني']) {
    assert.equal(api.isRestaurantLocationRequest(text), false, text);
  }
  for (const text of ['وين المطعم', 'دزلي موقعكم', 'وين الفرع']) {
    assert.equal(api.isRestaurantLocationRequest(text), true, text);
  }
});

test('GPS outside configured delivery coverage still blocks checkout', async () => {
  const db = new MemoryDb({ coverage: true }), api = loadAgent(db, () => ({ covered: false }));
  const conv = snapshot(db);
  const result = await api.runTool(db, conv, restaurant(db), 'preview_order', {}, [], [], undefined, db.addUserMessage('هذا موقعي'));
  assert.equal(result.error, 'out_of_coverage');
  assert.equal(conv.meta.pending_confirmation, undefined);
  assert.equal(db.tables.orders.length, 0);
});
