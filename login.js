// Login/Signup page - handles user authentication
const SERVER_URL = 'http://localhost:3000';
const REDIRECT_KEY = 'cinemaclub_redirecting';
const USER_STORAGE_KEY = 'movieClubUser';

function getStoredUser() {
  return localStorage.getItem(USER_STORAGE_KEY) || sessionStorage.getItem(USER_STORAGE_KEY);
}

function setStoredUser(user, remember) {
  const payload = JSON.stringify(user);
  if (remember) {
    localStorage.setItem(USER_STORAGE_KEY, payload);
    sessionStorage.removeItem(USER_STORAGE_KEY);
  } else {
    sessionStorage.setItem(USER_STORAGE_KEY, payload);
    localStorage.removeItem(USER_STORAGE_KEY);
  }
}

function clearStoredUser() {
  localStorage.removeItem(USER_STORAGE_KEY);
  sessionStorage.removeItem(USER_STORAGE_KEY);
}

function setFormStatus(targetEl, message, type = 'error') {
  if (!targetEl) return;
  targetEl.textContent = message || '';
  targetEl.classList.remove('success', 'error');
  if (message && type) {
    targetEl.classList.add(type);
  }
}

// Clear any old redirect flags
try {
  const redirectFlag = sessionStorage.getItem(REDIRECT_KEY);
  if (redirectFlag) {
    if (window.location.pathname.includes('login.html') || window.location.pathname.endsWith('/')) {
      sessionStorage.removeItem(REDIRECT_KEY);
    }
  }
} catch (e) {
  // Ignore errors
}

// Check if user is already logged in, redirect appropriately
function checkAuth() {
  // Don't check if we're already on dashboard or welcome
  if (window.location.pathname.includes('dashboard.html') || 
      window.location.pathname.includes('welcome.html')) {
    return false;
  }

  // Check if we're already redirecting - prevent multiple redirects
  if (sessionStorage.getItem(REDIRECT_KEY)) {
    return true;
  }

  const stored = getStoredUser();
  if (stored) {
    try {
      const user = JSON.parse(stored);
      if (user && user.id) {
        // User is logged in, check if they have a club
        const storedGroup = localStorage.getItem('movieClubGroup');
        
        // Mark as redirecting FIRST to prevent multiple attempts
        sessionStorage.setItem(REDIRECT_KEY, 'true');
        
        if (storedGroup) {
          try {
            const group = JSON.parse(storedGroup);
            if (group && group.id) {
              // User has a club, redirect to dashboard
              window.location.replace('dashboard.html');
              return true;
            }
          } catch (e) {
            // Invalid group data, continue to welcome
          }
        }
        
        // User is logged in but no club, redirect to welcome
        window.location.replace('welcome.html');
        return true;
      }
    } catch (e) {
      // Invalid stored data, continue with login page
      // Clear redirect flag if data is invalid
      try {
        sessionStorage.removeItem(REDIRECT_KEY);
      } catch (e2) {
        // Ignore errors
      }
    }
  }
  return false;
}

// Initialize login page
function initialize() {
  // Don't initialize if we're redirecting
  if (sessionStorage.getItem(REDIRECT_KEY)) {
    return;
  }

  // Get elements
  const setupTabs = document.querySelectorAll('.setup-tab-btn');
  const setupTabContents = document.querySelectorAll('.setup-tab-content');
  const signinForm = document.getElementById('signin-form');
  const signupForm = document.getElementById('signup-form');
  const passwordRecoveryBtn = document.getElementById('password-recovery-btn');
  const recoveryModal = document.getElementById('recovery-modal');
  const closeRecoveryModal = document.getElementById('close-recovery-modal');
  const recoveryForm = document.getElementById('recovery-form');
  const signinStatus = document.getElementById('signin-status');
  const signupStatus = document.getElementById('signup-status');
  const recoveryStatus = document.getElementById('recovery-status');
  const rememberCheckbox = document.getElementById('signin-remember');
  const passwordToggles = document.querySelectorAll('.toggle-password');

  setupMenuDropdown();

  // Tab switching
  if (setupTabs && setupTabContents && setupTabs.length > 0) {
    // Make sure initial active tab is shown first
    const activeTab = document.querySelector('.setup-tab-btn.active');
    if (activeTab) {
      const activeTabId = activeTab.dataset.tab;
      const activeTabContent = document.getElementById(activeTabId + '-tab');
      if (activeTabContent) {
        activeTabContent.classList.add('active');
      }
    }

    setupTabs.forEach((btn) => {
      const isActive = btn.classList.contains('active');
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    setupTabContents.forEach((panel) => {
      const isActive = panel.classList.contains('active');
      panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });
    
    // Attach click handlers directly to each tab button
    setupTabs.forEach((btn) => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const targetTab = this.dataset.tab;
        if (!targetTab) return;
        
        // Remove active from all tabs
        setupTabs.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
          b.setAttribute('tabindex', '-1');
        });
        
        // Remove active from all tab contents  
        setupTabContents.forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-hidden', 'true');
        });
        
        // Add active to clicked tab button
        this.classList.add('active');
        this.setAttribute('aria-selected', 'true');
        this.setAttribute('tabindex', '0');
        
        // Show target tab content
        const targetTabEl = document.getElementById(targetTab + '-tab');
        if (targetTabEl) {
          targetTabEl.classList.add('active');
          targetTabEl.setAttribute('aria-hidden', 'false');
        }
      });

      btn.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const tabs = Array.from(setupTabs);
        const currentIndex = tabs.indexOf(btn);
        const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
        tabs[nextIndex].focus();
        tabs[nextIndex].click();
      });
    });
  }

  if (passwordToggles && passwordToggles.length > 0) {
    passwordToggles.forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const targetId = toggle.dataset.target;
        const targetInput = targetId ? document.getElementById(targetId) : null;
        if (!targetInput) return;
        const showing = targetInput.type === 'text';
        targetInput.type = showing ? 'password' : 'text';
        toggle.setAttribute('aria-pressed', String(!showing));
        toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        toggle.textContent = showing ? '👁️' : '🙈';
      });
    });
  }

  // Sign in form handler
  if (signinForm) {
    signinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setFormStatus(signinStatus, '');
      const username = document.getElementById('signin-username').value.trim();
      const password = document.getElementById('signin-password').value;
      
      if (!username || !password) {
        setFormStatus(signinStatus, 'Please fill in all required fields.');
        return;
      }

      try {
        // Sign in existing user
        const signinRes = await fetch((SERVER_URL || '') + '/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        
        if (!signinRes.ok) {
          const errorText = await signinRes.text();
          setFormStatus(signinStatus, 'Sign in failed: Server returned ' + signinRes.status + '. ' + errorText);
          return;
        }
        
        const signinData = await signinRes.json();
        if (!signinData.ok) {
          setFormStatus(signinStatus, 'Sign in failed: ' + (signinData.error || 'Unknown error'));
          return;
        }

        const currentUser = signinData.user;

        // Check if user has a group
        const storedGroup = localStorage.getItem('movieClubGroup');
        let currentGroup = null;
        if (storedGroup) {
          try {
            currentGroup = JSON.parse(storedGroup);
            currentUser.groupId = currentGroup.id;
          } catch (e) {
            // Invalid group data, will redirect to welcome
          }
        }

        // Save user to storage (remember me determines persistence)
        const remember = rememberCheckbox ? rememberCheckbox.checked : true;
        setStoredUser(currentUser, remember);
        
        // Clear redirect flag before navigating
        try {
          sessionStorage.removeItem(REDIRECT_KEY);
        } catch (e) {
          // Ignore errors
        }

        // Redirect based on whether user has a club
        if (currentGroup && currentGroup.id) {
          // User has a club, go to dashboard
          window.location.replace('dashboard.html');
        } else {
          // User doesn't have a club, go to welcome page
          window.location.replace('welcome.html');
        }

      } catch (err) {
        console.error('Sign in error:', err);
        setFormStatus(signinStatus, 'Network error. Make sure the server is running on port 3000.');
      }
    });
  }

  // Sign up form handler
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setFormStatus(signupStatus, '');
      const username = document.getElementById('signup-username').value.trim();
      const password = document.getElementById('signup-password').value;
      const confirmPassword = document.getElementById('signup-password-confirm').value;
      const securityQuestion = document.getElementById('signup-security-question').value;
      const securityAnswer = document.getElementById('signup-security-answer').value.trim();
      const genres = Array.from(document.querySelectorAll('input[name="signup-genre"]:checked')).map(el => el.value);
      
      if (!username || !password || !confirmPassword || !securityQuestion || !securityAnswer) {
        setFormStatus(signupStatus, 'Please fill in all required fields.');
        return;
      }

      if (password !== confirmPassword) {
        setFormStatus(signupStatus, 'Passwords do not match.');
        return;
      }

      try {
        // Sign up user
        const signupRes = await fetch((SERVER_URL || '') + '/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, securityQuestion, securityAnswer, genres })
        });
        
        if (!signupRes.ok) {
          const errorText = await signupRes.text();
          setFormStatus(signupStatus, 'Sign up failed: Server returned ' + signupRes.status + '. ' + errorText);
          return;
        }
        
        const signupData = await signupRes.json();
        if (!signupData.ok) {
          setFormStatus(signupStatus, 'Sign up failed: ' + (signupData.error || 'Unknown error'));
          return;
        }

        const currentUser = signupData.user;

        // Save user (sign-up defaults to remember)
        setStoredUser(currentUser, true);
        
        // Clear redirect flag before navigating
        try {
          sessionStorage.removeItem(REDIRECT_KEY);
        } catch (e) {
          // Ignore errors
        }

        // New users go to welcome page to create/join a club
        window.location.replace('welcome.html');

      } catch (err) {
        console.error('Sign up error:', err);
        setFormStatus(signupStatus, 'Network error. Make sure the server is running on port 3000.');
      }
    });
  }

  if (passwordRecoveryBtn) {
    passwordRecoveryBtn.addEventListener('click', () => {
      setFormStatus(recoveryStatus, '');
      if (recoveryModal) recoveryModal.classList.remove('hidden');
    });
  }

  if (closeRecoveryModal) {
    closeRecoveryModal.addEventListener('click', () => {
      setFormStatus(recoveryStatus, '');
      if (recoveryModal) recoveryModal.classList.add('hidden');
    });
  }

  if (recoveryModal) {
    recoveryModal.addEventListener('click', (e) => {
      if (e.target === recoveryModal) {
        setFormStatus(recoveryStatus, '');
        recoveryModal.classList.add('hidden');
      }
    });
  }

  if (recoveryForm) {
    recoveryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setFormStatus(recoveryStatus, '');
      const username = document.getElementById('recovery-username').value.trim();
      const securityQuestion = document.getElementById('recovery-security-question').value;
      const securityAnswer = document.getElementById('recovery-security-answer').value.trim();
      const password = document.getElementById('recovery-password').value;
      const confirmPassword = document.getElementById('recovery-password-confirm').value;

      if (!username || !securityQuestion || !securityAnswer || !password || !confirmPassword) {
        setFormStatus(recoveryStatus, 'Please fill in all required fields.');
        return;
      }

      if (password !== confirmPassword) {
        setFormStatus(recoveryStatus, 'Passwords do not match.');
        return;
      }

      try {
        const recoveryRes = await fetch((SERVER_URL || '') + '/recover-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, securityQuestion, securityAnswer, password })
        });

        if (!recoveryRes.ok) {
          const errorText = await recoveryRes.text();
          setFormStatus(recoveryStatus, 'Password reset failed: Server returned ' + recoveryRes.status + '. ' + errorText);
          return;
        }

        const recoveryData = await recoveryRes.json();
        if (!recoveryData.ok) {
          setFormStatus(recoveryStatus, 'Password reset failed: ' + (recoveryData.error || 'Unknown error'));
          return;
        }

        setFormStatus(recoveryStatus, '✓ Password updated. You can now sign in.', 'success');
        recoveryForm.reset();
        if (recoveryModal) recoveryModal.classList.add('hidden');
      } catch (err) {
        console.error('Password reset error:', err);
        setFormStatus(recoveryStatus, 'Network error. Make sure the server is running on port 3000.');
      }
    });
  }
}

function handleMenuAction(action) {
  if (!action) return;
  if (action === 'profile') {
    alert('Please sign in to view your profile');
    return;
  }
  if (action === 'switch-clubs') {
    window.location.href = 'welcome.html';
    return;
  }
  if (action === 'logout') {
    clearStoredUser();
    localStorage.removeItem('movieClubGroup');
    window.location.href = 'login.html';
  }
}

function setupMenuDropdown() {
  const menu = document.querySelector('.menu-dropdown');
  if (!menu) return;
  const toggle = menu.querySelector('.menu-toggle');
  const panel = menu.querySelector('.menu-panel');
  if (!toggle || !panel) return;
  updateMenuLabel(toggle);

  const closePanel = () => panel.classList.add('hidden');

  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    panel.classList.toggle('hidden');
  });

  panel.querySelectorAll('.menu-item').forEach((item) => {
    item.addEventListener('click', () => {
      closePanel();
      handleMenuAction(item.dataset.action);
    });
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) closePanel();
  });
}

function updateMenuLabel(toggle) {
  try {
    const stored = getStoredUser();
    if (stored) {
      const user = JSON.parse(stored);
      const label = user?.username || user?.name;
    if (label) {
      toggle.textContent = label;
        return;
      }
    }
  } catch (e) {
    // Ignore storage errors
  }
  toggle.textContent = '☰ Menu';
}

// Wait for DOM to be ready
(function() {
  // Exit immediately if already redirecting
  if (sessionStorage.getItem(REDIRECT_KEY)) {
    return;
  }

  // Check auth FIRST - before any DOM manipulation
  if (checkAuth()) {
    // User is logged in, redirect is in progress
    return;
  }

  // User is not logged in, proceed with initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      if (!sessionStorage.getItem(REDIRECT_KEY)) {
        initialize();
      }
    });
  } else {
    // DOM already loaded
    if (!sessionStorage.getItem(REDIRECT_KEY)) {
      initialize();
    }
  }
})();
