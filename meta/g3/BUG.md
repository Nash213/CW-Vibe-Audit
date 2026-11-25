# Seeded bug (request B)
File: server/routes/products.ts, sort=price-low: `ORDER BY price ASC` -> `ORDER BY price DESC`.
Symptom (request B text): "When I sort products by lowest price, the most expensive ones show up first."
Check (TB): GET /api/products?sort=price-low returns prices in ascending order.