import { useState, type FormEvent } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import type { Recipe, RecipeCategory, RecipeInput } from '../types.ts';

interface RecipeFormProps {
  initialRecipe?: Recipe | null;
  onSave: (input: RecipeInput, recipeId?: number) => Promise<void>;
  onDelete?: (recipeId: number) => Promise<void>;
  onCancel: () => void;
}

export function RecipeForm({
  initialRecipe,
  onSave,
  onDelete,
  onCancel,
}: RecipeFormProps) {
  const isEditing = Boolean(initialRecipe);

  const [title, setTitle] = useState(initialRecipe?.title ?? '');
  const [category, setCategory] = useState<RecipeCategory>(initialRecipe?.category ?? 'main');
  const [ingredients, setIngredients] = useState(initialRecipe?.ingredients ?? '');
  const [steps, setSteps] = useState(initialRecipe?.steps ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !ingredients.trim() || !steps.trim()) {
      setError('Please fill in the title, ingredients, and steps.');
      return;
    }

    setSubmitting(true);
    try {
      await onSave(
        {
          title: title.trim(),
          category,
          ingredients: ingredients.trim(),
          steps: steps.trim(),
        },
        initialRecipe?.id
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save recipe.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initialRecipe || !onDelete) return;
    setError(null);
    setDeleting(true);
    try {
      await onDelete(initialRecipe.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete recipe.');
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to My Recipes
        </button>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 sm:p-8">
        <div className="border-b border-zinc-100 pb-5">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900">
            {isEditing ? 'Edit Recipe' : 'Add Recipe'}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {isEditing
              ? 'Update the details, ingredients, or preparation steps below.'
              : 'Save a new recipe to your personal recipe box.'}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="recipe-title" className="block text-sm font-medium text-zinc-800">
                Title
              </label>
              <input
                id="recipe-title"
                type="text"
                required
                maxLength={140}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Lemon Herb Roast Chicken"
                className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
              />
            </div>

            <div>
              <label htmlFor="recipe-category" className="block text-sm font-medium text-zinc-800">
                Category
              </label>
              <select
                id="recipe-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as RecipeCategory)}
                className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
              >
                <option value="breakfast">Breakfast</option>
                <option value="main">Main</option>
                <option value="dessert">Dessert</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="recipe-ingredients" className="block text-sm font-medium text-zinc-800">
              Ingredients
            </label>
            <p className="mt-0.5 text-xs text-zinc-500">Enter one ingredient per line.</p>
            <textarea
              id="recipe-ingredients"
              required
              rows={6}
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              placeholder={"2 tbsp olive oil\n1 lemon, zested and juiced\n4 garlic cloves, minced"}
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            />
          </div>

          <div>
            <label htmlFor="recipe-steps" className="block text-sm font-medium text-zinc-800">
              Steps
            </label>
            <p className="mt-0.5 text-xs text-zinc-500">Enter one preparation step per line.</p>
            <textarea
              id="recipe-steps"
              required
              rows={7}
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              placeholder={"Preheat oven to 200°C (400°F).\nToss ingredients together in a roasting pan.\nBake for 35 minutes until golden."}
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            />
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-zinc-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {isEditing && initialRecipe && onDelete && (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-red-700">Confirm delete?</span>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={handleDelete}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                    >
                      {deleting ? 'Deleting...' : 'Yes, delete'}
                    </button>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                    >
                      Keep
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete Recipe
                  </button>
                )
              )}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting || deleting}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || deleting}
                className="rounded-lg bg-emerald-800 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-60"
              >
                {submitting
                  ? isEditing
                    ? 'Saving changes...'
                    : 'Saving recipe...'
                  : isEditing
                    ? 'Save Changes'
                    : 'Save Recipe'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
