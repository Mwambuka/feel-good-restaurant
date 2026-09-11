const state = { menu: [], category: 'all', token: localStorage.getItem('feel-good-token'), registering: false };
const menuGrid = document.querySelector('#menu-grid');
const toast = document.querySelector('#toast');

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(state.token ? { authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Something went wrong');
  return body;
}

function money(cents) { return (cents / 100).toFixed(2); }
function showToast(message) { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }

async function loadMenu() {
  try {
    const data = await api('/api/menu');
    state.menu = data.items;
    renderMenu();
  } catch (error) { menuGrid.innerHTML = `<p class="loading">${error.message}</p>`; }
}

function renderMenu() {
  const items = state.category === 'all' ? state.menu : state.menu.filter((item) => item.category === state.category);
  menuGrid.innerHTML = items.map((item) => `<article class="menu-item"><div><span class="category-label">${item.category}</span><h3>${item.name}</h3><p>${item.description}</p></div><div class="menu-meta"><span class="price">${money(item.price_cents)}</span><button class="text-button order-button" data-id="${item.id}" data-name="${item.name}">Order this <span>-></span></button></div></article>`).join('');
  document.querySelectorAll('.order-button').forEach((button) => button.addEventListener('click', () => orderItem(Number(button.dataset.id), button.dataset.name)));
}

async function orderItem(menuItemId, name) {
  if (!state.token) { openAuth(); showToast('Sign in to place a delivery order'); return; }
  const address = window.prompt(`Delivery address for ${name}:`);
  if (!address) return;
  try {
    const data = await api('/api/orders', { method: 'POST', body: JSON.stringify({ items: [{ menu_item_id: menuItemId, quantity: 1 }], delivery_address: address }) });
    showToast(`Order #${data.order.id} received. We will call you shortly.`);
  } catch (error) { showToast(error.message); }
}

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
  tab.classList.add('active'); state.category = tab.dataset.category; renderMenu();
}));

const dialog = document.querySelector('#auth-dialog');
const authForm = document.querySelector('#auth-form');
function openAuth() { dialog.showModal(); }
document.querySelector('#login-button').addEventListener('click', openAuth);
document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
document.querySelector('#switch-auth').addEventListener('click', () => {
  state.registering = !state.registering; dialog.classList.toggle('register', state.registering);
  document.querySelector('#auth-title').textContent = state.registering ? 'Create account' : 'Sign in';
  document.querySelector('#auth-submit').innerHTML = state.registering ? 'Create account <span>-></span>' : 'Sign in <span>-></span>';
  document.querySelector('#switch-auth').textContent = state.registering ? 'Already have an account? Sign in' : 'Need an account? Create one';
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(authForm);
  const payload = Object.fromEntries(form.entries());
  const endpoint = state.registering ? '/api/auth/register' : '/api/auth/login';
  const message = document.querySelector('#auth-message');
  try {
    const data = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    state.token = data.token; localStorage.setItem('feel-good-token', state.token); dialog.close();
    document.querySelector('#login-button').textContent = `Hi, ${data.user.name.split(' ')[0]}`;
    document.querySelector('#auth-status').textContent = 'Ready to reserve';
    showToast('You are signed in.');
  } catch (error) { message.textContent = error.message; }
});

document.querySelector('#reservation-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.token) { openAuth(); showToast('Sign in to request a reservation'); return; }
  const form = new FormData(event.target);
  const payload = Object.fromEntries(form.entries()); payload.guests = Number(payload.guests);
  const message = document.querySelector('#reservation-message');
  try {
    const data = await api('/api/reservations', { method: 'POST', body: JSON.stringify(payload) });
    message.textContent = `Reservation request #${data.reservation.id} sent. See you soon.`; event.target.reset();
  } catch (error) { message.textContent = error.message; }
});

if (state.token) { document.querySelector('#login-button').textContent = 'Account'; document.querySelector('#auth-status').textContent = 'Ready to reserve'; }
loadMenu();
