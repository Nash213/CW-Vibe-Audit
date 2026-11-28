// Main Tasks Dashboard Logic
document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const userEmailElem = document.getElementById('user-email');
  const addTaskForm = document.getElementById('add-task-form');
  const taskListElem = document.getElementById('task-list');
  const emptyStateElem = document.getElementById('empty-state');
  const statusFilterElem = document.getElementById('status-filter');
  const dashboardAlert = document.getElementById('dashboard-alert');

  // Stats Elements
  const statTotal = document.getElementById('stat-total');
  const statTodo = document.getElementById('stat-todo');
  const statProgress = document.getElementById('stat-progress');
  const statDone = document.getElementById('stat-done');

  // Edit Modal Elements
  const editModal = document.getElementById('edit-modal');
  const editForm = document.getElementById('edit-task-form');
  const editIdInput = document.getElementById('edit-task-id');
  const editTitleInput = document.getElementById('edit-title');
  const editDescInput = document.getElementById('edit-description');
  const editStatusSelect = document.getElementById('edit-status');
  const closeEditBtn = document.getElementById('close-edit-modal');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');

  let currentTasks = [];
  let currentFilter = 'all';

  function showAlert(message, type = 'danger') {
    if (!dashboardAlert) return;
    dashboardAlert.textContent = message;
    dashboardAlert.className = `alert alert-${type}`;
    dashboardAlert.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Auto-dismiss after 4 seconds for success
    if (type === 'success') {
      setTimeout(() => {
        dashboardAlert.classList.add('hidden');
      }, 4000);
    }
  }

  function hideAlert() {
    if (!dashboardAlert) return;
    dashboardAlert.classList.add('hidden');
  }

  // 1. Authenticate user
  try {
    const { user } = await api.getMe();
    if (userEmailElem) {
      userEmailElem.textContent = user.email;
    }
  } catch (err) {
    // If not authenticated, redirect to login
    window.location.replace('/login');
    return;
  }

  // Format date helper
  function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Status badge class helper
  function getStatusBadgeClass(status) {
    switch (status) {
      case 'in progress':
        return 'badge-in-progress';
      case 'done':
        return 'badge-done';
      case 'to do':
      default:
        return 'badge-todo';
    }
  }

  // Escape HTML helper to prevent XSS
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Update Stats Counters
  async function updateStats() {
    try {
      // Fetch all tasks for stats
      const allTasks = await api.getTasks('all');
      let todoCount = 0;
      let progressCount = 0;
      let doneCount = 0;

      allTasks.forEach(task => {
        if (task.status === 'to do') todoCount++;
        else if (task.status === 'in progress') progressCount++;
        else if (task.status === 'done') doneCount++;
      });

      if (statTotal) statTotal.textContent = allTasks.length;
      if (statTodo) statTodo.textContent = todoCount;
      if (statProgress) statProgress.textContent = progressCount;
      if (statDone) statDone.textContent = doneCount;
    } catch (err) {
      console.error('Failed to update stats:', err);
    }
  }

  // Render tasks in DOM
  function renderTasks(tasks) {
    currentTasks = tasks;
    taskListElem.innerHTML = '';

    if (!tasks || tasks.length === 0) {
      emptyStateElem.classList.remove('hidden');
      return;
    }

    emptyStateElem.classList.add('hidden');

    tasks.forEach(task => {
      const taskCard = document.createElement('div');
      taskCard.className = 'task-item';
      taskCard.setAttribute('data-id', task.id);

      const badgeClass = getStatusBadgeClass(task.status);
      const safeTitle = escapeHtml(task.title);
      const safeDescription = escapeHtml(task.description);
      const dateText = formatDate(task.created_at);

      taskCard.innerHTML = `
        <div class="task-top">
          <h3 class="task-title">${safeTitle}</h3>
          <span class="badge ${badgeClass}">${task.status}</span>
        </div>
        ${safeDescription ? `<p class="task-desc">${safeDescription}</p>` : ''}
        <div class="task-footer">
          <span>Created on ${dateText}</span>
          <div class="task-actions">
            <button class="btn btn-secondary btn-sm edit-task-btn" data-id="${task.id}">
              ✏️ Edit
            </button>
            <button class="btn btn-danger btn-sm delete-task-btn" data-id="${task.id}">
              🗑️ Delete
            </button>
          </div>
        </div>
      `;

      taskListElem.appendChild(taskCard);
    });

    // Attach edit and delete event listeners
    attachTaskActionListeners();
  }

  // Load tasks with current filter
  async function loadTasks() {
    try {
      const tasks = await api.getTasks(currentFilter);
      renderTasks(tasks);
      updateStats();
    } catch (err) {
      showAlert(err.message || 'Error loading tasks');
    }
  }

  // Handle Add Task Form Submit
  if (addTaskForm) {
    addTaskForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();

      const titleInput = document.getElementById('task-title');
      const descInput = document.getElementById('task-desc');
      const statusInput = document.getElementById('task-status');
      const submitBtn = addTaskForm.querySelector('button[type="submit"]');

      const title = titleInput.value.trim();
      const description = descInput.value.trim();
      const status = statusInput.value;

      if (!title) {
        showAlert('Please provide a title for the task.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Adding...';

      try {
        await api.createTask({ title, description, status });
        showAlert('Task created successfully!', 'success');
        addTaskForm.reset();
        await loadTasks();
      } catch (err) {
        showAlert(err.message || 'Failed to create task');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Task';
      }
    });
  }

  // Handle Status Filter Change
  if (statusFilterElem) {
    statusFilterElem.addEventListener('change', async (e) => {
      currentFilter = e.target.value;
      await loadTasks();
    });
  }

  // Attach Edit and Delete listeners
  function attachTaskActionListeners() {
    // Delete buttons
    document.querySelectorAll('.delete-task-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const taskId = e.currentTarget.getAttribute('data-id');
        const task = currentTasks.find(t => t.id == taskId);
        const taskTitle = task ? `"${task.title}"` : 'this task';

        if (confirm(`Are you sure you want to delete ${taskTitle}?`)) {
          try {
            await api.deleteTask(taskId);
            showAlert('Task deleted successfully.', 'success');
            await loadTasks();
          } catch (err) {
            showAlert(err.message || 'Failed to delete task.');
          }
        }
      });
    });

    // Edit buttons
    document.querySelectorAll('.edit-task-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const taskId = e.currentTarget.getAttribute('data-id');
        const task = currentTasks.find(t => t.id == taskId);
        if (!task) return;

        editIdInput.value = task.id;
        editTitleInput.value = task.title;
        editDescInput.value = task.description || '';
        editStatusSelect.value = task.status;

        openEditModal();
      });
    });
  }

  // Modal handlers
  function openEditModal() {
    if (editModal) editModal.classList.remove('hidden');
  }

  function closeEditModal() {
    if (editModal) editModal.classList.add('hidden');
  }

  if (closeEditBtn) closeEditBtn.addEventListener('click', closeEditModal);
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditModal);

  if (editModal) {
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) closeEditModal();
    });
  }

  // Handle Edit Form Submission
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = editIdInput.value;
      const title = editTitleInput.value.trim();
      const description = editDescInput.value.trim();
      const status = editStatusSelect.value;
      const saveBtn = editForm.querySelector('button[type="submit"]');

      if (!title) {
        alert('Title cannot be empty.');
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        await api.updateTask(id, { title, description, status });
        closeEditModal();
        showAlert('Task updated successfully!', 'success');
        await loadTasks();
      } catch (err) {
        alert(err.message || 'Failed to update task.');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
      }
    });
  }

  // Initial load
  await loadTasks();
});
