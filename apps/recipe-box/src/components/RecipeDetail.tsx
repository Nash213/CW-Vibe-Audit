import { useState } from 'react';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { CATEGORY_LABELS, type Recipe } from '../types.ts';

interface RecipeDetailProps {
  recipe: Recipe;
  onBack: () => void;
  onEdit: (recipe: Recipe) => void;
  onDelete: (recipeId: number) => Promise<void>;
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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

export function RecipeDetail({ recipe, onBack, onEdit, onDelete }: RecipeDetailProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const ingredients = splitLines(recipe.ingredients);
  const steps = splitLines(recipe.steps);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(recipe.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to My Recipes
        </button>
      </div>

      <article className="rounded-xl border border-zinc-200 bg-white p-6 sm:p-8">
        <header className="flex flex-col gap-4 border-b border-zinc-100 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl [text-wrap:balance]">
              {recipe.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
              <span className="font-medium text-zinc-700">{CATEGORY_LABELS[recipe.category]}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Added {formatDate(recipe.createdAt)}</span>
              {recipe.updatedAt !== recipe.createdAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Updated {formatDate(recipe.updatedAt)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-red-700">Delete permanently?</span>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60 whitespace-nowrap"
                >
                  {deleting ? 'Deleting...' : 'Confirm'}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(recipe)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 whitespace-nowrap"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 whitespace-nowrap"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete
                </button>
              </>
            )}
          </div>
        </header>

        <div className="mt-8 grid gap-10 md:grid-cols-12">
          <section className="md:col-span-5">
            <h2 className="font-display text-base font-semibold text-zinc-900">Ingredients</h2>
            <ul className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100 text-sm text-zinc-700">
              {ingredients.map((item, idx) => (
                <li key={idx} className="py-2.5 leading-relaxed">
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="md:col-span-7">
            <h2 className="font-display text-base font-semibold text-zinc-900">Steps</h2>
            <ol className="mt-4 space-y-5 border-t border-zinc-100 pt-4">
              {steps.map((step, idx) => (
                <li key={idx} className="flex gap-4 text-sm leading-relaxed text-zinc-800">
                  <span className="font-mono text-xs font-medium text-zinc-400 tabular-nums pt-0.5 select-none">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <p className="flex-1">{step}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </article>
    </div>
  );
}
