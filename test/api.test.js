const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.DATABASE_FILE = path.join(__dirname, 'test.sqlite');
process.env.JWT_SECRET = 'test-secret';
const app = require('../src/server');

let server;
let baseUrl;
let token;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

async function request(path, options) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options?.headers || {}) }
  });
}

test('public restaurant and menu endpoints respond', async () => {
  const restaurant = await request('/api/restaurant');
  assert.equal(restaurant.status, 200);
  assert.equal((await restaurant.json()).phone, '0798904755');

  const menu = await request('/api/menu?category=food');
  const body = await menu.json();
  assert.equal(menu.status, 200);
  assert.ok(body.items.length > 0);
  assert.ok(body.items.every((item) => item.category === 'food'));
});

test('customer can register, authenticate, and place an order', async () => {
  const email = `customer-${Date.now()}@example.com`;
  const registration = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test Customer', email, password: 'correct-horse-battery-staple', phone: '0798904755' })
  });
  const registrationBody = await registration.json();
  assert.equal(registration.status, 201);
  assert.ok(registrationBody.token);
  token = registrationBody.token;

  const profile = await request('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).user.email, email);

  const order = await request('/api/orders', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ items: [{ menu_item_id: 1, quantity: 2 }], delivery_address: '1 Feel Good Street' })
  });
  const orderBody = await order.json();
  assert.equal(order.status, 201);
  assert.equal(orderBody.order.total_cents, 2500);
});

test('protected endpoints reject missing credentials', async () => {
  const response = await request('/api/auth/me');
  assert.equal(response.status, 401);
});
