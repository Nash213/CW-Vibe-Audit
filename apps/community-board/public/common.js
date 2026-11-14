async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function isEdited(item) {
  return new Date(item.updatedAt).getTime() - new Date(item.createdAt).getTime() > 1000;
}

async function initNav() {
  const { user } = await api('/api/auth/me');
  const nav = document.getElementById('nav');
  if (!nav) return user;

  if (user) {
    nav.innerHTML = `
      <a href="/users/${user.id}">${escapeHtml(user.displayName)}</a>
      <button type="button" id="logout-btn" class="btn btn-sm">Log out</button>
    `;
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    });
  } else {
    nav.innerHTML = `
      <a href="/login">Log in</a>
      <a href="/signup" class="btn btn-primary btn-sm">Sign up</a>
    `;
  }
  return user;
}
