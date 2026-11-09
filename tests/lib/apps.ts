// tests/lib/apps.ts
// Per-app config. ALL app-specific knowledge lives here and nowhere else.
// Lines marked FILL must be checked against the real baseline by hand.

export type AppId = 'g1' | 'g2' | 'i1' | 'i2';

// Throwaway password for generated test users. Not a real credential.
export const TEST_PASSWORD = 'Test-pass-12345!';

export interface ExtraField {
  label: RegExp;
  value: string;
}

export interface AppConfig {
  id: AppId;
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
    switchToRegister?: RegExp; // only if register/login share one page behind a toggle
    switchToLogin?: RegExp;
    extraRegisterFields?: ExtraField[]; // e.g. name, username, confirm password
    addItem?: RegExp; // omit when the "new item" form is always visible
    itemTitle: RegExp;
    saveItem: RegExp;
    editItem: RegExp;
    deleteItem: RegExp;
    // Optional. A button name that exists ONLY while an item is being edited (often "Save").
    // Set it if the edit form re-renders after you click Edit; the test then waits for it.
    editReady?: RegExp;
  };
}

const g1: AppConfig = {
  id: 'g1',
  api: {
    register: '/api/auth/register', // FILL
    login: '/api/auth/login', // FILL
    items: '/api/tasks', // FILL
    authStyle: 'cookie', // FILL: 'cookie' or 'bearer'
    // tokenField: 'token', // FILL, bearer only
    registerBody: (email, password) => ({ email, password }), // FILL: field names
    loginBody: (email, password) => ({ email, password }), // FILL
    itemBody: (title) => ({ title, description: 'created by test', status: 'todo' }), // FILL
  },
  pages: { register: '/register', login: '/login', list: '/' }, // FILL
  ui: {
    email: /e-?mail/i,
    password: /^\s*password\b/i, // anchored so "Confirm password" does not match
    registerButton: /sign ?up|register|create account/i,
    loginButton: /log ?in|sign ?in/i,
    logout: /log ?out|sign ?out/i,
    itemTitle: /title|name/i,
    saveItem: /add|save|create|submit/i,
    editItem: /edit/i,
    deleteItem: /delete|remove/i,
  },
};

// g2, i1, i2 start as copies of g1. REPLACE every FILL line once you have used
// each app by hand. Until then their tests will (correctly) fail.
export const apps: Record<AppId, AppConfig> = {
  g1,
  g2: { ...g1, id: 'g2' },
  i1: { ...g1, id: 'i1' },
  i2: { ...g1, id: 'i2' },
};