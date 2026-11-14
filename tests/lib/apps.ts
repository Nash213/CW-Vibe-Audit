// tests/lib/apps.ts
// Per-app config. ALL app-specific knowledge lives here and nowhere else.
// g1 is checked against apps/task-manager-corpus at baseline (12 Nov).

export type AppId = 'g1' | 'g2' | 'g3' | 'g4';

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
    // Optional. A button that exists ONLY while an item is being edited (often "Save").
    editReady?: RegExp;
  };
}

const g1: AppConfig = {
  id: 'g1',
  api: {
    register: '/api/auth/signup',
    login: '/api/auth/login',
    items: '/api/tasks',
    // The app sets a Secure cookie (NODE_ENV=production) AND returns the token in JSON.
    // Bearer avoids depending on Secure cookies over plain http.
    authStyle: 'bearer',
    tokenField: 'token',
    registerBody: (email, password) => ({ email, password }),
    loginBody: (email, password) => ({ email, password }),
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
    editItem: /edit/i,
    deleteItem: /delete|remove/i,
    editReady: /save/i, // the edit dialog's "Save Changes" button
  },
};

// g2..g4 start as copies of g1. REPLACE every value after using each app by hand.
export const apps: Record<AppId, AppConfig> = {
  g1,
  g2: { ...g1, id: 'g2' },
  g3: { ...g1, id: 'g3' },
  g4: { ...g1, id: 'g4' },
};