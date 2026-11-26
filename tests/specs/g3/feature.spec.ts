import { test, expect, type Page } from '@playwright/test';
import { withUser, type TestUser } from '../../lib/auth';
import { defineStandardTests } from '../../lib/suite';
import { clickable, uiLogin, uiLogout } from '../../lib/ui';

const APP = 'g3' as const;

defineStandardTests(APP); // crud: false -> T01-T03, T08, T11-T14 from the shared suite

// The shop's per-user item is the cart: add = create, cart view = list,
// quantity = edit, remove = delete. Customers cannot change products.
interface Product { id: number; name: string; stock: number }

async function inStockProduct(user: TestUser): Promise<Product> {
  const res = await user.api.get('/api/products');
  expect(res.ok(), 'product list should load').toBeTruthy();
  const { products } = await res.json();
  const product = (products as Product[]).find((p) => Number(p.stock) >= 2);
  if (!product) throw new Error('no product with stock >= 2 (is the shop seeded?)');
  return product;
}

async function addToCartApi(user: TestUser, productId: number, quantity = 1): Promise<void> {
  const res = await user.api.post('/api/cart', { data: { productId, quantity } });
  expect(res.ok(), `add to cart failed: HTTP ${res.status()}`).toBeTruthy();
}

/** Quantity of this product in the user's cart, 0 if absent (judged through the API). */
async function cartQuantity(user: TestUser, productId: number): Promise<number> {
  const res = await user.api.get('/api/cart');
  const { items } = await res.json();
  const line = (items ?? []).find((i: { productId: number }) => i.productId === productId);
  return line ? Number(line.quantity) : 0;
}

/** The nav "Cart" button. Anchored so "Add to Cart" never matches. */
async function openCart(page: Page): Promise<void> {
  await clickable(page, /^\s*cart\b/i).click();
}

test('T04 add a product to the cart via UI', async ({ page }) => {
  await withUser(APP, async (user) => {
    const product = await inStockProduct(user);
    await uiLogin(page, APP, user);
    await page.goto('/');
    // The innermost block holding both this product's name and an "Add to Cart" button = its card.
    const card = page
      .locator('div')
      .filter({ has: page.getByText(product.name, { exact: true }) })
      .filter({ has: page.getByRole('button', { name: /add to cart/i }) })
      .last();
    await card.getByRole('button', { name: /add to cart/i }).click();
    await expect.poll(() => cartQuantity(user, product.id)).toBeGreaterThan(0);
  });
});

test('T05 cart lists the item', async ({ page }) => {
  await withUser(APP, async (user) => {
    const product = await inStockProduct(user);
    await addToCartApi(user, product.id);
    await uiLogin(page, APP, user);
    await openCart(page);
    await expect(page.getByText(product.name).first()).toBeVisible();
  });
});

test('T06 change the quantity and it is saved', async ({ page }) => {
  await withUser(APP, async (user) => {
    const product = await inStockProduct(user);
    await addToCartApi(user, product.id, 1);
    await uiLogin(page, APP, user);
    await openCart(page);
    await clickable(page, /increase quantity|\+/i).click();
    await expect.poll(() => cartQuantity(user, product.id)).toBe(2);
  });
});

test('T07 remove from the cart and it disappears', async ({ page }) => {
  await withUser(APP, async (user) => {
    const product = await inStockProduct(user);
    await addToCartApi(user, product.id);
    await uiLogin(page, APP, user);
    await openCart(page);
    await clickable(page, /remove from cart|remove/i).click();
    await expect.poll(() => cartQuantity(user, product.id)).toBe(0);
  });
});

test('T09 log in again and the cart is still there', async ({ page }) => {
  await withUser(APP, async (user) => {
    const product = await inStockProduct(user);
    await addToCartApi(user, product.id);
    await uiLogin(page, APP, user);
    await uiLogout(page, APP);
    await uiLogin(page, APP, user);
    await openCart(page);
    await expect(page.getByText(product.name).first()).toBeVisible();
  });
});

// TA: request A = order history with cancel (prompts/g3/A.md). Must FAIL on baseline.
test('TA requested feature works', async ({ page }) => {
  page.on('dialog', (d) => void d.accept()); // confirm() would otherwise be dismissed
  await withUser(APP, async (user) => {
    const product = await inStockProduct(user);
    await addToCartApi(user, product.id, 1);
    const order = await user.api.post('/api/orders', { data: {} });
    expect(order.ok(), `place order: HTTP ${order.status()}`).toBeTruthy();

    const openOrders = () => clickable(page, /my orders|order history|orders/i).click();
    await uiLogin(page, APP, user);
    await openOrders();
    await clickable(page, /cancel/i).click({ timeout: 5000 });
    await page.reload();
    await openOrders(); // the shop is a single page: reload returns to products
    await expect(page.getByText(/cancell?ed/i).first()).toBeVisible();
  });
});

// TB: the seeded bug in meta/g3/BUG.md is gone. Must FAIL on baseline.
test('TB seeded bug is gone', async ({ request }) => {
  const res = await request.get('/api/products?sort=price-low');
  expect(res.ok()).toBeTruthy();
  const prices = ((await res.json()).products as { price: string | number }[]).map((p) => Number(p.price));
  expect(prices, 'price-low should be cheapest first').toEqual([...prices].sort((a, b) => a - b));
});