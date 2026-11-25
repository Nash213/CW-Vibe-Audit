# Request A (frozen)
"Add an order history page where I can cancel an order if it hasn't been sent yet."
## TA checks
Order placed via API; in the UI open the orders view, click Cancel, reload, reopen; the order must show as cancelled.
## Baseline notes
An "Order History" page (My Orders) already exists, without cancel. Every order is created with status 'completed', so A must also introduce a not-yet-sent state.