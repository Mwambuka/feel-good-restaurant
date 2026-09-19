# Feel Good Restaurant API

A local REST API for a comfortable restaurant with food, drinks, pool-table bookings, movie experiences, date vibes, dine-in reservations, and delivery orders.

## Run it

```powershell
npm install
Copy-Item .env.example .env
npm start
```

The API runs at `http://localhost:3000` by default. Set a long random `JWT_SECRET` in `.env` before using it outside local development. SQLite is created automatically at `data/feel-good.sqlite`.

Create an admin account by setting `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` before the first startup. The public menu can be read without authentication; menu creation requires an admin JWT.

## Routes

- `GET /api/health` - health check
- `GET /api/restaurant` - restaurant description, phone, and free-delivery contact information
- `GET /api/menu?category=food|drink` - available menu items
- `POST /api/auth/register` - create a customer account
- `POST /api/auth/login` - receive a 7-day JWT
- `GET /api/auth/me` - current authenticated user
- `POST /api/menu` - admin-only menu item creation
- `POST /api/orders` - authenticated delivery order
- `GET /api/orders` - authenticated user's orders
- `POST /api/reservations` - authenticated reservation for `restaurant`, `date`, `pool`, or `movie`
- `GET /api/reservations` - authenticated user's reservations

Send the token as `Authorization: Bearer <token>`. Prices are integer cents, for example `1250` means 12.50 in the restaurant's currency.

Free delivery contact: **0798904755** by call or WhatsApp.

## Test

```powershell
npm test
```

<!-- test webhook trigger -->
