import { Router, Response } from 'express';
import { getDb } from '../db.js';
import { requireAuth, AuthenticatedRequest } from '../auth.js';

const router = Router();

// Get customer's cart
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const db = await getDb();

    const result = await db.query(
      `SELECT c.id, c.product_id, c.quantity, 
              p.name, p.description, p.price, p.stock, p.image_url, p.category,
              (c.quantity * p.price) as subtotal
       FROM cart_items c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );

    const items = result.rows.map((row: any) => ({
      id: row.id,
      productId: row.product_id,
      name: row.name,
      description: row.description,
      price: parseFloat(row.price),
      stock: row.stock,
      imageUrl: row.image_url,
      category: row.category,
      quantity: row.quantity,
      subtotal: parseFloat(row.subtotal),
    }));

    const total = items.reduce((sum: number, item: any) => sum + item.subtotal, 0);

    res.json({
      items,
      itemCount: items.reduce((sum: number, item: any) => sum + item.quantity, 0),
      total: Math.round(total * 100) / 100,
    });
  } catch (err: any) {
    console.error('Error fetching cart:', err);
    res.status(500).json({ error: 'Failed to fetch shopping cart' });
  }
});

// Add or increment item in cart
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { productId, quantity = 1 } = req.body;

    const parsedProductId = parseInt(productId, 10);
    const parsedQty = parseInt(quantity, 10);

    if (isNaN(parsedProductId) || isNaN(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({ error: 'Valid productId and positive quantity are required' });
    }

    const db = await getDb();

    // Check product existence and current stock
    const productRes = await db.query('SELECT id, name, stock, price FROM products WHERE id = $1', [parsedProductId]);
    if (productRes.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productRes.rows[0];
    if (product.stock <= 0) {
      return res.status(400).json({ error: `"${product.name}" is currently out of stock` });
    }

    // Check existing item in cart
    const existingRes = await db.query(
      'SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2',
      [userId, parsedProductId]
    );

    let newQuantity = parsedQty;
    if (existingRes.rows.length > 0) {
      newQuantity += existingRes.rows[0].quantity;
    }

    if (newQuantity > product.stock) {
      return res.status(400).json({
        error: `Cannot add ${parsedQty} more. Only ${product.stock} items available in stock (${existingRes.rows[0]?.quantity || 0} already in cart).`,
      });
    }

    await db.query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity = $3`,
      [userId, parsedProductId, newQuantity]
    );

    res.json({ message: `Added "${product.name}" to cart`, currentQuantity: newQuantity });
  } catch (err: any) {
    console.error('Error adding to cart:', err);
    res.status(500).json({ error: err.message || 'Failed to add item to cart' });
  }
});

// Update item quantity in cart
router.put('/:productId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const productId = parseInt(req.params.productId, 10);
    const { quantity } = req.body;

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(productId) || isNaN(parsedQty)) {
      return res.status(400).json({ error: 'Valid productId and quantity are required' });
    }

    const db = await getDb();

    if (parsedQty <= 0) {
      // Remove item
      await db.query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [userId, productId]);
      return res.json({ message: 'Item removed from cart' });
    }

    // Check product stock
    const productRes = await db.query('SELECT id, name, stock FROM products WHERE id = $1', [productId]);
    if (productRes.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productRes.rows[0];
    if (parsedQty > product.stock) {
      return res.status(400).json({
        error: `Only ${product.stock} units available in stock.`,
      });
    }

    await db.query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity = $3`,
      [userId, productId, parsedQty]
    );

    res.json({ message: 'Cart updated', quantity: parsedQty });
  } catch (err: any) {
    console.error('Error updating cart item:', err);
    res.status(500).json({ error: err.message || 'Failed to update cart' });
  }
});

// Remove single product from cart
router.delete('/:productId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const productId = parseInt(req.params.productId, 10);

    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid productId' });
    }

    const db = await getDb();
    await db.query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [userId, productId]);

    res.json({ message: 'Item removed from cart' });
  } catch (err: any) {
    console.error('Error removing item from cart:', err);
    res.status(500).json({ error: 'Failed to remove item from cart' });
  }
});

// Clear cart
router.delete('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const db = await getDb();
    await db.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

    res.json({ message: 'Cart cleared' });
  } catch (err: any) {
    console.error('Error clearing cart:', err);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

export default router;
