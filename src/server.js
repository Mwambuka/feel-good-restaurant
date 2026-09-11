require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || 'development-only-secret-change-me';
const restaurant = {
  name: 'Feel Good Restaurant',
  description: 'Food, drinks, pool, movies, date vibes, and relaxed everyday meals in one comfortable place.',
  phone: '0798904755',
  delivery: 'Free delivery for customers who contact us by call or WhatsApp.'
};

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(require('node:path').join(__dirname, '..', 'public')));

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, created_at: user.created_at };
}

function createToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, jwtSecret, { expiresIn: '7d' });
}

function authRequired(req, res, next) {
  const header = req.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Bearer token required' });
  try {
    req.auth = jwt.verify(header.slice(7), jwtSecret);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminRequired(req, res, next) {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

function validateString(value, field, maxLength = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) return `${field} is required`;
  return null;
}

app.get('/', (req, res) => res.sendFile(require('node:path').join(__dirname, '..', 'public', 'index.html')));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: restaurant.name }));
app.get('/api/restaurant', (req, res) => res.json(restaurant));

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, phone = null } = req.body || {};
  const nameError = validateString(name, 'name', 100);
  if (nameError) return res.status(400).json({ error: nameError });
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid email is required' });
  if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users (name, email, password_hash, phone) VALUES (?, ?, ?, ?)').run(name.trim(), email.trim().toLowerCase(), passwordHash, phone || null);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ user: publicUser(user), token: createToken(user) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Email is already registered' });
    throw error;
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = typeof email === 'string' ? db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) : null;
  if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ user: publicUser(user), token: createToken(user) });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.sub);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

app.get('/api/menu', (req, res) => {
  const category = req.query.category;
  if (category && !['food', 'drink'].includes(category)) return res.status(400).json({ error: 'category must be food or drink' });
  const items = category
    ? db.prepare('SELECT id, name, description, category, price_cents, available FROM menu_items WHERE available = 1 AND category = ? ORDER BY category, name').all(category)
    : db.prepare('SELECT id, name, description, category, price_cents, available FROM menu_items WHERE available = 1 ORDER BY category, name').all();
  res.json({ items });
});

app.post('/api/menu', authRequired, adminRequired, (req, res) => {
  const { name, description = '', category, price_cents } = req.body || {};
  const nameError = validateString(name, 'name', 120);
  if (nameError || !['food', 'drink'].includes(category) || !Number.isInteger(price_cents) || price_cents < 0) return res.status(400).json({ error: nameError || 'category and non-negative integer price_cents are required' });
  const result = db.prepare('INSERT INTO menu_items (name, description, category, price_cents) VALUES (?, ?, ?, ?)').run(name.trim(), description, category, price_cents);
  res.status(201).json({ item: db.prepare('SELECT * FROM menu_items WHERE id = ?').get(result.lastInsertRowid) });
});

app.post('/api/orders', authRequired, (req, res) => {
  const { items, delivery_address } = req.body || {};
  if (!Array.isArray(items) || items.length === 0 || items.some((item) => !Number.isInteger(item.menu_item_id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50)) return res.status(400).json({ error: 'items must contain menu_item_id and positive quantity' });
  const addressError = validateString(delivery_address, 'delivery_address', 300);
  if (addressError) return res.status(400).json({ error: addressError });
  const menuItems = db.prepare(`SELECT id, name, price_cents FROM menu_items WHERE available = 1 AND id IN (${items.map(() => '?').join(',')})`).all(...items.map((item) => item.menu_item_id));
  const byId = new Map(menuItems.map((item) => [item.id, item]));
  if (menuItems.length !== new Set(items.map((item) => item.menu_item_id)).size) return res.status(400).json({ error: 'One or more menu items are unavailable' });
  const orderItems = items.map((item) => ({ menu_item_id: item.menu_item_id, name: byId.get(item.menu_item_id).name, quantity: item.quantity, price_cents: byId.get(item.menu_item_id).price_cents }));
  const totalCents = orderItems.reduce((total, item) => total + item.price_cents * item.quantity, 0);
  const result = db.prepare('INSERT INTO orders (user_id, items_json, total_cents, delivery_address) VALUES (?, ?, ?, ?)').run(req.auth.sub, JSON.stringify(orderItems), totalCents, delivery_address.trim());
  res.status(201).json({ order: formatOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid)) });
});

function formatOrder(order) {
  return { ...order, items: JSON.parse(order.items_json), items_json: undefined };
}

app.get('/api/orders', authRequired, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.auth.sub).map(formatOrder);
  res.json({ orders });
});

app.post('/api/reservations', authRequired, (req, res) => {
  const { reservation_at, guests, experience = 'restaurant', notes = '' } = req.body || {};
  if (typeof reservation_at !== 'string' || Number.isNaN(Date.parse(reservation_at))) return res.status(400).json({ error: 'Valid reservation_at is required' });
  if (!Number.isInteger(guests) || guests < 1 || guests > 30) return res.status(400).json({ error: 'guests must be between 1 and 30' });
  const allowedExperiences = ['restaurant', 'date', 'pool', 'movie'];
  if (!allowedExperiences.includes(experience)) return res.status(400).json({ error: `experience must be one of: ${allowedExperiences.join(', ')}` });
  const result = db.prepare('INSERT INTO reservations (user_id, reservation_at, guests, experience, notes) VALUES (?, ?, ?, ?, ?)').run(req.auth.sub, reservation_at, guests, experience, notes);
  res.status(201).json({ reservation: db.prepare('SELECT * FROM reservations WHERE id = ?').get(result.lastInsertRowid) });
});

app.get('/api/reservations', authRequired, (req, res) => {
  res.json({ reservations: db.prepare('SELECT * FROM reservations WHERE user_id = ? ORDER BY reservation_at DESC').all(req.auth.sub) });
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) app.listen(port, () => console.log(`${restaurant.name} API listening on http://localhost:${port}`));

module.exports = app;
