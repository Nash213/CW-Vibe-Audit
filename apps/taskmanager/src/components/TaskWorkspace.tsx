import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Circle, Clock, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  ApiError,
  createTask,
  deleteTask,
  fetchTasks,
  logout,
  updateTask,
} from '../api';
import {
  STATUS_LABELS,
  TASK_STATUSES,
  type Task,
  type TaskCounts,
  type TaskStatus,
  type User,
} from '../types';

type StatusFilter = 'all' | TaskStatus;

interface TaskWorkspaceProps {
  user: User;
  onLoggedOut: () => void;
}

function StatusDisplay({ status }: { status: TaskStatus }) {
  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
        <span>{STATUS_LABELS[status]}</span>
      </span>
    );
  }
  if (status === 'in progress') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap shrink-0">
        <Clock className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
        <span>{STATUS_LABELS[status]}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap shrink-0">
      <Circle className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
      <span>{STATUS_LABELS[status]}</span>
    </span>
  );
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function TaskWorkspace({ user, onLoggedOut }: TaskWorkspaceProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState<TaskCounts>({
    total: 0,
    todo: 0,
    inProgress: 0,
    done: 0,
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Add Task form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newStatus, setNewStatus] = useState<TaskStatus>('to do');
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Inline Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<TaskStatus>('to do');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Inline Delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [loggingOut, setLoggingOut] = useState(false);

  const loadTasks = useCallback(
    async (filter: StatusFilter) => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchTasks(filter);
        setTasks(data.tasks);
        setCounts(data.counts);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          onLoggedOut();
          return;
        }
        setLoadError(err instanceof Error ? err.message : 'Failed to load tasks.');
      } finally {
        setLoading(false);
      }
    },
    [onLoggedOut]
  );

  useEffect(() => {
    void loadTasks(statusFilter);
  }, [statusFilter, loadTasks]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      onLoggedOut();
    }
  };

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) {
      setFormError('Please enter a task title.');
      return;
    }

    setCreating(true);
    try {
      await createTask({
        title: trimmedTitle,
        description: newDescription.trim(),
        status: newStatus,
      });
      setNewTitle('');
      setNewDescription('');
      setNewStatus('to do');
      await loadTasks(statusFilter);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut();
        return;
      }
      setFormError(err instanceof Error ? err.message : 'Unable to add task.');
    } finally {
      setCreating(false);
    }
  };

  const startEditing = (task: Task) => {
    setConfirmDeleteId(null);
    setEditError(null);
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description);
    setEditStatus(task.status);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleSaveEdit = async (event: FormEvent<HTMLFormElement>, taskId: string) => {
    event.preventDefault();
    setEditError(null);

    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      setEditError('Task title cannot be empty.');
      return;
    }

    setSavingEdit(true);
    try {
      await updateTask(taskId, {
        title: trimmedTitle,
        description: editDescription.trim(),
        status: editStatus,
      });
      setEditingId(null);
      await loadTasks(statusFilter);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut();
        return;
      }
      setEditError(err instanceof Error ? err.message : 'Unable to update task.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setDeletingId(taskId);
    setLoadError(null);
    try {
      await deleteTask(taskId);
      setConfirmDeleteId(null);
      await loadTasks(statusFilter);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut();
        return;
      }
      setLoadError(err instanceof Error ? err.message : 'Unable to delete task.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              setStatusFilter('all');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            ClearList
          </a>

          <div className="hidden sm:flex items-center gap-6 text-sm text-slate-600 min-w-0">
            <span className="truncate">{user.email}</span>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {loggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </header>

      <main className="flex-1 py-10 px-6">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                My Tasks
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Signed in as <span className="font-medium text-slate-800">{user.email}</span>
              </p>
            </div>
          </div>

          <section
            aria-label="Task summary"
            className="bg-white border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200"
          >
            <div className="px-5 py-4">
              <div className="text-xs font-medium text-slate-500">All tasks</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                {counts.total}
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-xs font-medium text-slate-500">To do</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                {counts.todo}
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-xs font-medium text-amber-700">In progress</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                {counts.inProgress}
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-xs font-medium text-emerald-700">Done</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                {counts.done}
              </div>
            </div>
          </section>

          <section
            aria-labelledby="add-task-heading"
            className="bg-white border border-slate-200 rounded-xl p-6"
          >
            <h2 id="add-task-heading" className="text-base font-semibold text-slate-900 mb-4">
              Add a task
            </h2>

            {formError && (
              <div
                role="alert"
                className="mb-4 px-4 py-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg"
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-8">
                  <label htmlFor="new-task-title" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Title
                  </label>
                  <input
                    id="new-task-title"
                    name="title"
                    type="text"
                    required
                    maxLength={200}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="What needs to be done?"
                    className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>

                <div className="md:col-span-4">
                  <label htmlFor="new-task-status" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Status
                  </label>
                  <select
                    id="new-task-status"
                    name="status"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
                    className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  >
                    {TASK_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-task-description"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Description
                </label>
                <textarea
                  id="new-task-description"
                  name="description"
                  rows={2}
                  maxLength={2000}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Optional details or notes"
                  className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 resize-y"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900 disabled:opacity-60 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>{creating ? 'Adding...' : 'Add task'}</span>
                </button>
              </div>
            </form>
          </section>

          <section
            aria-labelledby="task-list-heading"
            className="bg-white border border-slate-200 rounded-xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-baseline gap-3">
                <h2 id="task-list-heading" className="text-base font-semibold text-slate-900">
                  Task list
                </h2>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <label htmlFor="status-filter" className="text-sm font-medium text-slate-600 whitespace-nowrap">
                  Filter by status
                </label>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="px-3 py-1.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                >
                  <option value="all">All statuses</option>
                  {TASK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loadError && (
              <div
                role="alert"
                className="mx-6 mt-4 px-4 py-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between gap-4"
              >
                <span>{loadError}</span>
                <button
                  type="button"
                  onClick={() => void loadTasks(statusFilter)}
                  className="font-semibold text-red-900 underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {loading ? (
              <div className="divide-y divide-slate-200" aria-busy="true" aria-label="Loading tasks">
                {[0, 1, 2].map((idx) => (
                  <div key={idx} className="px-6 py-5 animate-pulse flex items-center justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-slate-200 rounded w-1/3" />
                      <div className="h-3 bg-slate-100 rounded w-2/3" />
                    </div>
                    <div className="h-8 w-28 bg-slate-100 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <h3 className="text-sm font-semibold text-slate-900">
                  {statusFilter === 'all'
                    ? 'No tasks yet'
                    : `No tasks with status "${STATUS_LABELS[statusFilter]}"`}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {statusFilter === 'all'
                    ? 'Use the form above to add your first task.'
                    : 'Try selecting a different status filter or create a new task.'}
                </p>
                {statusFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className="mt-4 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Show all statuses
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {tasks.map((task) => {
                  const isEditing = editingId === task.id;
                  const isConfirmingDelete = confirmDeleteId === task.id;
                  const isDeleting = deletingId === task.id;

                  if (isEditing) {
                    return (
                      <li key={task.id} className="px-6 py-5 bg-slate-50">
                        <form onSubmit={(e) => handleSaveEdit(e, task.id)} className="space-y-4">
                          {editError && (
                            <div
                              role="alert"
                              className="px-3.5 py-2.5 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg"
                            >
                              {editError}
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                            <div className="md:col-span-8">
                              <label
                                htmlFor={`edit-title-${task.id}`}
                                className="block text-xs font-medium text-slate-700 mb-1"
                              >
                                Title
                              </label>
                              <input
                                id={`edit-title-${task.id}`}
                                type="text"
                                required
                                maxLength={200}
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                              />
                            </div>

                            <div className="md:col-span-4">
                              <label
                                htmlFor={`edit-status-${task.id}`}
                                className="block text-xs font-medium text-slate-700 mb-1"
                              >
                                Status
                              </label>
                              <select
                                id={`edit-status-${task.id}`}
                                value={editStatus}
                                onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                                className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                              >
                                {TASK_STATUSES.map((status) => (
                                  <option key={status} value={status}>
                                    {STATUS_LABELS[status]}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label
                              htmlFor={`edit-desc-${task.id}`}
                              className="block text-xs font-medium text-slate-700 mb-1"
                            >
                              Description
                            </label>
                            <textarea
                              id={`edit-desc-${task.id}`}
                              rows={2}
                              maxLength={2000}
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 resize-y"
                            />
                          </div>

                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={cancelEditing}
                              disabled={savingEdit}
                              className="px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={savingEdit}
                              className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              {savingEdit ? 'Saving...' : 'Save changes'}
                            </button>
                          </div>
                        </form>
                      </li>
                    );
                  }

                  return (
                    <li
                      key={task.id}
                      className="px-6 py-4 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <h3
                            className={`text-sm font-semibold ${
                              task.status === 'done'
                                ? 'line-through text-slate-500'
                                : 'text-slate-900'
                            }`}
                          >
                            {task.title}
                          </h3>
                          <span className="text-slate-300" aria-hidden="true">
                            ·
                          </span>
                          <StatusDisplay status={task.status} />
                        </div>

                        {task.description && (
                          <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">
                            {task.description}
                          </p>
                        )}

                        <div className="text-xs text-slate-500 font-mono tabular-nums">
                          Updated {formatDate(task.updatedAt)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isConfirmingDelete ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleDeleteTask(task.id)}
                              disabled={isDeleting}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              {isDeleting ? 'Deleting...' : 'Confirm delete'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={isDeleting}
                              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditing(task)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(null);
                                setConfirmDeleteId(task.id);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-slate-200 rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
