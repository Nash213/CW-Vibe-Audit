# g0 recipe box: test notes
- Item = recipe. Fill after the build: where edit/delete live (list, recipe page, dialog).
- TB needs a 1.1 s gap between the two recipes (timestamps may have 1 s resolution).
- Admin credentials for AC4: from the app's own "create the first admin" mechanism
  (seed env var, script or first sign-up). Put them in `G0_ADMIN_EMAIL` / `G0_ADMIN_PASSWORD`
  (shell env, never committed) or the constants at the top of `tests/specs/g0/ac.spec.ts`.
- Stability: not run yet.