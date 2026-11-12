// Auth UI Logic
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const logoutBtn = document.getElementById('logout-btn');
  const authAlert = document.getElementById('auth-alert');

  function showAlert(message, type = 'danger') {
    if (!authAlert) return;
    authAlert.textContent = message;
    authAlert.className = `alert alert-${type}`;
    authAlert.classList.remove('hidden');
  }

  function hideAlert() {
    if (!authAlert) return;
    authAlert.classList.add('hidden');
  }

  // Handle Login Page
  if (loginForm) {
    // If already logged in, redirect to dashboard
    api.getMe().then(() => {
      window.location.replace('/');
    }).catch(() => {
      // Not logged in, stay on login page
    });

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      if (!email || !password) {
        showAlert('Please enter both email and password.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging in...';

      try {
        await api.login(email, password);
        window.location.replace('/');
      } catch (err) {
        showAlert(err.message || 'Login failed. Please check your credentials.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Log In';
      }
    });
  }

  // Handle Signup Page
  if (signupForm) {
    // If already logged in, redirect to dashboard
    api.getMe().then(() => {
      window.location.replace('/');
    }).catch(() => {
      // Not logged in, stay on signup page
    });

    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirm-password').value;
      const submitBtn = signupForm.querySelector('button[type="submit"]');

      if (!email || !password) {
        showAlert('Please fill in all required fields.');
        return;
      }

      if (password.length < 6) {
        showAlert('Password must be at least 6 characters long.');
        return;
      }

      if (password !== confirmPassword) {
        showAlert('Passwords do not match.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating account...';

      try {
        await api.signup(email, password);
        window.location.replace('/');
      } catch (err) {
        showAlert(err.message || 'Registration failed.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign Up';
      }
    });
  }

  // Handle Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await api.logout();
      } catch (err) {
        console.error('Logout error:', err);
      } finally {
        window.location.replace('/login');
      }
    });
  }
});
