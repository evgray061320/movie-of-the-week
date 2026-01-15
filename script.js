// Configuration: set your OMDb API key here
const OMDB_API_KEY = 'bafff0b8';
// If your backend runs on another origin, set SERVER_URL accordingly (e.g. 'http://localhost:3000')
const SERVER_URL = 'http://localhost:3000';

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

// Current user profile
let currentUser = null;
let currentGroup = null;

const form = document.getElementById('movie-form');
const statusEl = document.getElementById('status');
const posterImg = document.getElementById('poster-img');
const topPickGrid = document.getElementById('top-pick-grid');
const wildCardGrid = document.getElementById('wild-card-grid');
const pickNowBtn = document.getElementById('pick-now');
const resetBtn = document.getElementById('reset-all');
const currentWinnerEl = document.getElementById('current-winner');
const historyEl = document.getElementById('history');
const charCountEl = document.getElementById('char-count');
const descriptionEl = document.getElementById('description');
const submissionCountEl = document.getElementById('submission-count');

// Group setup modal elements
const groupSetupModal = document.getElementById('group-setup-modal');
const mainContent = document.getElementById('main-content');
const setupTabs = document.querySelectorAll('.setup-tab-btn');
const setupTabContents = document.querySelectorAll('.setup-tab-content');
const createGroupForm = document.getElementById('create-group-form');
const joinGroupForm = document.getElementById('join-group-form');
const createSuccess = document.getElementById('create-success');
const createForm = document.querySelector('#create-tab .group-form');

// Profile modal elements
const profileModal = document.getElementById('profile-modal');
const closeProfileModal = document.getElementById('close-profile-modal');
const profileForm = document.getElementById('profile-form');
const profileFormContainer = document.getElementById('profile-form-container');
const profileDisplay = document.getElementById('profile-display');
const createGroupBtn = document.getElementById('create-group-btn');
const joinGroupBtn = document.getElementById('join-group-btn');
const groupFormSection = document.getElementById('group-form-section');
const joinGroupSection = document.getElementById('join-group-section');

// Load user from localStorage
function loadUserFromStorage() {
  const stored = getStoredUser();
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
      const storedGroup = localStorage.getItem('movieClubGroup');
      if (storedGroup) {
        currentGroup = JSON.parse(storedGroup);
      }
      hideGroupSetup();
      displayProfile();
      return true;
    } catch (e) {
      console.error('Error loading user from storage', e);
    }
  }
  return false;
}

// Group setup modal handlers
setupTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    setupTabs.forEach(t => t.classList.remove('active'));
    setupTabContents.forEach(content => content.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tabName + '-tab').classList.add('active');
  });
});

async function fetchPoster(title) {
	if (!title || !title.trim()) return null;
	
	// Try server-side proxy first (preferred, doesn't expose API key)
	if (SERVER_URL) {
		try {
			const proxyUrl = SERVER_URL + '/omdb?title=' + encodeURIComponent(title.trim());
			const res = await fetch(proxyUrl);
			if (res.ok) {
				const data = await res.json();
				if (data && data.Poster && data.Poster !== 'N/A') {
					return data.Poster;
				}
			} else {
				// Server returned error, fall through to client-side
				console.warn('Server OMDb proxy returned', res.status, '- using client-side API key');
			}
		} catch (err) {
			console.warn('OMDb proxy failed, trying client-side:', err);
		}
	}

	// Fall back to client-side key if available
	if (OMDB_API_KEY && OMDB_API_KEY !== 'REPLACE_WITH_OMDB_KEY') {
		const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title.trim())}&apikey=${OMDB_API_KEY}`;
		try {
			const res = await fetch(url);
			if (res.ok) {
			const data = await res.json();
				if (data && data.Poster && data.Poster !== 'N/A') {
					return data.Poster;
				}
			} else {
				console.warn('OMDb API returned status', res.status);
			}
		} catch (err) {
			console.warn('OMDb fetch failed', err);
		}
	}
	
	return null;
}

async function postSubmission(payload) {
	const url = (SERVER_URL || '') + '/submit';
	try {
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});
		if (!res.ok) {
			const errorText = await res.text();
			return { ok: false, error: `Server returned ${res.status}: ${errorText}` };
		}
		return await res.json();
	} catch (err) {
		return { ok: false, error: err.message || 'Network error. Make sure the server is running.' };
	}
}

async function refreshList() {
	const url = (SERVER_URL || '') + '/submissions';
	try {
		const res = await fetch(url);
		const list = await res.json();
		// Fetch posters for items that don't have them
		// The server should enrich them, but we'll also try client-side as fallback
		const posterPromises = list.map(async (item) => {
			if (!item.posterUrl && item.title) {
				try {
					const posterUrl = await fetchPoster(item.title);
					if (posterUrl) {
						item.posterUrl = posterUrl;
					}
				} catch (err) {
					console.warn('Failed to fetch poster for', item.title, err);
				}
			}
		});
		// Wait for all poster fetches to complete (with timeout)
		await Promise.race([
			Promise.all(posterPromises),
			new Promise(resolve => setTimeout(resolve, 3000)) // Max 3 seconds
		]);
		renderList(list);
	} catch (err) {
		if (topPickGrid) topPickGrid.innerHTML = '<p class="error">Could not load submissions.</p>';
		if (wildCardGrid) wildCardGrid.innerHTML = '';
	}
}

// Get revealed movies from history (winners)
async function getRevealedMovies() {
	try {
		const res = await fetch(`${SERVER_URL}/history`);
		if (res.ok) {
			const history = await res.json();
			const groupId = currentGroup?.id || null;
			const seasonNumber = currentSeason?.seasonNumber || null;
			const filteredHistory = history.filter((entry) => {
				const winner = entry.winner || {};
				const matchesGroup = groupId ? winner.groupId === groupId : !winner.groupId;
				const matchesSeason = seasonNumber ? winner.seasonNumber === seasonNumber : true;
				return matchesGroup && matchesSeason;
			});
			// Extract movie titles from history (winners are revealed)
			const revealedTitles = filteredHistory.map(h => h.winner?.title).filter(Boolean);
			return revealedTitles;
		}
	} catch (err) {
		console.warn('Failed to load history', err);
	}
	return [];
}

// Reveal a movie (when it's selected as winner)
function revealMovie(movieTitle) {
	// Movies are revealed automatically when they're in history
	// Just refresh the list to show the updated state
	refreshList();
}

function createMovieCard(item, cardNumber, isRevealed) {
	const fallbackPoster = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="150"%3E%3Crect fill="%23ccc" width="100" height="150"/%3E%3Ctext x="50" y="75" font-family="Arial" font-size="12" fill="%23666" text-anchor="middle"%3ENo Poster%3C/text%3E%3C/svg%3E';
	const posterSrc = isRevealed ? (item.posterUrl || fallbackPoster) : fallbackPoster;
	
	const movieCard = document.createElement('div');
	movieCard.className = `movie-card ${isRevealed ? 'revealed flipped' : ''} disabled`;
	movieCard.dataset.movieId = item.id;
	movieCard.dataset.movieTitle = item.title;
	movieCard.dataset.category = item.category || 'top-pick';
	
	movieCard.innerHTML = `
		<div class="movie-card-inner">
			<div class="movie-card-front">
				${cardNumber}
			</div>
			<div class="movie-card-back">
				<img src="${posterSrc}" alt="${escapeHtml(item.title)}" ${item.posterUrl ? '' : 'style="opacity: 0.5;"'}>
				<h3 class="movie-title">${escapeHtml(item.title)}</h3>
			</div>
		</div>
	`;
	
	return movieCard;
}

async function renderList(list) {
	if (!Array.isArray(list) || list.length === 0) {
		if (topPickGrid) topPickGrid.innerHTML = '<p>No submissions yet.</p>';
		if (wildCardGrid) wildCardGrid.innerHTML = '<p>No submissions yet.</p>';
		submissionCountEl.textContent = '0 movies submitted';
		pickNowBtn.disabled = true;
		return;
	}
	
	// Clear grids
	if (topPickGrid) topPickGrid.innerHTML = '';
	if (wildCardGrid) wildCardGrid.innerHTML = '';
	
	// Get revealed movies from history (winners are automatically revealed)
	const revealedTitles = await getRevealedMovies();
	
	// Separate by category
	const topPicks = list.filter(item => item.category === 'top-pick').sort((a, b) => a.id.localeCompare(b.id));
	const wildCards = list.filter(item => item.category === 'wild-card').sort((a, b) => a.id.localeCompare(b.id));
	
	// Update submission count
	const total = list.length;
	submissionCountEl.textContent = `${total} movie${total !== 1 ? 's' : ''} submitted (${topPicks.length} Top Picks, ${wildCards.length} Wild Cards)`;
	pickNowBtn.disabled = false;
	
	// Render Top Picks
	topPicks.forEach((item, idx) => {
		const cardNumber = idx + 1;
		const isRevealed = revealedTitles.includes(item.title);
		const card = createMovieCard(item, cardNumber, isRevealed);
		if (topPickGrid) topPickGrid.appendChild(card);
	});
	
	// Render Wild Cards
	wildCards.forEach((item, idx) => {
		const cardNumber = idx + 1;
		const isRevealed = revealedTitles.includes(item.title);
		const card = createMovieCard(item, cardNumber, isRevealed);
		if (wildCardGrid) wildCardGrid.appendChild(card);
	});
	
	// Show empty state if no movies in category
	if (topPicks.length === 0 && topPickGrid) {
		topPickGrid.innerHTML = '<p class="empty-category">No Top Picks submitted yet.</p>';
	}
	if (wildCards.length === 0 && wildCardGrid) {
		wildCardGrid.innerHTML = '<p class="empty-category">No Wild Cards submitted yet.</p>';
	}
}

function escapeHtml(s) {
	if (!s) return '';
	return s.replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":"&#39;"}[c]));
}

if (form) {
form.addEventListener('submit', async (e) => {
	e.preventDefault();
	statusEl.textContent = '';
	statusEl.className = 'status';
	const title = document.getElementById('title').value.trim();
	const category = document.getElementById('movie-category').value;
	const description = document.getElementById('description').value.trim();
	if (!title || title.length < 2) { statusEl.textContent = '❌ Please enter a valid title.'; statusEl.classList.add('error'); return; }
	if (!category) { statusEl.textContent = '❌ Please select a category.'; statusEl.classList.add('error'); return; }
	if (!description || description.length < 10) { statusEl.textContent = '❌ Description must be 10+ characters.'; statusEl.classList.add('error'); return; }
	statusEl.textContent = '⏳ Submitting...';
	statusEl.classList.add('error');
	const submitBtn = form.querySelector('button[type="submit"]');
	submitBtn.disabled = true;
	let posterUrl = await fetchPoster(title);
	if (posterUrl) {
		posterImg.src = posterUrl;
		posterImg.hidden = false;
	} else {
		posterImg.hidden = true;
	}

	try {
		const submissionPayload = {
			title,
			category,
			description,
			posterUrl,
			userId: currentUser?.id || null,
			groupId: currentGroup?.id || null
		};
		const result = await postSubmission(submissionPayload);
		if (result && result.ok) {
			statusEl.textContent = '✓ Submitted successfully!';
			statusEl.className = 'status success';
			form.reset();
			if (charCountEl) charCountEl.textContent = '0';
			posterImg.hidden = true;
			await refreshList();
		} else {
			const errorMsg = result?.error || 'Unknown error';
			statusEl.textContent = `❌ Submission failed: ${errorMsg}`;
			statusEl.className = 'status error';
			console.error('Submission error:', result);
		}
	} catch (err) {
		statusEl.textContent = `❌ Submission error: ${err.message || 'Network error. Make sure the server is running on port 3000.'}`;
		statusEl.className = 'status error';
		console.error('Submission exception:', err);
	} finally {
		submitBtn.disabled = false;
	}
});
}

// Show poster preview when title changes
const titleInput = document.getElementById('title');
let previewTimer;
if (titleInput) {
titleInput.addEventListener('input', () => {
	posterImg.hidden = true;
	clearTimeout(previewTimer);
	const value = titleInput.value.trim();
	if (!value) return;
	previewTimer = setTimeout(async () => {
		const p = await fetchPoster(value);
		if (p) {
			posterImg.src = p;
			posterImg.hidden = false;
		}
	}, 700);
});
}

// Character counter for description
if (descriptionEl) {
	descriptionEl.addEventListener('input', () => {
		if (charCountEl) charCountEl.textContent = descriptionEl.value.length;
	});
}

function handleMenuAction(action) {
	if (!action) return;
	if (action === 'profile') {
		if (profileModal) profileModal.classList.remove('hidden');
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

if (closeProfileModal) {
closeProfileModal.addEventListener('click', () => {
		if (profileModal) profileModal.classList.add('hidden');
});
}

if (profileModal) {
profileModal.addEventListener('click', (e) => {
	if (e.target === profileModal) profileModal.classList.add('hidden');
});
}

if (createGroupBtn) {
createGroupBtn.addEventListener('click', (e) => {
	e.preventDefault();
	createGroupBtn.classList.toggle('active');
		if (joinGroupBtn) joinGroupBtn.classList.remove('active');
		if (groupFormSection) groupFormSection.style.display = createGroupBtn.classList.contains('active') ? 'block' : 'none';
		if (joinGroupSection) joinGroupSection.style.display = 'none';
	});
}

if (joinGroupBtn) {
joinGroupBtn.addEventListener('click', (e) => {
	e.preventDefault();
	joinGroupBtn.classList.toggle('active');
		if (createGroupBtn) createGroupBtn.classList.remove('active');
		if (joinGroupSection) joinGroupSection.style.display = joinGroupBtn.classList.contains('active') ? 'block' : 'none';
		if (groupFormSection) groupFormSection.style.display = 'none';
	});
}

function displayProfile() {
	profileFormContainer.style.display = 'none';
	profileDisplay.style.display = 'block';
	document.getElementById('display-name').textContent = currentUser.name;
	if (currentUser.groupId) {
		document.getElementById('display-group').textContent = `🎬 Group: ${currentUser.groupId}`;
	} else {
		document.getElementById('display-group').textContent = '(No group yet)';
	}
}

function hideProfile() {
	profileFormContainer.style.display = 'block';
	profileDisplay.style.display = 'none';
}

function hideGroupSetup() {
	if (groupSetupModal) {
		groupSetupModal.classList.add('hidden');
	}
	if (mainContent) {
	mainContent.classList.remove('main-hidden');
	}
}

function showGroupSetup() {
	if (groupSetupModal) groupSetupModal.classList.remove('hidden');
	if (mainContent) mainContent.classList.add('main-hidden');
}

const editProfileBtn = document.getElementById('edit-profile-btn');
if (editProfileBtn) {
	editProfileBtn.addEventListener('click', () => {
	hideProfile();
});
}

// Group setup form handlers
if (createGroupForm) {
createGroupForm.addEventListener('submit', async (e) => {
	e.preventDefault();
	const name = document.getElementById('setup-name').value.trim();
	const email = document.getElementById('setup-email').value.trim();
	const clubName = document.getElementById('setup-club-name').value.trim();
	const genres = Array.from(document.querySelectorAll('input[name="setup-genre"]:checked')).map(el => el.value);
	
	if (!name || !email || !clubName) {
		alert('Please fill in all required fields');
		return;
	}

	try {
		// Sign up user
		const signupRes = await fetch((SERVER_URL || '') + '/signup', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, email, genres })
		});
		
		if (!signupRes.ok) {
			const errorText = await signupRes.text();
			alert('Signup failed: Server returned ' + signupRes.status + '. ' + errorText);
			return;
		}
		
		const signupData = await signupRes.json();
		if (!signupData.ok) {
			alert('Signup failed: ' + (signupData.error || 'Unknown error'));
			return;
		}

		const userId = signupData.user.id;
		currentUser = signupData.user;

		// Create group
		const groupRes = await fetch((SERVER_URL || '') + '/create-group', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: clubName, creatorId: userId })
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

		currentGroup = groupData.group;
		currentUser.groupId = currentGroup.id;

		// Save to localStorage
		setStoredUser(currentUser);
		localStorage.setItem('movieClubGroup', JSON.stringify(currentGroup));

		// Show success message
		const clubCodeDisplay = document.getElementById('club-code-display');
		if (clubCodeDisplay) clubCodeDisplay.textContent = currentGroup.code;
		if (createForm) createForm.style.display = 'none';
		if (createSuccess) createSuccess.style.display = 'block';

		// Set up start button handler
		const startBtn = document.getElementById('start-club-btn');
		const closeModal = () => {
			hideGroupSetup();
		};
		
		if (startBtn) {
			// Remove any existing listeners by cloning
			const newStartBtn = startBtn.cloneNode(true);
			startBtn.parentNode.replaceChild(newStartBtn, startBtn);
			
			// Add click handler
			newStartBtn.addEventListener('click', closeModal);
			
			// Also allow clicking the code to copy it
			if (clubCodeDisplay) {
				clubCodeDisplay.style.cursor = 'pointer';
				clubCodeDisplay.title = 'Click to copy';
				clubCodeDisplay.addEventListener('click', () => {
					navigator.clipboard.writeText(currentGroup.code).then(() => {
						alert('Club code copied to clipboard!');
					}).catch(() => {
						// Fallback for older browsers
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
		
		// Auto-close after 8 seconds to show the code
		setTimeout(() => {
			if (groupSetupModal && !groupSetupModal.classList.contains('hidden')) {
				hideGroupSetup();
			}
		}, 8000);

	} catch (err) {
		console.error('Signup error:', err);
		alert('Error creating club: ' + (err.message || 'Network error. Make sure the server is running on port 3000.'));
	}
});
}

if (joinGroupForm) {
joinGroupForm.addEventListener('submit', async (e) => {
	e.preventDefault();
	const name = document.getElementById('join-name').value.trim();
	const email = document.getElementById('join-email').value.trim();
	const groupCode = document.getElementById('join-club-code').value.trim().toUpperCase();
	const genres = Array.from(document.querySelectorAll('input[name="join-genre"]:checked')).map(el => el.value);
	
	if (!name || !email || !groupCode) {
		alert('Please fill in all required fields');
		return;
	}

	try {
		// Sign up user
		const signupRes = await fetch((SERVER_URL || '') + '/signup', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, email, genres })
		});
		const signupData = await signupRes.json();
		if (!signupData.ok) {
			alert('Signup failed: ' + signupData.error);
			return;
		}

		const userId = signupData.user.id;
		currentUser = signupData.user;

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

		currentGroup = joinData.group;
		currentUser.groupId = currentGroup.id;

		// Save to localStorage
		setStoredUser(currentUser);
		localStorage.setItem('movieClubGroup', JSON.stringify(currentGroup));

		alert(`✓ Joined "${currentGroup.name}" successfully!`);
		hideGroupSetup();

	} catch (err) {
		console.error('Join error:', err);
		alert('Error joining group');
	}
});
}

if (pickNowBtn) {
pickNowBtn.addEventListener('click', async () => {
	// Get current submissions to show category options
	let categories = [];
	try {
		const res = await fetch(`${SERVER_URL}/submissions`);
		if (res.ok) {
			const submissions = await res.json();
			const topPicks = submissions.filter(s => s.category === 'top-pick');
			const wildCards = submissions.filter(s => s.category === 'wild-card');
			if (topPicks.length > 0) categories.push('top-pick');
			if (wildCards.length > 0) categories.push('wild-card');
		}
	} catch (err) {
		console.warn('Failed to load submissions for category selection', err);
	}
	
	// If both categories have movies, let user choose
	let selectedCategory = null;
	if (categories.length > 1) {
		const choice = confirm('Pick from which category?\n\nOK = Top Pick\nCancel = Wild Card');
		selectedCategory = choice ? 'top-pick' : 'wild-card';
	} else if (categories.length === 1) {
		selectedCategory = categories[0];
	}
	
	if (!confirm(`Pick this week's winner${selectedCategory ? ' from ' + (selectedCategory === 'top-pick' ? 'Top Pick' : 'Wild Card') : ''}? This will record the choice and clear submissions.`)) return;
	
	pickNowBtn.disabled = true;
	pickNowBtn.textContent = 'Picking...';
	try {
		const res = await fetch((SERVER_URL || '') + '/pick-weekly', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ category: selectedCategory })
		});
		const data = await res.json();
		if (data && data.ok) {
			statusEl.textContent = `🏆 Picked: ${data.winner.title}`;
			statusEl.className = 'status success';
			renderCurrentWinner(data.winner, data.historyEntry);
			// Refresh history first, then refresh list to show revealed winner
			await refreshHistory();
			await refreshList();
		} else {
			statusEl.textContent = data.message || 'Pick failed';
			statusEl.className = 'status error';
		}
	} catch (err) {
		statusEl.textContent = 'Pick request failed';
		statusEl.className = 'status error';
	}
	pickNowBtn.disabled = false;
	pickNowBtn.textContent = "🏆 Pick Winner";
});
}

if (resetBtn) {
resetBtn.addEventListener('click', async () => {
	if (!confirm('Reset all submissions? This cannot be undone.')) return;
	try {
		const res = await fetch((SERVER_URL || '') + '/reset', { method: 'POST' });
		const data = await res.json();
		statusEl.textContent = '↻ ' + (data.message || 'Reset');
		statusEl.className = 'status success';
		await refreshList();
		await refreshHistory();
	} catch (err) {
		statusEl.textContent = 'Reset failed';
		statusEl.className = 'status error';
	}
});
}

// history/dashboard
async function refreshHistory() {
  try {
    const res = await fetch((SERVER_URL || '') + '/history');
    const list = await res.json();
    renderHistory(list);
  } catch (err) {
    historyEl.innerHTML = '<p class="error">Could not load history.</p>';
  }
}

function renderCurrentWinner(winner, historyEntry) {
  if (!winner) { 
    currentWinnerEl.innerHTML = '<div class="winner-placeholder">No winner selected yet</div>';
    // Refresh discussion board to show appropriate message
    refreshDiscussionBoard();
    return;
  }
  currentWinnerEl.innerHTML = `
    <div style="position: relative; z-index: 1;">
      <strong>${escapeHtml(winner.title)}</strong>
      <p>${escapeHtml(winner.description)}</p>
    </div>
  `;
  // Refresh discussion board when winner is set
  refreshDiscussionBoard();
}

function renderHistory(list) {
  if (!Array.isArray(list) || list.length === 0) { historyEl.innerHTML = '<p>No past winners.</p>'; return; }
  historyEl.innerHTML = '';
  list.forEach(h => {
    const el = document.createElement('div');
    el.className = 'history-item';
    el.innerHTML = `
      <div class="history-meta">${new Date(h.pickedAt).toLocaleString()} - ${h.submissionsCount} submissions</div>
      <div class="history-title">${escapeHtml(h.winner.title)}</div>
    `;
    historyEl.appendChild(el);
  });
}

// ===== WATCHED & REVIEWS =====
async function markAsWatched(movieTitle, groupId) {
	if (!currentUser) return;
	try {
		const res = await fetch(`${SERVER_URL}/mark-watched`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ userId: currentUser.id, movieTitle, groupId })
		});
		const data = await res.json();
		return data.ok;
	} catch (err) {
		console.error('Failed to mark as watched', err);
		return false;
	}
}

async function submitReview(movieTitle, rating, review, groupId) {
	if (!currentUser) return false;
	try {
		const res = await fetch(`${SERVER_URL}/review`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ userId: currentUser.id, movieTitle, rating, review, groupId })
		});
		const data = await res.json();
		return data.ok;
	} catch (err) {
		console.error('Failed to submit review', err);
		return false;
	}
}

async function loadReviews(movieTitle, groupId) {
	try {
		const url = `${SERVER_URL}/reviews?movieTitle=${encodeURIComponent(movieTitle)}${groupId ? '&groupId=' + groupId : ''}`;
		const res = await fetch(url);
		if (res.ok) {
			return await res.json();
		}
	} catch (err) {
		console.error('Failed to load reviews', err);
	}
	return [];
}

async function loadWeeklyReviews(groupId) {
	try {
		const url = `${SERVER_URL}/reviews/weekly${groupId ? '?groupId=' + groupId : ''}`;
		const res = await fetch(url);
		if (res.ok) {
			return await res.json();
		}
	} catch (err) {
		console.error('Failed to load weekly reviews', err);
	}
	return [];
}

function renderReviews(reviews) {
	const reviewsList = document.getElementById('reviews-list');
	if (!reviewsList) return;
	
	if (!Array.isArray(reviews) || reviews.length === 0) {
		reviewsList.innerHTML = '<p class="no-reviews">No reviews yet. Be the first to share your thoughts!</p>';
		return;
	}
	
	reviewsList.innerHTML = '';
	reviews.forEach(review => {
		const reviewEl = document.createElement('div');
		reviewEl.className = 'review-item';
		const stars = '★'.repeat(review.rating || 0) + '☆'.repeat(5 - (review.rating || 0));
		reviewEl.innerHTML = `
			<div class="review-header">
				<div class="review-author">${escapeHtml(review.userName || 'Unknown')}</div>
				<div class="review-meta">
					${review.rating ? `<span class="review-rating">${stars}</span>` : ''}
					<span class="review-date">${new Date(review.createdAt).toLocaleString()}</span>
				</div>
			</div>
			<div class="review-text">${escapeHtml(review.review)}</div>
		`;
		reviewsList.appendChild(reviewEl);
	});
}

async function refreshDiscussionBoard() {
	const discussionBoard = document.getElementById('discussion-board');
	if (!discussionBoard) return;
	
	// Always show the discussion board
	discussionBoard.style.display = 'block';
	
	// Check if there's a current winner
	const winnerEl = document.getElementById('current-winner');
	let winnerTitle = null;
	
	if (winnerEl && winnerEl.querySelector('strong')) {
		const winnerText = winnerEl.querySelector('strong');
		if (winnerText) {
			winnerTitle = winnerText.textContent.trim();
		}
	}
	
	// If no winner in DOM, try to get from history
	if (!winnerTitle) {
		try {
			const historyRes = await fetch(`${SERVER_URL}/history`);
			if (historyRes.ok) {
				const history = await historyRes.json();
				if (history.length > 0 && history[0].winner) {
					winnerTitle = history[0].winner.title;
				}
			}
		} catch (err) {
			console.error('Failed to get winner', err);
		}
	}
	
	// Update the "Add Review" button state
	const addReviewBtn = document.getElementById('add-review-btn');
	if (addReviewBtn) {
		if (winnerTitle) {
			addReviewBtn.disabled = false;
			addReviewBtn.textContent = '➕ Add Your Review';
			addReviewBtn.style.opacity = '1';
		} else {
			addReviewBtn.disabled = true;
			addReviewBtn.textContent = '➕ Add Your Review (No winner selected yet)';
			addReviewBtn.style.opacity = '0.6';
		}
	}
	
	// Load and render reviews if there's a winner
	if (winnerTitle) {
		const reviews = await loadWeeklyReviews(currentGroup?.id || null);
		renderReviews(reviews);
	} else {
		// Show a message when no winner is selected
		const reviewsList = document.getElementById('reviews-list');
		if (reviewsList) {
			reviewsList.innerHTML = '<p class="no-reviews">🎬 No winner selected yet. Once a winner is chosen, reviews will appear here!</p>';
		}
	}
}

// Review modal handlers
const reviewModal = document.getElementById('review-modal');
const reviewForm = document.getElementById('review-form');
const addReviewBtn = document.getElementById('add-review-btn');
const closeReviewModal = document.getElementById('close-review-modal');
const reviewRating = document.getElementById('review-rating');
const ratingValue = document.getElementById('rating-value');
const ratingStars = document.getElementById('rating-stars');
const reviewText = document.getElementById('review-text');
const reviewCharCount = document.getElementById('review-char-count');

if (addReviewBtn) {
	addReviewBtn.addEventListener('click', () => {
		if (!currentUser) {
			alert('Please create a profile first');
			return;
		}
		const winnerEl = document.getElementById('current-winner');
		const winnerTitle = winnerEl?.querySelector('strong')?.textContent.trim();
		if (!winnerTitle) {
			alert('No winner selected yet');
			return;
		}
		document.getElementById('review-movie-title').value = winnerTitle;
		if (reviewModal) reviewModal.classList.remove('hidden');
	});
}

if (closeReviewModal) {
	closeReviewModal.addEventListener('click', () => {
		if (reviewModal) reviewModal.classList.add('hidden');
	});
}

if (reviewModal) {
	reviewModal.addEventListener('click', (e) => {
		if (e.target === reviewModal) reviewModal.classList.add('hidden');
	});
}

if (reviewRating && ratingValue && ratingStars) {
	reviewRating.addEventListener('input', (e) => {
		const value = parseInt(e.target.value);
		ratingValue.textContent = value;
		ratingStars.textContent = '★'.repeat(value) + '☆'.repeat(5 - value);
	});
}

if (reviewText && reviewCharCount) {
	reviewText.addEventListener('input', () => {
		reviewCharCount.textContent = reviewText.value.length;
		if (reviewText.value.length > 1000) {
			reviewText.value = reviewText.value.substring(0, 1000);
			reviewCharCount.textContent = '1000';
		}
	});
}

if (reviewForm) {
	reviewForm.addEventListener('submit', async (e) => {
		e.preventDefault();
		const movieTitle = document.getElementById('review-movie-title').value.trim();
		const rating = parseInt(reviewRating.value);
		const review = reviewText.value.trim();
		
		if (!review || review.length < 10) {
			alert('Please write a review (at least 10 characters)');
			return;
		}
		
		const submitBtn = reviewForm.querySelector('button[type="submit"]');
		submitBtn.disabled = true;
		submitBtn.textContent = 'Submitting...';
		
		const success = await submitReview(movieTitle, rating, review, currentGroup?.id || null);
		
		if (success) {
			alert('✓ Review submitted successfully!');
			reviewForm.reset();
			if (reviewCharCount) reviewCharCount.textContent = '0';
			if (ratingValue) ratingValue.textContent = '5';
			if (ratingStars) ratingStars.textContent = '★★★★★';
			if (reviewRating) reviewRating.value = '5';
			if (reviewModal) reviewModal.classList.add('hidden');
			await refreshDiscussionBoard();
		} else {
			alert('Failed to submit review. Please try again.');
		}
		
		submitBtn.disabled = false;
		submitBtn.textContent = '✓ Submit Review';
	});
}

// Submission modal elements
const submissionModal = document.getElementById('submission-modal');
const openSubmissionModal = document.getElementById('open-submission-modal');
const closeSubmissionModal = document.getElementById('close-submission-modal');
const closeSubmissionModalBtn = document.getElementById('close-submission-modal-btn');
const movieFormModal = document.getElementById('movie-form-modal');
const statusModal = document.getElementById('status-modal');
const seasonInfo = document.getElementById('season-week-info');

// Season tracking
let currentSeason = null;

async function loadSeasonInfo() {
	try {
		const res = await fetch(`${SERVER_URL}/season`);
		if (res.ok) {
			currentSeason = await res.json();
			if (seasonInfo) {
				if (currentSeason.isActive) {
					seasonInfo.textContent = `Season ${currentSeason.seasonNumber} - Week ${currentSeason.currentWeek}/${currentSeason.totalWeeks} (${currentSeason.weeksRemaining} weeks remaining)`;
				} else {
					seasonInfo.textContent = `Season ${currentSeason.seasonNumber} - Ended. New season starting...`;
				}
			}
			return currentSeason;
		}
	} catch (err) {
		console.warn('Failed to load season info', err);
	}
	return null;
}

async function checkUserSubmissionStatus() {
	if (!currentUser || !currentSeason) return null;
	try {
		const res = await fetch(`${SERVER_URL}/season/user-status/${currentUser.id}`);
		if (res.ok) {
			return await res.json();
		}
	} catch (err) {
		console.warn('Failed to check user submission status', err);
	}
	return null;
}

async function shouldShowSubmissionModal() {
	if (!currentUser) return false;
	const seasonInfo = await loadSeasonInfo();
	if (!seasonInfo || !seasonInfo.isActive) return false;
	
	const userStatus = await checkUserSubmissionStatus();
	if (!userStatus) return true; // Show if we can't check status
	
	const categories = currentGroup?.settings?.categories || ['top-pick', 'wild-card'];
	const submittedCategories = new Set((userStatus.submissions || []).map(s => s.category));
	return submittedCategories.size < categories.length;
}

function openSubmissionPortal() {
	if (submissionModal) {
		submissionModal.classList.remove('hidden');
	}
}

function closeSubmissionPortal() {
	if (submissionModal) {
		submissionModal.classList.add('hidden');
		if (movieFormModal) movieFormModal.reset();
		if (statusModal) {
			statusModal.textContent = '';
			statusModal.className = 'status';
		}
	}
}

// Submission modal handlers
if (openSubmissionModal) {
	openSubmissionModal.addEventListener('click', () => {
		openSubmissionPortal();
	});
}

if (closeSubmissionModal) {
	closeSubmissionModal.addEventListener('click', () => {
		closeSubmissionPortal();
	});
}

if (closeSubmissionModalBtn) {
	closeSubmissionModalBtn.addEventListener('click', () => {
		closeSubmissionPortal();
	});
}

if (submissionModal) {
	submissionModal.addEventListener('click', (e) => {
		if (e.target === submissionModal) closeSubmissionPortal();
	});
}

// Handle modal form submission (reuse existing form logic)
if (movieFormModal) {
	const titleModal = document.getElementById('title-modal');
	const categoryModal = document.getElementById('movie-category-modal');
	const descriptionModal = document.getElementById('description-modal');
	const charCountModal = document.getElementById('char-count-modal');
	const posterImgModal = document.getElementById('poster-img-modal');
	
	// Character count for modal
	if (descriptionModal && charCountModal) {
		descriptionModal.addEventListener('input', () => {
			charCountModal.textContent = descriptionModal.value.length;
		});
	}
	
	movieFormModal.addEventListener('submit', async (e) => {
		e.preventDefault();
		if (statusModal) {
			statusModal.textContent = '';
			statusModal.className = 'status';
		}
		
		const title = titleModal?.value.trim() || '';
		const category = categoryModal?.value || '';
		const description = descriptionModal?.value.trim() || '';
		
		if (!title || title.length < 2) {
			if (statusModal) {
				statusModal.textContent = '❌ Please enter a valid title.';
				statusModal.classList.add('error');
			}
			return;
		}
		if (!category) {
			if (statusModal) {
				statusModal.textContent = '❌ Please select a category.';
				statusModal.classList.add('error');
			}
			return;
		}
		if (!description || description.length < 10) {
			if (statusModal) {
				statusModal.textContent = '❌ Description must be 10+ characters.';
				statusModal.classList.add('error');
			}
			return;
		}
		
		if (statusModal) {
			statusModal.textContent = '⏳ Submitting...';
			statusModal.classList.add('error');
		}
		
		const submitBtn = movieFormModal.querySelector('button[type="submit"]');
		if (submitBtn) submitBtn.disabled = true;
		
		let posterUrl = await fetchPoster(title);
		if (posterUrl && posterImgModal) {
			posterImgModal.src = posterUrl;
			posterImgModal.hidden = false;
		} else if (posterImgModal) {
			posterImgModal.hidden = true;
		}
		
		try {
			const submissionPayload = {
				title,
				category,
				description,
				posterUrl,
				userId: currentUser?.id || null,
				groupId: currentGroup?.id || null
			};
			const result = await postSubmission(submissionPayload);
			if (result && result.ok) {
				if (statusModal) {
					statusModal.textContent = '✓ Submitted successfully!';
					statusModal.className = 'status success';
				}
				movieFormModal.reset();
				if (charCountModal) charCountModal.textContent = '0';
				if (posterImgModal) posterImgModal.hidden = true;
				await refreshList();
				
				// Check if user has completed both submissions
				const userStatus = await checkUserSubmissionStatus();
				if (userStatus && userStatus.hasTopPick && userStatus.hasWildCard) {
					// User has submitted both, auto-close after 2 seconds
					setTimeout(() => {
						closeSubmissionPortal();
					}, 2000);
				}
			} else {
				const errorMsg = result?.error || 'Unknown error';
				if (statusModal) {
					statusModal.textContent = `❌ Submission failed: ${errorMsg}`;
					statusModal.className = 'status error';
				}
				console.error('Submission error:', result);
			}
		} catch (err) {
			if (statusModal) {
				statusModal.textContent = `❌ Submission error: ${err.message || 'Network error. Make sure the server is running on port 3000.'}`;
				statusModal.className = 'status error';
			}
			console.error('Submission exception:', err);
		} finally {
			if (submitBtn) submitBtn.disabled = false;
		}
	});
}

// initial load - wait for DOM to be ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => {
		setupMenuDropdown();
		initialize();
	});
} else {
	setupMenuDropdown();
	initialize();
}

async function initialize() {
	if (!loadUserFromStorage()) {
		showGroupSetup();
		return;
	}
	
	// Load season info
	await loadSeasonInfo();
	
	// Check if we should show submission modal on first login
	const shouldShow = await shouldShowSubmissionModal();
	if (shouldShow) {
		// Delay to let page load first
		setTimeout(() => {
			openSubmissionPortal();
		}, 1000);
	}
	
	refreshList();
	refreshHistory();
	refreshDiscussionBoard();
}