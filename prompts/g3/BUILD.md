Goal
Build a small online shop where people browse products, add them to a cart and place orders. No real payment is needed.
 
Tech stack
- Node.js with Express for the server
- PostgreSQL as the database
- The server also serves the web pages, so everything runs from one app
- A JSON API under /api that the pages use
- One docker-compose.yml that starts the app and the database
- The app should be reachable on one web port
- Include a package-lock.json
 
Requirements
- Sign up with email and password, log in, log out
- Products have a name, a description, a price and a stock count
- There are two roles: customer and admin
- Admins can add, edit and remove products
- Customers can add products to a cart, change quantities and place an order
- Placing an order reduces stock
- Customers can see their own orders and order details
- Include a way to create the first admin account and a few example products
 
UI
- A product list page and a product detail page
- A cart page showing items, quantities and the total
- A "my orders" page
- An admin page to manage products, only for admins
