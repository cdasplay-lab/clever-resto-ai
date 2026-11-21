const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const restaurantId = '297bb3a1-74e1-42e9-afd7-3103a3e5440a';
const ownerId = 'b32ade0a-b404-4071-a255-3eda841b99fc';
const accounts = [
  ['wasanhamad81@gmail.com', 'SHARED_DASHBOARD_SESSION_ONE'],
  ['abdm13743@gmail.com', 'SHARED_DASHBOARD_SESSION_TWO'],
];

for (const [email, variable] of accounts) {
  test(`${email} can open the existing 2in1 dashboard without ownership transfer`, { skip: !process.env[variable] }, async () => {
    const path = process.env[variable];
    assert.ok(path);
    const { session } = JSON.parse(fs.readFileSync(path, 'utf8'));
    assert.equal(session.user.email, email);
    const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString());
    const origin = new URL(claims.iss).origin;
    async function read(table, query) {
      const response = await fetch(`${origin}/rest/v1/${table}?${query}`, {
        headers: { apikey: 'sb_publishable_0phrZH8mdg3H1Djrqboa3Q_DAoU-OUe', Authorization: `Bearer ${session.access_token}` },
      });
      assert.equal(response.status, 200);
      return response.json();
    }
    const restaurants = await read('restaurants', 'select=id,name,owner_id&order=created_at&limit=1');
    assert.equal(restaurants[0]?.id, restaurantId);
    assert.equal(restaurants[0]?.name, '2in1');
    assert.equal(restaurants[0]?.owner_id, ownerId);
    const roles = await read('user_roles', `select=role&user_id=eq.${session.user.id}&restaurant_id=eq.${restaurantId}`);
    assert.ok(roles.some(row => row.role === 'admin'));
    const menu = await read('menu_items', `select=id&restaurant_id=eq.${restaurantId}`);
    assert.ok(menu.length > 0);
    const orders = await read('orders', `select=id&restaurant_id=eq.${restaurantId}&limit=1`);
    assert.ok(Array.isArray(orders));
  });
}