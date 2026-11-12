import { Router, Request, Response } from 'express';
import { getDb } from '../db.js';
import { requireAdmin, AuthenticatedRequest } from '../auth.js';

const router = Router();

// List all products with optional search and category filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, category, sort } = req.query;
    const db = await getDb();

    let query = 'SELECT * FROM products WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (search && typeof search === 'string' && search.trim() !== '') {
      query += ` AND (LOWER(name) LIKE $${paramIndex} OR LOWER(description) LIKE $${paramIndex})`;
      params.push(`%${search.trim().toLowerCase()}%`);
      paramIndex++;
    }

    if (category && typeof category === 'string' && category !== 'All') {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (sort === 'price-low') {
      query += ' ORDER BY price ASC';
    } else if (sort === 'price-high') {
      query += ' ORDER BY price DESC';
    } else if (sort === 'stock') {
      query += ' ORDER BY stock DESC';
    } else {
      query += ' ORDER BY id DESC';
    }

    const result = await db.query(query, params);
    
    // Also fetch available categories
    const categoriesResult = await db.query('SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category ASC');
    const categories = categoriesResult.rows.map((r: any) => r.category);

    res.json({
      products: result.rows,
      categories,
    });
  } catch (err: any) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get single product by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const db = await getDb();
    const result = await db.query('SELECT * FROM products WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('Error fetching product:', err);
    res.status(500).json({ error: 'Failed to fetch product details' });
  }
});

// Admin: Create new product
router.post('/', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description, price, stock, category, image_url } = req.body;

    if (!name || description === undefined || price === undefined || stock === undefined) {
      return res.status(400).json({ error: 'Name, description, price, and stock are required' });
    }

    const numericPrice = parseFloat(price);
    const numericStock = parseInt(stock, 10);

    if (isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }

    if (isNaN(numericStock) || numericStock < 0) {
      return res.status(400).json({ error: 'Stock count must be a non-negative integer' });
    }

    const db = await getDb();
    const insertRes = await db.query(
      `INSERT INTO products (name, description, price, stock, category, image_url) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [
        name.trim(),
        description.trim(),
        numericPrice,
        numericStock,
        category ? category.trim() : 'General',
        image_url ? image_url.trim() : null,
      ]
    );

    res.status(201).json({
      message: 'Product created successfully',
      product: insertRes.rows[0],
    });
  } catch (err: any) {
    console.error('Error creating product:', err);
    res.status(500).json({ error: err.message || 'Failed to create product' });
  }
});

// Admin: Update product
router.put('/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const { name, description, price, stock, category, image_url } = req.body;

    if (!name || description === undefined || price === undefined || stock === undefined) {
      return res.status(400).json({ error: 'Name, description, price, and stock are required' });
    }

    const numericPrice = parseFloat(price);
    const numericStock = parseInt(stock, 10);

    if (isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }

    if (isNaN(numericStock) || numericStock < 0) {
      return res.status(400).json({ error: 'Stock count must be a non-negative integer' });
    }

    const db = await getDb();
    const updateRes = await db.query(
      `UPDATE products 
       SET name = $1, description = $2, price = $3, stock = $4, category = $5, image_url = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [
        name.trim(),
        description.trim(),
        numericPrice,
        numericStock,
        category ? category.trim() : 'General',
        image_url ? image_url.trim() : null,
        id,
      ]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      message: 'Product updated successfully',
      product: updateRes.rows[0],
    });
  } catch (err: any) {
    console.error('Error updating product:', err);
    res.status(500).json({ error: err.message || 'Failed to update product' });
  }
});

// Admin: Delete product
router.delete('/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const db = await getDb();
    
    // Check if product is in any completed order to provide friendly message or cascade
    const orderItemCheck = await db.query('SELECT id FROM order_items WHERE product_id = $1 LIMIT 1', [id]);
    if (orderItemCheck.rows.length > 0) {
      // Set stock to 0 or soft-mark, or inform
      return res.status(400).json({
        error: 'Cannot delete product because it exists in past order histories. You can set stock to 0 instead.',
      });
    }

    const deleteRes = await db.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    if (deleteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product deleted successfully', id });
  } catch (err: any) {
    console.error('Error deleting product:', err);
    res.status(500).json({ error: err.message || 'Failed to delete product' });
  }
});

export default router;
