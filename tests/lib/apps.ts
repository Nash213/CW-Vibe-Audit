// tests/lib/apps.ts
// Per-app config. ALL app-specific knowledge lives here and nowhere else.
// g1 and g4 checked against booting baselines; g2 and g3 written from the code
// (they cannot boot yet) and must be re-checked once they do.

export type AppId = 'g1' | 'g2' | 'g3' | 'g4';

// Throwaway credentials for generated test users. Not real.
export const TEST_PASSWORD = 'Test-pass-12345!';
export const TEST_NAME = 'Test User'; // apps that ask for a name; also finds g3's user menu

/** A form field matched by its label OR its placeholder (many generated UIs have unlinked labels). */
export interface ExtraField {
  label: RegExp;
  value: string;
}

export interface AppConfig {
  id: AppId;
  /** false = no per-user item with create/edit/delete; the spec supplies its own T04-T07 and T09. */
  crud: boolean;
  api: {
    register: string;
    login: string;
    items: string; // collection route, e.g. /api/tasks
    authStyle: 'cookie' | 'bearer';
    tokenField?: string; // bearer only: field in the login response
    registerBody: (email: string, password: string) => Record<string, unknown>;
    loginBody: (email: string, password: string) => Record<string, unknown>;
    itemBody: (title: string) => Record<string, unknown>;
  };
  pages: { register: string; login: string; list: string };
  ui: {
    email: RegExp;
    password: RegExp;
    registerButton: RegExp;
    loginButton: RegExp;
    logout: RegExp;
    switchToRegister?: RegExp[]; // clicks, in order, to reach the sign-up form
    switchToLogin?: RegExp[]; // clicks, in order, to reach the login form
    extraRegisterFields?: ExtraField[]; // e.g. name, display name, confirm password
    loggedIn?: RegExp; // a control shown only when logged in (default: the logout control)
    openUserMenu?: RegExp; // click this first when logout sits inside a menu
    addItem?: RegExp; // omit when the "new item" form is always visible
    itemTitle: RegExp;
    extraItemFields?: ExtraField[]; // other required fields when creating an item
    saveItem: RegExp;
    editItem: RegExp;
    deleteItem: RegExp;
    editReady?: RegExp; // a button that exists ONLY while editing (wait for it)
  };
}

const loginBody = (email: string, password: string) => ({ email, password });

// g1: task manager (apps/task-manager-corpus). Verified: 3 of 3 on 17 Nov.
const g1: AppConfig = {
  id: 'g1',
  crud: true,
  api: {
    register: '/api/auth/signup',
    login: '/api/auth/login',
    items: '/api/tasks',
    authStyle: 'bearer', // Secure cookie under NODE_ENV=production; the token is also in the JSON
    tokenField: 'token',
    registerBody: (email, password) => ({ email, password }),
    loginBody,
    itemBody: (title) => ({ title, description: 'created by test', status: 'to do' }),
  },
  pages: { register: '/signup', login: '/login', list: '/' },
  ui: {
    email: /e-?mail/i,
    password: /^\s*password\b/i, // anchored so "Confirm Password" does not match
    registerButton: /sign ?up|register|create account/i,
    loginButton: /log ?in|sign ?in/i,
    logout: /log ?out|sign ?out/i,
    extraRegisterFields: [{ label: /confirm/i, value: TEST_PASSWORD }],
    itemTitle: /title|name/i,
    saveItem: /add|save|create|submit/i,
    editItem: /\bedit\b/i, // whole word: T06 titles start with "edited-"    deleteItem: /delete|remove/i,
    deleteItem: /delete|remove/i,
    editReady: /save/i, // the edit dialog's "Save Changes"
  },
};

// g2: notes (apps/notex---notes-&-workspace). UNVERIFIED: no compose file yet.
// One-page app: the auth dialog is on "/" with "Sign In" / "Create Account" tabs.
const g2: AppConfig = {
  id: 'g2',
  crud: true,
  api: {
    register: '/api/auth/register',
    login: '/api/auth/login',
    items: '/api/notes',
    authStyle: 'bearer',
    tokenField: 'token',
    registerBody: (email, password) => ({ name: TEST_NAME, email, password }),
    loginBody,
    itemBody: (title) => ({ title, content: 'created by test' }),
  },
  pages: { register: '/', login: '/', list: '/' },
  ui: {
    email: /e-?mail/i, // label not linked: falls back to input[type=email]
    password: /^\s*password\b/i, // falls back to input[type=password]
    registerButton: /create account|sign ?up|register/i,
    loginButton: /sign ?in|log ?in/i,
    logout: /sign ?out|log ?out/i, // icon button, aria-label "Sign out"
    switchToRegister: [/^\s*create account\s*$/i], // the tab above the form
    extraRegisterFields: [{ label: /full name|jordan/i, value: TEST_NAME }], // placeholder "e.g. Jordan Smith"
    addItem: /new note|compose note/i,
    itemTitle: /title/i, // placeholder "Note title..."
    saveItem: /create note|update note|save/i,
    editItem: /edit note|^\s*edit\s*$/i, // icon button, title "Edit note"
    deleteItem: /delete note|delete|remove/i,
  },
};

// g3: shop (apps/novastore). UNVERIFIED: compose references a missing Dockerfile.
// Customers cannot create/edit/delete products, so the cart is the item (specs/g3).
const g3: AppConfig = {
  id: 'g3',
  crud: false,
  api: {
    register: '/api/auth/register',
    login: '/api/auth/login',
    items: '/api/cart',
    authStyle: 'bearer',
    tokenField: 'token',
    registerBody: (email, password) => ({ name: TEST_NAME, email, password }),
    loginBody,
    itemBody: () => {
      throw new Error('g3 has no generic item: use the cart helpers in specs/g3');
    },
  },
  pages: { register: '/', login: '/', list: '/' },
  ui: {
    email: /e-?mail/i,
    password: /^\s*password\b/i,
    registerButton: /create customer account|sign ?up|register/i,
    loginButton: /sign ?in|log ?in/i,
    logout: /sign ?out|log ?out/i,
    switchToRegister: [/^\s*sign ?up\s*$/i], // nav button opens the dialog in sign-up mode
    switchToLogin: [/^\s*log ?in\s*$/i], // nav button opens it in login mode
    extraRegisterFields: [{ label: /full name|alex/i, value: TEST_NAME }], // placeholder "Alex Morgan"
    loggedIn: new RegExp(TEST_NAME, 'i'), // the user-menu button shows the user's name
    openUserMenu: new RegExp(TEST_NAME, 'i'), // "Sign Out" is inside that menu
    itemTitle: /name/i, // unused (crud: false)
    saveItem: /save/i,
    editItem: /edit/i,
    deleteItem: /remove/i,
  },
};

// g4: community board (apps/community-board). Posts are the item;
// edit and delete live on the post's own page; the list is public.
const g4: AppConfig = {
  id: 'g4',
  crud: true,
  api: {
    register: '/api/auth/signup',
    login: '/api/auth/login',
    items: '/api/posts',
    authStyle: 'cookie', // session cookie only, no token in the JSON
    registerBody: (email, password) => ({ email, displayName: TEST_NAME, password }),
    loginBody,
    itemBody: (title) => ({ title, body: 'created by test' }),
  },
  pages: { register: '/signup', login: '/login', list: '/' },
  ui: {
    email: /e-?mail/i,
    password: /^\s*password\b/i, // "Password (at least 6 characters)"
    registerButton: /sign ?up|register|create account/i,
    loginButton: /log ?in|sign ?in/i,
    logout: /log ?out|sign ?out/i,
    extraRegisterFields: [{ label: /display name/i, value: TEST_NAME }],
    itemTitle: /title/i,
    extraItemFields: [{ label: /message|body|content/i, value: 'created by test' }], // required
    saveItem: /publish|save|post|add|create|submit/i,
    editItem: /\bedit\b/i, // whole word: T06 titles start with "edited-"    deleteItem: /delete|remove/i,
    deleteItem: /delete|remove/i,
  },
};

export const apps: Record<AppId, AppConfig> = { g1, g2, g3, g4 };