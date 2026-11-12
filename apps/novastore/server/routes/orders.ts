import { Router, Response } from 'express';
import { getDb } from '../db.js';
import { requireAuth, AuthenticatedRequest } from '../auth.js';

const router = Router();

// List customer orders (or all orders for admin)
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';
    const viewAll = isAdmin && req.query.all === 'true';

    const db = await getDb();

    let query = `
      SELECT o.id, o.user_id, o.total_amount, o.status, o.shipping_address, o.created_at,
             u.email as customer_email, u.name as customer_name,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
      FROM orders o
      JOIN users u ON o.user_id = u.id
    `;

    const params: any[] = [];
    if (!viewAll) {
      query += ' WHERE o.user_id = $1';
      params.push(userId);
    }

    query += ' ORDER BY o.created_at DESC';

    const result = await db.query(query, params);

    const orders = result.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      totalAmount: parseFloat(row.total_amount),
      status: row.status,
      shippingAddress: row.shipping_address,
      createdAt: row.created_at,
      customerEmail: row.customer_email,
      customerName: row.customer_name,
      itemCount: parseInt(row.item_count, 10),
    }));

    res.json(orders);
  } catch (err: any) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order detail with all items
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';
    const db = await getDb();

    // Fetch order
    const orderRes = await db.query(
      `SELECT o.*, u.email as customer_email, u.name as customer_name
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRes.rows[0];

    // Ensure user can only view their own order unless they are an admin
    if (!isAdmin && order.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied to this order' });
    }

    // Fetch order items with current product photos
    const itemsRes = await db.query(
      `SELECT oi.*, p.image_url, p.category
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1
       ORDER BY oi.id ASC`,
      [orderId]
    );

    const items = itemsRes.rows.map((row: any) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      unitPrice: parseFloat(row.unit_price),
      quantity: row.quantity,
      subtotal: parseFloat(row.subtotal),
      imageUrl: row.image_url,
      category: row.category,
    }));

    res.json({
      id: order.id,
      userId: order.user_id,
      customerName: order.customer_name,
      customerEmail: order.customer_email,
      totalAmount: parseFloat(order.total_amount),
      status: order.status,
      shippingAddress: order.shipping_address,
      createdAt: order.created_at,
      items,
    });
  } catch (err: any) {
    console.error('Error fetching order detail:', err);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// Place order from cart
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { shippingAddress = 'Standard Delivery Address' } = req.body;
    const db = await getDb();

    // Fetch user's cart items
    const cartRes = await db.query(
      `SELECT c.id, c.product_id, c.quantity, p.name, p.price, p.stock
       FROM cart_items c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = $1`,
      [userId]
    );

    if (cartRes.rows.length === 0) {
      return res.status(400).json({ error: 'Your shopping cart is empty' });
    }

    const cartItems = cartRes.rows;

    // 1. Stock Check Phase
    for (const item of cartItems) {
      if (item.stock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for "${item.name}". Only ${item.stock} left in stock, but your cart has ${item.quantity}. Please adjust your quantity.`,
        });
      }
    }

    // 2. Transaction Execution Phase
    await db.query('BEGIN');

    try {
      // Calculate total amount
      let totalAmount = 0;
      for (const item of cartItems) {
        const itemPrice = parseFloat(item.price);
        totalAmount += itemPrice * item.quantity;
      }
      totalAmount = Math.round(totalAmount * 100) / 100;

      // Create order
      const orderInsert = await db.query(
        `INSERT INTO orders (user_id, total_amount, status, shipping_address)
         VALUES ($1, $2, 'completed', $3)
         RETURNING id, created_at`,
        [userId, totalAmount, shippingAddress]
      );

      const orderId = orderInsert.rows[0].id;
      const createdAt = orderInsert.rows[0].created_at;

      // Insert order items and deduct stock
      for (const item of cartItems) {
        const itemPrice = parseFloat(item.price);
        const subtotal = Math.round(itemPrice * item.quantity * 100) / 100;

        // Insert order item
        await db.query(
          `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orderId, item.product_id, item.name, itemPrice, item.quantity, subtotal]
        );

        // Deduct stock from products table
        await db.query(
          `UPDATE products 
           SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [item.quantity, item.product_id]
        );
      }

      // Clear customer's cart
      await db.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

      await db.query('COMMIT');

      res.status(201).json({
        message: 'Order placed successfully!',
        orderId,
        totalAmount,
        createdAt,
      });
    } catch (txErr: any) {
      await db.query('ROLLBACK');
      throw txErr;
    }
  } catch (err: any) {
    console.error('Error placing order:', err);
    res.status(500).json({ error: err.message || 'Failed to place order' });
  }
});

export default router;
