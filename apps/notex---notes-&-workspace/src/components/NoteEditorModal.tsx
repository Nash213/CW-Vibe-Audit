import React, { useState, useEffect } from 'react';
import type { Note, NoteColor } from '../types.ts';
import { X, Pin, Tag, Check, Eye, Edit3 } from 'lucide-react';

interface NoteEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (noteData: {
    title: string;
    content: string;
    category: string;
    tags: string[];
    is_pinned: boolean;
    color: NoteColor;
  }) => Promise<void>;
  initialNote?: Note | null;
}

const CATEGORIES = ['General', 'Work', 'Personal', 'Ideas', 'Tasks', 'Archive'];

const COLOR_OPTIONS: { id: NoteColor; name: string; bgClass: string; borderClass: string }[] = [
  { id: 'default', name: 'Neutral', bgClass: 'bg-white dark:bg-neutral-800', borderClass: 'border-neutral-300 dark:border-neutral-700' },
  { id: 'indigo', name: 'Indigo', bgClass: 'bg-indigo-50/80 dark:bg-indigo-950/40', borderClass: 'border-indigo-200 dark:border-indigo-800' },
  { id: 'emerald', name: 'Emerald', bgClass: 'bg-emerald-50/80 dark:bg-emerald-950/40', borderClass: 'border-emerald-200 dark:border-emerald-800' },
  { id: 'amber', name: 'Amber', bgClass: 'bg-amber-50/80 dark:bg-amber-950/40', borderClass: 'border-amber-200 dark:border-amber-800' },
  { id: 'rose', name: 'Rose', bgClass: 'bg-rose-50/80 dark:bg-rose-950/40', borderClass: 'border-rose-200 dark:border-rose-800' },
  { id: 'sky', name: 'Sky', bgClass: 'bg-sky-50/80 dark:bg-sky-950/40', borderClass: 'border-sky-200 dark:border-sky-800' },
];

export const NoteEditorModal: React.FC<NoteEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialNote,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('General');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [color, setColor] = useState<NoteColor>('default');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialNote) {
      setTitle(initialNote.title);
      setContent(initialNote.content);
      setCategory(initialNote.category || 'General');
      setTags(initialNote.tags || []);
      setIsPinned(initialNote.is_pinned);
      setColor((initialNote.color as NoteColor) || 'default');
    } else {
      setTitle('');
      setContent('');
      setCategory('General');
      setTags([]);
      setIsPinned(false);
      setColor('default');
    }
    setError(null);
    setIsPreview(false);
  }, [initialNote, isOpen]);

  if (!isOpen) return null;

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const clean = tagInput.trim().toLowerCase().replace(/^#/, '');
      if (clean && !tags.includes(clean)) {
        setTags([...tags, clean]);
        setTagInput('');
      }
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Note title is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSave({
        title: title.trim(),
        content: content.trim(),
        category,
        tags,
        is_pinned: isPinned,
        color,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save note.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            handleSubmit(e);
          }
        }}
      >
        {/* Modal Top Bar */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              {initialNote ? 'Edit Note' : 'Create Note'}
            </h2>
            <button
              type="button"
              onClick={() => setIsPinned(!isPinned)}
              className={`p-1.5 rounded-md transition-colors text-xs flex items-center gap-1.5 ${
                isPinned
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium'
                  : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
              title={isPinned ? 'Pinned to top' : 'Pin note to top'}
            >
              <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-amber-600 dark:fill-amber-400' : ''}`} />
              <span>{isPinned ? 'Pinned' : 'Pin'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPreview(!isPreview)}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs flex items-center gap-1.5"
              title={isPreview ? 'Switch to editor' : 'Preview note'}
            >
              {isPreview ? <Edit3 className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>{isPreview ? 'Edit' : 'Preview'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <input
              type="text"
              placeholder="Note title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xl font-semibold text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 bg-transparent border-0 focus:outline-none focus:ring-0 p-0"
              autoFocus
            />
          </div>

          {/* Metadata Controls Strip: Category & Color */}
          <div className="flex flex-wrap items-center justify-between gap-4 py-2 border-y border-neutral-100 dark:border-neutral-800/60 text-xs">
            {/* Category */}
            <div className="flex items-center gap-2">
              <span className="text-neutral-400 dark:text-neutral-500">Category:</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white rounded-md px-2 py-1 border border-neutral-200 dark:border-neutral-700 focus:outline-none"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Color Accent Tints */}
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-400 dark:text-neutral-500 mr-1">Tint:</span>
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  title={c.name}
                  className={`w-5 h-5 rounded-full border transition-all ${c.bgClass} ${c.borderClass} ${
                    color === c.id ? 'ring-2 ring-neutral-900 dark:ring-white scale-110' : 'hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Content area: Editor or Preview */}
          <div className="flex-1 min-h-[220px]">
            {isPreview ? (
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-200 py-2">
                {content || <span className="italic text-neutral-400">Empty note</span>}
              </div>
            ) : (
              <textarea
                placeholder="Write your note here... (Markdown supported)"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-full min-h-[220px] bg-transparent border-0 focus:outline-none focus:ring-0 p-0 text-sm text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 dark:placeholder-neutral-500 resize-none font-sans leading-relaxed"
              />
            )}
          </div>

          {/* Tags */}
          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <Tag className="w-3.5 h-3.5 text-neutral-400 mr-1" />
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-rose-500"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder="Add tag (press Enter)..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                className="text-xs bg-transparent border-0 focus:outline-none p-1 placeholder-neutral-400 dark:placeholder-neutral-500 text-neutral-800 dark:text-neutral-200 w-36"
              />
            </div>
          </div>

          {/* Footer with stats & CTA buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <div className="text-xs font-mono tabular-nums text-neutral-400 dark:text-neutral-500">
              {wordCount} words · {charCount} chars
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-neutral-900 dark:bg-white dark:text-neutral-900 rounded-lg hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-sm disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Saving...' : initialNote ? 'Update Note' : 'Create Note'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
