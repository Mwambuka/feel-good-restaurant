const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const databaseFile = process.env.DATABASE_FILE || './data/feel-good.sqlite';
const resolvedDatabaseFile = path.resolve(databaseFile);
fs.mkdirSync(path.dirname(resolvedDatabaseFile), { recursive: true });

const db = new Database(resolvedDatabaseFile);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL CHECK (category IN ('food', 'drink')),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    available INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    items_json TEXT NOT NULL,
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    delivery_address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'out_for_delivery', 'completed', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    reservation_at TEXT NOT NULL,
    guests INTEGER NOT NULL CHECK (guests BETWEEN 1 AND 30),
    experience TEXT NOT NULL DEFAULT 'restaurant',
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const seedMenu = db.prepare('SELECT COUNT(*) AS count FROM menu_items').get();
if (seedMenu.count === 0) {
  const insert = db.prepare(`INSERT INTO menu_items (name, description, category, price_cents) VALUES (?, ?, ?, ?)`);
  const seed = db.transaction(() => {
    insert.run('Feel Good Burger', 'Juicy beef, fresh salad, and house sauce.', 'food', 1250);
    insert.run('Cozy Chicken Wrap', 'Grilled chicken, crisp vegetables, and garlic dressing.', 'food', 950);
    insert.run('Loaded Fries', 'Crispy fries with cheese and signature toppings.', 'food', 700);
    insert.run('Fresh Fruit Juice', 'Seasonal fruit blended fresh to order.', 'drink', 450);
    insert.run('Feel Good Mocktail', 'A refreshing house blend for relaxed evenings.', 'drink', 600);
    insert.run('Coffee or Tea', 'A warm cup for a comfortable finish.', 'drink', 300);
  });
  seed();
}

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (adminEmail && adminPassword) {
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existingAdmin) {
    db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')`)
      .run('Feel Good Admin', adminEmail, bcrypt.hashSync(adminPassword, 12));
  }
}

module.exports = db;
