// Welcome page - handles club creation and joining
const SERVER_URL = 'http://localhost:3000';

// Check if already redirecting (using sessionStorage to persist across potential re-executions)
const REDIRECT_KEY = 'cinemaclub_redirecting';
const USER_STORAGE_KEY = 'movieClubUser';

function getStoredUser() {
  return localStorage.getItem(USER_STORAGE_KEY) || sessionStorage.getItem(USER_STORAGE_KEY);
}

function setStoredUser(user) {
  const payload = JSON.stringify(user);
  if (localStorage.getItem(USER_STORAGE_KEY)) {
    localStorage.setItem(USER_STORAGE_KEY, payload);
    return;
  }
  if (sessionStorage.getItem(USER_STORAGE_KEY)) {
    sessionStorage.setItem(USER_STORAGE_KEY, payload);
    return;
  }
  localStorage.setItem(USER_STORAGE_KEY, payload);
}

function clearStoredUser() {
  localStorage.removeItem(USER_STORAGE_KEY);
  sessionStorage.removeItem(USER_STORAGE_KEY);
}

// Clear any old redirect flags that might be blocking (safety measure)
// This ensures the page works even if a previous redirect didn't complete
try {
  const redirectFlag = sessionStorage.getItem(REDIRECT_KEY);
  if (redirectFlag) {
    console.log('Found redirect flag, clearing it...'); // Debug
    // Only clear if we're actually on the welcome page (not mid-redirect)
    if (window.location.pathname.includes('welcome.html') || window.location.pathname.endsWith('/')) {
      sessionStorage.removeItem(REDIRECT_KEY);
      console.log('Redirect flag cleared'); // Debug
    }
  }
} catch (e) {
  console.error('Error checking sessionStorage:', e); // Debug
}

// Check if user is authenticated - redirect to login if not, dashboard if has club
function checkAuth() {
  // Don't check if we're already on dashboard or login
  if (window.location.pathname.includes('dashboard.html') || 
      window.location.pathname.includes('login.html')) {
    return false;
  }

  // Check if we're already redirecting - prevent multiple redirects
  if (sessionStorage.getItem(REDIRECT_KEY)) {
    return true;
  }

  const stored = getStoredUser();
  if (!stored) {
    // No user found, redirect to login
    sessionStorage.setItem(REDIRECT_KEY, 'true');
    window.location.replace('login.html');
    return false;
  }
  
  try {
    const user = JSON.parse(stored);
    if (!user || !user.id) {
      // Invalid user data, redirect to login
      sessionStorage.setItem(REDIRECT_KEY, 'true');
      window.location.replace('login.html');
      return false;
    }
    // User is logged in, check if they have a club
    const storedGroup = localStorage.getItem('movieClubGroup');
    if (storedGroup) {
      try {
        const group = JSON.parse(storedGroup);
        if (group && group.id) {
          // User has a club, redirect to dashboard
          sessionStorage.setItem(REDIRECT_KEY, 'true');
          window.location.replace('dashboard.html');
          return true;
        }
      } catch (e) {
        // Invalid group data, continue with welcome page
      }
    }
    // User is logged in but no club, continue with welcome page
    return false;
  } catch (e) {
    // Invalid stored data, redirect to login
    sessionStorage.setItem(REDIRECT_KEY, 'true');
    window.location.replace('login.html');
    return false;
  }
}

// Load current user from localStorage
function loadCurrentUser() {
  const stored = getStoredUser();
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Error parsing user data:', e);
    }
  }
  return null;
}

// Load user's club from localStorage
function loadCurrentGroup() {
  const stored = localStorage.getItem('movieClubGroup');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Error parsing group data:', e);
    }
  }
  return null;
}

// Load and display user's clubs
async function loadMyClubs() {
  const loadingEl = document.getElementById('my-clubs-loading');
  const listEl = document.getElementById('my-clubs-list');
  const emptyEl = document.getElementById('my-clubs-empty');
  
  if (!loadingEl || !listEl || !emptyEl) return;
  
  loadingEl.style.display = 'block';
  listEl.style.display = 'none';
  emptyEl.style.display = 'none';
  
  const currentGroup = loadCurrentGroup();
  
  if (currentGroup && currentGroup.id) {
    // User has a club, display it
    loadingEl.style.display = 'none';
    listEl.style.display = 'block';
    listEl.innerHTML = `
      <div class="club-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 2rem; margin-bottom: 1rem;">
        <h3 style="margin: 0 0 1rem 0; color: var(--text-primary);">${currentGroup.name || 'My Club'}</h3>
        <p style="margin: 0.5rem 0; color: var(--text-secondary);">
          <strong>Club Code:</strong> <span style="color: var(--gold); font-family: 'Space Mono', monospace; font-weight: 700;">${currentGroup.code || 'N/A'}</span>
        </p>
        <p style="margin: 0.5rem 0; color: var(--text-secondary);">
          <strong>Members:</strong> ${currentGroup.members ? currentGroup.members.length : 0}
        </p>
        <button class="btn btn-primary" style="margin-top: 1rem; width: 100%;" onclick="window.location.replace('dashboard.html')">
          Go to Dashboard
        </button>
      </div>
    `;
  } else {
    // User doesn't have a club
    loadingEl.style.display = 'none';
    emptyEl.style.display = 'block';
  }
}

// Initialize welcome page
function initialize() {
  // Don't initialize if we're redirecting
  if (sessionStorage.getItem(REDIRECT_KEY)) {
    return;
  }

  setupMenuDropdown();
  setupProfileModal();

  // Load user's clubs
  loadMyClubs();

  // Get elements after DOM is ready
  const setupTabs = document.querySelectorAll('.setup-tab-btn');
  const setupTabContents = document.querySelectorAll('.setup-tab-content');
  const createGroupForm = document.getElementById('create-group-form');
  const joinGroupForm = document.getElementById('join-group-form');
  const createSuccess = document.getElementById('create-success');
  const createForm = document.querySelector('#create-tab .group-form');
  const categoryCountInput = document.getElementById('setup-category-count');
  const categoryInputsContainer = document.getElementById('setup-category-inputs');
  const categoryDecreaseBtn = document.getElementById('category-count-decrease');
  const categoryIncreaseBtn = document.getElementById('category-count-increase');

  // Tab switching - attach directly to each button for reliability
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
    
    // Attach click handlers directly to each tab button
    setupTabs.forEach((btn) => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const targetTab = this.dataset.tab;
        if (!targetTab) return;
        
        // Remove active from all tabs
        setupTabs.forEach(b => b.classList.remove('active'));
        
        // Remove active from all tab contents  
        setupTabContents.forEach(t => t.classList.remove('active'));
        
        // Add active to clicked tab button
        this.classList.add('active');
        
        // Show target tab content
        const targetTabEl = document.getElementById(targetTab + '-tab');
        if (targetTabEl) {
          targetTabEl.classList.add('active');
          // Reload clubs if switching to my clubs tab
          if (targetTab === 'myclubs') {
            loadMyClubs();
          }
        }
      });
    });
  }

  const defaultCategoryNames = [
    'Top Pick',
    'Wild Card',
    'Classic',
    'Indie',
    'International',
    'Documentary'
  ];

  function clampCategoryCount(count) {
    const min = 1;
    const max = 10;
    const numericCount = Number(count);
    if (Number.isNaN(numericCount)) return min;
    return Math.max(min, Math.min(max, numericCount));
  }

  function renderCategoryInputs(count, existingValues = []) {
    if (!categoryInputsContainer) return;
    const safeCount = clampCategoryCount(count);
    categoryInputsContainer.innerHTML = '';
    for (let i = 0; i < safeCount; i += 1) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-input setup-category-input';
      input.placeholder = `Category ${i + 1}`;
      input.value = existingValues[i] || defaultCategoryNames[i] || '';
      input.required = true;
      input.style.marginBottom = '0.75rem';
      categoryInputsContainer.appendChild(input);
    }
  }

  function getCurrentCategoryValues() {
    return Array.from(document.querySelectorAll('.setup-category-input')).map((input) => input.value);
  }

  function syncCategoryInputs(nextCount) {
    if (categoryCountInput) {
      categoryCountInput.value = String(clampCategoryCount(nextCount));
    }
    renderCategoryInputs(nextCount, getCurrentCategoryValues());
  }

  if (categoryCountInput) {
    renderCategoryInputs(categoryCountInput.value);
    categoryCountInput.addEventListener('input', () => {
      syncCategoryInputs(categoryCountInput.value);
    });
  }

  if (categoryDecreaseBtn) {
    categoryDecreaseBtn.addEventListener('click', () => {
      const current = categoryCountInput ? categoryCountInput.value : 1;
      syncCategoryInputs(Number(current) - 1);
    });
  }

  if (categoryIncreaseBtn) {
    categoryIncreaseBtn.addEventListener('click', () => {
      const current = categoryCountInput ? categoryCountInput.value : 1;
      syncCategoryInputs(Number(current) + 1);
    });
  }

  // Create club form handler
  if (createGroupForm) {
createGroupForm.addEventListener('submit', async (e) => {
	e.preventDefault();
	const currentUser = loadCurrentUser();
	if (!currentUser || !currentUser.id) {
		alert('You must be logged in to create a club. Please sign in first.');
		window.location.href = 'login.html';
		return;
	}
	
	const clubName = document.getElementById('setup-club-name').value.trim();
	const seasonLength = parseInt(document.getElementById('setup-season-length').value, 10);
	const submissionsPerUser = parseInt(document.getElementById('setup-submissions-per-user').value, 10);
	const rawCategoryNames = Array.from(document.querySelectorAll('.setup-category-input'))
		.map(el => el.value.trim())
		.filter(Boolean);
	const categories = rawCategoryNames.map((name) => slugifyCategory(name));
	
	if (!clubName) {
		alert('Please enter a club name');
		return;
	}
	
	if (!seasonLength || seasonLength < 4 || seasonLength > 52) {
		alert('Season length must be between 4 and 52 weeks');
		return;
	}
	
	if (!submissionsPerUser || submissionsPerUser < 1 || submissionsPerUser > 20) {
		alert('Submissions per user must be between 1 and 20');
		return;
	}
	
	if (!rawCategoryNames || rawCategoryNames.length === 0) {
		alert('Please add at least one category name');
		return;
	}

	if (categories.some((cat) => !cat)) {
		alert('Please use letters or numbers in category names');
		return;
	}

	const uniqueCategories = Array.from(new Set(categories));
	if (uniqueCategories.length !== categories.length) {
		alert('Category names must be unique');
		return;
	}

	try {
		const userId = currentUser.id;

		// Create group with settings
		const groupRes = await fetch((SERVER_URL || '') + '/create-group', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ 
				name: clubName, 
				creatorId: userId,
				seasonLength: seasonLength,
				submissionsPerUser: submissionsPerUser,
				categories: uniqueCategories
			})
		});
		
		if (!groupRes.ok) {
			const errorText = await groupRes.text();
			alert('Group creation failed: Server returned ' + groupRes.status + '. ' + errorText);
			return;
		}
		
		const groupData = await groupRes.json();
		if (!groupData.ok) {
			alert('Group creation failed: ' + (groupData.error || 'Unknown error'));
			return;
		}

		const currentGroup = groupData.group;
		currentUser.groupId = currentGroup.id;

		// Save to localStorage
		setStoredUser(currentUser);
		localStorage.setItem('movieClubGroup', JSON.stringify(currentGroup));
		
		// Reload my clubs to show the new club
		loadMyClubs();

		// Show success message
		const clubCodeDisplay = document.getElementById('club-code-display');
		if (clubCodeDisplay) clubCodeDisplay.textContent = currentGroup.code;
		if (createForm) createForm.style.display = 'none';
		if (createSuccess) createSuccess.style.display = 'block';
		if (createSuccess && createSuccess.scrollIntoView) {
			createSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}

		// Set up start button handler
		const startBtn = document.getElementById('start-club-btn');
		if (startBtn) {
			const newStartBtn = startBtn.cloneNode(true);
			startBtn.parentNode.replaceChild(newStartBtn, startBtn);
			newStartBtn.addEventListener('click', () => {
				// Clear redirect flag before navigating to dashboard
				try {
					sessionStorage.removeItem(REDIRECT_KEY);
				} catch (e) {
					// Ignore errors
				}
				// Use replace to avoid redirect loop
				window.location.replace('dashboard.html');
			});
			
			// Also allow clicking the code to copy it
			if (clubCodeDisplay) {
				clubCodeDisplay.style.cursor = 'pointer';
				clubCodeDisplay.title = 'Click to copy';
				clubCodeDisplay.addEventListener('click', () => {
					navigator.clipboard.writeText(currentGroup.code).then(() => {
						alert('Club code copied to clipboard!');
					}).catch(() => {
						const textArea = document.createElement('textarea');
						textArea.value = currentGroup.code;
						document.body.appendChild(textArea);
						textArea.select();
						document.execCommand('copy');
						document.body.removeChild(textArea);
						alert('Club code copied to clipboard!');
					});
				});
			}
		}

	} catch (err) {
		console.error('Create club error:', err);
		alert('Network error. Make sure the server is running on port 3000.');
	}
});
  }

  // Join club form handler
  if (joinGroupForm) {
    joinGroupForm.addEventListener('submit', async (e) => {
	e.preventDefault();
	const currentUser = loadCurrentUser();
	if (!currentUser || !currentUser.id) {
		alert('You must be logged in to join a club. Please sign in first.');
		window.location.href = 'login.html';
		return;
	}
	
	const groupCode = document.getElementById('join-club-code').value.trim().toUpperCase();
	
	if (!groupCode) {
		alert('Please enter a club code');
		return;
	}

	try {
		const userId = currentUser.id;

		// Join group
		const joinRes = await fetch((SERVER_URL || '') + '/join-group', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ userId, groupCode })
		});
		const joinData = await joinRes.json();
		if (!joinData.ok) {
			alert('Join failed: ' + joinData.error);
			return;
		}

		const currentGroup = joinData.group;
		currentUser.groupId = currentGroup.id;

		// Save to localStorage
		setStoredUser(currentUser);
		localStorage.setItem('movieClubGroup', JSON.stringify(currentGroup));

		alert(`✓ Joined "${currentGroup.name}" successfully!`);
		
		// Reload my clubs to show the joined club
		loadMyClubs();
		
		// Switch to my clubs tab to show the newly joined club
		const myClubsTab = document.querySelector('.setup-tab-btn[data-tab="myclubs"]');
		const myClubsTabContent = document.getElementById('myclubs-tab');
		if (myClubsTab && myClubsTabContent) {
			document.querySelectorAll('.setup-tab-btn').forEach(b => b.classList.remove('active'));
			document.querySelectorAll('.setup-tab-content').forEach(t => t.classList.remove('active'));
			myClubsTab.classList.add('active');
			myClubsTabContent.classList.add('active');
		}

	} catch (err) {
		console.error('Join error:', err);
		alert('Error joining group: ' + (err.message || 'Network error. Make sure the server is running on port 3000.'));
	}
    });
  }
}

function handleMenuAction(action) {
  if (!action) return;
  if (action === 'profile') {
    const shown = showProfileModal();
    if (!shown) {
      alert('Please sign in to view your profile');
      window.location.href = 'login.html';
    }
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

function setupProfileModal() {
  const profileModal = document.getElementById('profile-modal');
  const closeProfileModal = document.getElementById('close-profile-modal');
  if (!profileModal) return;
  if (closeProfileModal) {
    closeProfileModal.addEventListener('click', () => {
      profileModal.classList.add('hidden');
    });
  }
  profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) profileModal.classList.add('hidden');
  });
}

function showProfileModal() {
  const stored = getStoredUser();
  if (!stored) return false;
  let user;
  try {
    user = JSON.parse(stored);
  } catch (e) {
    return false;
  }
  const profileModal = document.getElementById('profile-modal');
  if (!profileModal || !user) return false;
  const displayName = document.getElementById('display-name');
  const displayGroup = document.getElementById('display-group');
  if (displayName) displayName.textContent = user.username || user.name || '';
  if (displayGroup) {
    if (user.groupId) {
      displayGroup.textContent = `🎬 Group: ${user.groupId}`;
    } else {
      displayGroup.textContent = '(No group yet)';
    }
  }
  profileModal.classList.remove('hidden');
  return true;
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

function slugifyCategory(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

// Wait for DOM to be ready - check auth only once at the top level
(function() {
  // Exit immediately if already redirecting (prevents any code execution)
  if (sessionStorage.getItem(REDIRECT_KEY)) {
    return;
  }

  // Check auth FIRST - before any DOM manipulation
  // This will redirect immediately if user is logged in
  if (checkAuth()) {
    // User is logged in, redirect is in progress
    // Exit immediately - don't set up any event listeners or initialize anything
    return;
  }

  // User is not logged in, proceed with initialization
  // Wait for DOM to be ready before initializing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      // Double check we're not redirecting before initializing
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
