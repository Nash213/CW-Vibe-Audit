import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, setAuthToken } from './api/client.ts';
import { AuthViews, type AuthMode } from './components/AuthViews.tsx';
import { AdminUsers } from './components/AdminUsers.tsx';
import { RecipeDetail } from './components/RecipeDetail.tsx';
import { RecipeForm } from './components/RecipeForm.tsx';
import { RecipeList } from './components/RecipeList.tsx';
import type { AdminUser, Recipe, RecipeCategory, RecipeInput, User } from './types.ts';

type ActiveView =
  | { name: 'auth'; mode: AuthMode }
  | { name: 'recipes' }
  | { name: 'recipe-new' }
  | { name: 'recipe-detail'; recipeId: number }
  | { name: 'recipe-edit'; recipeId: number }
  | { name: 'admin-users' };

function getInitialAuthMode(pathname: string): AuthMode {
  if (pathname === '/signup') return 'signup';
  if (pathname === '/setup-admin') return 'setup-admin';
  return 'login';
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [hasAdmin, setHasAdmin] = useState<boolean>(true);
  const [initializing, setInitializing] = useState<boolean>(true);
  const [view, setView] = useState<ActiveView>(() => ({
    name: 'auth',
    mode: getInitialAuthMode(window.location.pathname),
  }));

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<RecipeCategory | 'all'>('all');
  const [recipesLoading, setRecipesLoading] = useState<boolean>(false);
  const [recipesError, setRecipesError] = useState<string | null>(null);

  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminLoading, setAdminLoading] = useState<boolean>(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const navigate = useCallback((nextView: ActiveView, urlPath?: string) => {
    setView(nextView);
    if (urlPath && window.location.pathname !== urlPath) {
      window.history.pushState(null, '', urlPath);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (!user) {
        setView({ name: 'auth', mode: getInitialAuthMode(path) });
        return;
      }
      if (path === '/admin/users' && user.role === 'admin') {
        setView({ name: 'admin-users' });
      } else if (path === '/recipes/new') {
        setView({ name: 'recipe-new' });
      } else {
        const editMatch = /^\/recipes\/(\d+)\/edit$/.exec(path);
        const detailMatch = /^\/recipes\/(\d+)$/.exec(path);
        if (editMatch) {
          setView({ name: 'recipe-edit', recipeId: Number(editMatch[1]) });
        } else if (detailMatch) {
          setView({ name: 'recipe-detail', recipeId: Number(detailMatch[1]) });
        } else {
          setView({ name: 'recipes' });
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    api
      .getSetupStatus()
      .then((status) => {
        if (cancelled) return;
        setHasAdmin(status.hasAdmin);
        if (!status.hasAdmin && window.location.pathname === '/setup-admin') {
          setView({ name: 'auth', mode: 'setup-admin' });
        }
      })
      .catch(() => {
        // Default to true if status endpoint fails temporarily
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadRecipes = useCallback(async (category: RecipeCategory | 'all') => {
    setRecipesLoading(true);
    setRecipesError(null);
    try {
      const data = await api.listRecipes(category);
      setRecipes(data.recipes);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthToken(null);
        setUser(null);
        navigate({ name: 'auth', mode: 'login' }, '/login');
        return;
      }
      setRecipesError(err instanceof Error ? err.message : 'Unable to load recipes.');
    } finally {
      setRecipesLoading(false);
    }
  }, [navigate]);

  const loadAdminUsers = useCallback(async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const data = await api.listAdminUsers();
      setAdminUsers(data.users);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthToken(null);
        setUser(null);
        navigate({ name: 'auth', mode: 'login' }, '/login');
        return;
      }
      setAdminError(err instanceof Error ? err.message : 'Unable to load users.');
    } finally {
      setAdminLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    if (view.name === 'recipes') {
      loadRecipes(categoryFilter);
    } else if (view.name === 'admin-users' && user.role === 'admin') {
      loadAdminUsers();
    }
  }, [user, view.name, categoryFilter, loadRecipes, loadAdminUsers]);

  const handleAuthenticated = (token: string, authedUser: User) => {
    setAuthToken(token);
    setUser(authedUser);
    if (authedUser.role === 'admin') {
      setHasAdmin(true);
    }
    setCategoryFilter('all');
    navigate({ name: 'recipes' }, '/recipes');
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Clear local session regardless of network outcome
    }
    setAuthToken(null);
    setUser(null);
    setRecipes([]);
    setAdminUsers([]);
    navigate({ name: 'auth', mode: 'login' }, '/login');
  };

  const handleSaveRecipe = async (input: RecipeInput, recipeId?: number) => {
    if (recipeId) {
      const { recipe } = await api.updateRecipe(recipeId, input);
      setRecipes((prev) => prev.map((r) => (r.id === recipe.id ? recipe : r)));
      navigate({ name: 'recipe-detail', recipeId: recipe.id }, `/recipes/${recipe.id}`);
    } else {
      const { recipe } = await api.createRecipe(input);
      setCategoryFilter('all');
      setRecipes((prev) => [recipe, ...prev]);
      navigate({ name: 'recipes' }, '/recipes');
    }
  };

  const handleDeleteRecipe = async (recipeId: number) => {
    await api.deleteRecipe(recipeId);
    setRecipes((prev) => prev.filter((r) => r.id !== recipeId));
    navigate({ name: 'recipes' }, '/recipes');
  };

  const activeRecipe =
    view.name === 'recipe-detail' || view.name === 'recipe-edit'
      ? recipes.find((r) => r.id === view.recipeId) ?? null
      : null;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-8 px-6 py-4">
          <button
            type="button"
            onClick={() => {
              if (user) {
                navigate({ name: 'recipes' }, '/recipes');
              } else {
                navigate({ name: 'auth', mode: 'login' }, '/login');
              }
            }}
            className="font-display text-lg font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
          >
            Recipe Box
          </button>

          {user ? (
            <nav aria-label="Primary" className="flex items-center gap-6 text-sm font-medium">
              <button
                type="button"
                onClick={() => navigate({ name: 'recipes' }, '/recipes')}
                className={`whitespace-nowrap shrink-0 transition-colors ${
                  view.name !== 'admin-users'
                    ? 'text-zinc-900 underline decoration-emerald-700 decoration-2 underline-offset-8'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                My Recipes
              </button>
              {user.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => navigate({ name: 'admin-users' }, '/admin/users')}
                  className={`whitespace-nowrap shrink-0 transition-colors ${
                    view.name === 'admin-users'
                      ? 'text-zinc-900 underline decoration-emerald-700 decoration-2 underline-offset-8'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Users
                </button>
              )}
            </nav>
          ) : (
            <nav aria-label="Authentication" className="flex items-center gap-6 text-sm font-medium">
              <button
                type="button"
                onClick={() => navigate({ name: 'auth', mode: 'login' }, '/login')}
                className={`whitespace-nowrap shrink-0 transition-colors ${
                  view.name === 'auth' && view.mode === 'login'
                    ? 'text-zinc-900 underline decoration-emerald-700 decoration-2 underline-offset-8'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => navigate({ name: 'auth', mode: 'signup' }, '/signup')}
                className={`whitespace-nowrap shrink-0 transition-colors ${
                  view.name === 'auth' && view.mode === 'signup'
                    ? 'text-zinc-900 underline decoration-emerald-700 decoration-2 underline-offset-8'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Sign up
              </button>
            </nav>
          )}

          <div className="flex items-center gap-4 shrink-0">
            {user ? (
              <>
                <span className="hidden text-xs text-zinc-500 sm:inline truncate max-w-48">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg border border-zinc-300 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50 whitespace-nowrap shrink-0"
                >
                  Log out
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() =>
                  navigate(
                    { name: 'auth', mode: hasAdmin ? 'signup' : 'setup-admin' },
                    hasAdmin ? '/signup' : '/setup-admin'
                  )
                }
                className="rounded-lg bg-emerald-800 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-900 whitespace-nowrap shrink-0"
              >
                {hasAdmin ? 'Get Started' : 'Setup Admin'}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {initializing ? (
          <div className="py-16 text-center text-sm text-zinc-500">Loading Recipe Box...</div>
        ) : !user ? (
          <AuthViews
            mode={view.name === 'auth' ? view.mode : 'login'}
            hasAdmin={hasAdmin}
            onSwitchMode={(nextMode) =>
              navigate(
                { name: 'auth', mode: nextMode },
                nextMode === 'login' ? '/login' : nextMode === 'signup' ? '/signup' : '/setup-admin'
              )
            }
            onAuthenticated={handleAuthenticated}
          />
        ) : view.name === 'admin-users' && user.role === 'admin' ? (
          <AdminUsers
            users={adminUsers}
            loading={adminLoading}
            error={adminError}
            onRetry={loadAdminUsers}
          />
        ) : view.name === 'recipe-new' ? (
          <RecipeForm
            onSave={handleSaveRecipe}
            onCancel={() => navigate({ name: 'recipes' }, '/recipes')}
          />
        ) : view.name === 'recipe-edit' && activeRecipe ? (
          <RecipeForm
            initialRecipe={activeRecipe}
            onSave={handleSaveRecipe}
            onDelete={handleDeleteRecipe}
            onCancel={() =>
              navigate(
                { name: 'recipe-detail', recipeId: activeRecipe.id },
                `/recipes/${activeRecipe.id}`
              )
            }
          />
        ) : view.name === 'recipe-detail' && activeRecipe ? (
          <RecipeDetail
            recipe={activeRecipe}
            onBack={() => navigate({ name: 'recipes' }, '/recipes')}
            onEdit={(recipe) =>
              navigate({ name: 'recipe-edit', recipeId: recipe.id }, `/recipes/${recipe.id}/edit`)
            }
            onDelete={handleDeleteRecipe}
          />
        ) : (
          <RecipeList
            recipes={recipes}
            categoryFilter={categoryFilter}
            loading={recipesLoading}
            error={recipesError}
            onCategoryChange={setCategoryFilter}
            onAddRecipe={() => navigate({ name: 'recipe-new' }, '/recipes/new')}
            onViewRecipe={(recipe) =>
              navigate({ name: 'recipe-detail', recipeId: recipe.id }, `/recipes/${recipe.id}`)
            }
            onEditRecipe={(recipe) =>
              navigate({ name: 'recipe-edit', recipeId: recipe.id }, `/recipes/${recipe.id}/edit`)
            }
            onDeleteRecipe={handleDeleteRecipe}
            onRetry={() => loadRecipes(categoryFilter)}
          />
        )}
      </main>
    </div>
  );
}
