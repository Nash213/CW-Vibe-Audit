# g3 novastore: test notes
- crud:false: the cart stands in for a user item (T04 add, T05 list, T06 quantity, T07 remove, T09 survives re-login). T10 and T15 do not apply (no user-entered titles); stability.sh excludes them for g3.
- Needs a seeded product with stock >= 2 (the app seeds 8 products on first start).
- TA places its order through the API (POST /api/orders), because the checkout UI may change; the cancel itself is done in the UI.
- TB is API-only: GET /api/products?sort=price-low must be ascending.
- Runs in node:22-slim (lockfile only has glibc native binaries).
- Stability: 3/3 on seeded baseline, 25 Nov.