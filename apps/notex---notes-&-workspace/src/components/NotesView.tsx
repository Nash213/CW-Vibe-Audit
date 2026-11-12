import React, { useState } from 'react';
import type { Note } from '../types.ts';
import {
  Search,
  Pin,
  Trash2,
  Edit2,
  Copy,
  Check,
  Grid,
  List as ListIcon,
  Plus,
  FileText,
  X,
} from 'lucide-react';

interface NotesViewProps {
  notes: Note[];
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  onlyPinned: boolean;
  setOnlyPinned: (pinned: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onEditNote: (note: Note) => void;
  onDeleteNote: (id: number) => void;
  onTogglePin: (id: number) => void;
  onNewNote: () => void;
}

const CATEGORIES = ['All', 'General', 'Work', 'Personal', 'Ideas', 'Tasks', 'Archive'];

function getCardStyle(color: string) {
  switch (color) {
    case 'indigo':
      return 'bg-indigo-50/70 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/60 hover:border-indigo-300 dark:hover:border-indigo-800';
    case 'emerald':
      return 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60 hover:border-emerald-300 dark:hover:border-emerald-800';
    case 'amber':
      return 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60 hover:border-amber-300 dark:hover:border-amber-800';
    case 'rose':
      return 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60 hover:border-rose-300 dark:hover:border-rose-800';
    case 'sky':
      return 'bg-sky-50/70 dark:bg-sky-950/20 border-sky-200 dark:border-sky-900/60 hover:border-sky-300 dark:hover:border-sky-800';
    case 'purple':
      return 'bg-purple-50/70 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900/60 hover:border-purple-300 dark:hover:border-purple-800';
    default:
      return 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700';
  }
}

function formatDate(isoString: string) {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

export const NotesView: React.FC<NotesViewProps> = ({
  notes,
  selectedCategory,
  setSelectedCategory,
  selectedTag,
  setSelectedTag,
  onlyPinned,
  setOnlyPinned,
  searchQuery,
  setSearchQuery,
  onEditNote,
  onDeleteNote,
  onTogglePin,
  onNewNote,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Filter notes client-side if needed
  const filteredNotes = notes.filter((n) => {
    if (onlyPinned && !n.is_pinned) return false;
    if (selectedCategory !== 'All' && n.category !== selectedCategory) return false;
    if (selectedTag && !n.tags.includes(selectedTag)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const inTitle = n.title.toLowerCase().includes(q);
      const inContent = n.content.toLowerCase().includes(q);
      const inTags = n.tags.some((t) => t.toLowerCase().includes(q));
      if (!inTitle && !inContent && !inTags) return false;
    }
    return true;
  });

  const handleCopy = (note: Note, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${note.title}\n\n${note.content}`);
    setCopiedId(note.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Top Filter & Search Toolbar */}
      <div className="p-4 md:p-6 border-b border-neutral-200 dark:border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search notes, tags, or contents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm rounded-lg bg-neutral-100 dark:bg-neutral-800/80 border border-transparent focus:border-neutral-300 dark:focus:border-neutral-700 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* View Controls & Category Chips */}
        <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
          {/* Active Tag filter indicator */}
          {selectedTag && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-md">
              <span>#{selectedTag}</span>
              <button onClick={() => setSelectedTag(null)}>
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Grid / List switch */}
          <div className="flex items-center p-0.5 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
              title="Grid view"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
              title="List view"
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Category Scrollbar (hidden on desktop where Sidebar handles it) */}
      <div className="flex md:hidden items-center gap-1.5 px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto text-xs">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setSelectedCategory(cat);
              setOnlyPinned(false);
            }}
            className={`px-3 py-1 rounded-md whitespace-nowrap transition-colors ${
              selectedCategory === cat && !onlyPinned
                ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Notes Container */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        {filteredNotes.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-center max-w-sm mx-auto">
            <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 mb-4">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white mb-1">
              {searchQuery || selectedTag || selectedCategory !== 'All'
                ? 'No matching notes found'
                : 'No notes yet'}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-5 leading-relaxed">
              {searchQuery || selectedTag || selectedCategory !== 'All'
                ? 'Try broadening your search query or removing the active filters.'
                : 'Create your first note to capture ideas, meeting takeaways, or task roadmaps.'}
            </p>
            <button
              onClick={onNewNote}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-neutral-900 dark:bg-white dark:text-neutral-900 rounded-lg hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Create Note</span>
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredNotes.map((note) => {
              const cardClass = getCardStyle(note.color);

              return (
                <div
                  key={note.id}
                  onClick={() => onEditNote(note)}
                  className={`group relative rounded-xl border p-5 flex flex-col justify-between transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md ${cardClass}`}
                >
                  <div>
                    {/* Header: Title + Pin button */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-semibold text-neutral-900 dark:text-white text-base leading-snug break-words">
                        {note.title}
                      </h3>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePin(note.id);
                        }}
                        className={`p-1.5 rounded-md transition-colors shrink-0 ${
                          note.is_pinned
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-neutral-300 dark:text-neutral-600 hover:text-neutral-600 dark:hover:text-neutral-300 opacity-0 group-hover:opacity-100'
                        }`}
                        title={note.is_pinned ? 'Unpin note' : 'Pin note'}
                      >
                        <Pin
                          className={`w-4 h-4 ${note.is_pinned ? 'fill-amber-500' : ''}`}
                        />
                      </button>
                    </div>

                    {/* Excerpt */}
                    <p className="text-xs text-neutral-600 dark:text-neutral-300 whitespace-pre-line line-clamp-4 leading-relaxed mb-4">
                      {note.content || <span className="italic text-neutral-400">Empty note</span>}
                    </p>
                  </div>

                  <div>
                    {/* Tags row */}
                    {note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {note.tags.map((t) => (
                          <span
                            key={t}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTag(t);
                            }}
                            className="text-[11px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Unboxed Metadata & Action Buttons */}
                    <div className="pt-3 border-t border-neutral-200/50 dark:border-neutral-800/60 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-medium text-neutral-700 dark:text-neutral-300">
                          {note.category}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatDate(note.updated_at || note.created_at)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => handleCopy(note, e)}
                          className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded"
                          title="Copy content"
                        >
                          {copiedId === note.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditNote(note);
                          }}
                          className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded"
                          title="Edit note"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Delete this note?')) {
                              onDeleteNote(note.id);
                            }
                          }}
                          className="p-1 text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 rounded"
                          title="Delete note"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List Mode */
          <div className="space-y-2">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => onEditNote(note)}
                className="group flex items-center justify-between p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin(note.id);
                    }}
                    className={`p-1 rounded shrink-0 ${
                      note.is_pinned
                        ? 'text-amber-500'
                        : 'text-neutral-300 dark:text-neutral-600 hover:text-neutral-600'
                    }`}
                  >
                    <Pin className={`w-4 h-4 ${note.is_pinned ? 'fill-amber-500' : ''}`} />
                  </button>

                  <div className="min-w-0 flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-neutral-900 dark:text-white truncate">
                        {note.title}
                      </span>
                      <span className="text-xs text-neutral-400 shrink-0">·</span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">
                        {note.category}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                      {note.content}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="font-mono tabular-nums hidden sm:inline">
                    {formatDate(note.updated_at || note.created_at)}
                  </span>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => handleCopy(note, e)}
                      className="p-1 hover:text-neutral-900 dark:hover:text-white rounded"
                      title="Copy"
                    >
                      {copiedId === note.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditNote(note);
                      }}
                      className="p-1 hover:text-neutral-900 dark:hover:text-white rounded"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('Delete this note?')) {
                          onDeleteNote(note.id);
                        }
                      }}
                      className="p-1 hover:text-rose-600 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
