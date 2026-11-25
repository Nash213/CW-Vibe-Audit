import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { CATEGORY_LABELS, type Recipe, type RecipeCategory } from '../types.ts';

interface RecipeListProps {
  recipes: Recipe[];
  categoryFilter: RecipeCategory | 'all';
  loading: boolean;
  error: string | null;
  onCategoryChange: (category: RecipeCategory | 'all') => void;
  onAddRecipe: () => void;
  onViewRecipe: (recipe: Recipe) => void;
  onEditRecipe: (recipe: Recipe) => void;
  onDeleteRecipe: (recipeId: number) => Promise<void>;
  onRetry: () => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function countNonEmptyLines(text: string): number {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

export function RecipeList({
  recipes,
  categoryFilter,
  loading,
  error,
  onCategoryChange,
  onAddRecipe,
  onViewRecipe,
  onEditRecipe,
  onDeleteRecipe,
  onRetry,
}: RecipeListProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleConfirmDelete = async (recipeId: number) => {
    setDeletingId(recipeId);
    try {
      await onDeleteRecipe(recipeId);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            My Recipes
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {loading
              ? 'Loading your saved recipes...'
              : `${recipes.length} ${recipes.length === 1 ? 'recipe' : 'recipes'} · Sorted newest first`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="category-filter" className="text-sm font-medium text-zinc-700 whitespace-nowrap">
              Category
            </label>
            <select
              id="category-filter"
              value={categoryFilter}
              onChange={(e) => onCategoryChange(e.target.value as RecipeCategory | 'all')}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            >
              <option value="all">All categories</option>
              <option value="breakfast">Breakfast</option>
              <option value="main">Main</option>
              <option value="dessert">Dessert</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onAddRecipe}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Recipe
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="font-medium underline underline-offset-4 hover:text-red-950"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading recipes">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-24 animate-pulse rounded-xl border border-zinc-200 bg-white p-5"
            >
              <div className="h-5 w-1/3 rounded bg-zinc-200" />
              <div className="mt-3 h-4 w-1/4 rounded bg-zinc-100" />
            </div>
          ))}
        </div>
      ) : recipes.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-14 text-center">
          <h2 className="font-display text-lg font-semibold text-zinc-900">
            {categoryFilter === 'all'
              ? 'Your recipe box is empty'
              : `No ${CATEGORY_LABELS[categoryFilter].toLowerCase()} recipes yet`}
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-zinc-600">
            {categoryFilter === 'all'
              ? 'Save your first breakfast, main dish, or dessert to keep ingredients and steps organized.'
              : 'Try switching to another category or add a new recipe here.'}
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            {categoryFilter !== 'all' && (
              <button
                type="button"
                onClick={() => onCategoryChange('all')}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Show all categories
              </button>
            )}
            <button
              type="button"
              onClick={onAddRecipe}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-900"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Recipe
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {recipes.map((recipe) => {
            const ingredientCount = countNonEmptyLines(recipe.ingredients);
            const stepCount = countNonEmptyLines(recipe.steps);
            const isConfirming = confirmDeleteId === recipe.id;
            const isDeleting = deletingId === recipe.id;

            return (
              <li
                key={recipe.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onViewRecipe(recipe)}
                      className="text-left font-display text-lg font-semibold text-zinc-900 transition-colors hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                    >
                      {recipe.title}
                    </button>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">
                        {CATEGORY_LABELS[recipe.category]}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{formatDate(recipe.createdAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {ingredientCount} {ingredientCount === 1 ? 'ingredient' : 'ingredients'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {stepCount} {stepCount === 1 ? 'step' : 'steps'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isConfirming ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-red-700">Delete recipe?</span>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => handleConfirmDelete(recipe.id)}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60 whitespace-nowrap"
                        >
                          {isDeleting ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onViewRecipe(recipe)}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 whitespace-nowrap"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditRecipe(recipe)}
                          aria-label={`Edit ${recipe.title}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 whitespace-nowrap"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(recipe.id)}
                          aria-label={`Delete ${recipe.title}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:border-red-200 hover:bg-red-50 whitespace-nowrap"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
