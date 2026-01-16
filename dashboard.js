// Configuration: set your OMDb API key here
const OMDB_API_KEY = 'bafff0b8';
// Auto-detect server URL: use current origin (works for both localhost and deployed)
const SERVER_URL = window.location.origin;

// Clear redirect flag from welcome page when dashboard loads
const REDIRECT_KEY = 'cinemaclub_redirecting';
const USER_STORAGE_KEY = 'movieClubUser';

function getStoredUser() {
	return localStorage.getItem(USER_STORAGE_KEY) || sessionStorage.getItem(USER_STORAGE_KEY);
}

function clearStoredUser() {
	localStorage.removeItem(USER_STORAGE_KEY);
	sessionStorage.removeItem(USER_STORAGE_KEY);
}
try {
	sessionStorage.removeItem(REDIRECT_KEY);
} catch (e) {
	// Ignore errors
}

// Current user profile
let currentUser = null;
let currentGroup = null;
let userSubmissionStatus = null;

const form = document.getElementById('movie-form');
const statusEl = document.getElementById('status');
const posterImg = document.getElementById('poster-img');
let topPickGrid = document.getElementById('top-pick-grid');
let wildCardGrid = document.getElementById('wild-card-grid');
const pickNowBtn = document.getElementById('pick-now');
const resetBtn = document.getElementById('reset-all');
const currentWinnerEl = document.getElementById('current-winner');
const historyEl = document.getElementById('history');
const charCountEl = document.getElementById('char-count');
const descriptionEl = document.getElementById('description');
const submissionCountEl = document.getElementById('submission-count');

// Check authentication - redirect to login if not logged in
function checkAuth() {
  const stored = getStoredUser();
  if (!stored) {
    window.location.href = 'login.html';
    return false;
  }
  try {
    const user = JSON.parse(stored);
    if (!user || !user.id) {
      window.location.href = 'login.html';
      return false;
    }
  } catch (e) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// Profile modal elements (will be accessed when needed)
let profileModal;
let profileForm;
let profileFormContainer;
let profileDisplay;
let createGroupBtn;
let joinGroupBtn;
let groupFormSection;
let joinGroupSection;
let clubNameEl;
let clubCodeEl;
let clubSeasonLengthEl;
let clubSubmissionsPerUserEl;
let clubCategoriesEl;
let clubCurrentWeekEl;
let clubMembersEl;
let copyClubCodeBtn;
let groupDetailsCache = null;
let clubDetailsPopover;
let closeClubDetailsBtn;
let editClubSettingsBtn;
let clubSettingsForm;
let clubSeasonLengthInput;
let clubSubmissionsInput;
let clubCategoriesInput;
let cancelClubSettingsBtn;
let deleteClubBtn;
let adminSectionEl;
let adminSelectEl;
let adminAddBtn;
let openClubDetailsBtn;
let resetUserSelectEl;
let resetUserBtn;
let clubNameInput;
let clubDescriptionInput;
let seasonSelectEl;
let selectedSeasonNumber = null;
let latestHistory = [];
let weekSelectEl;
let selectedWeekIndex = null;
let activeSeasonHistory = [];
let clubsModal;
let closeClubsModalBtn;
let clubsModalListEl;
let clubsModalStatusEl;
let membersModal;
let closeMembersModalBtn;
let membersModalListEl;
let viewMembersBtn;
let userSubmissionsModal;
let closeUserSubmissionsModalBtn;
let userSubmissionsListEl;
let userSubmissionsStatusEl;
let viewUserSubmissionsBtn;
let startNewSeasonBtn;
let headerClubNameEl;

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
      return true;
    } catch (e) {
      console.error('Error loading user from storage', e);
    }
  }
  return false;
}

// Load group settings and update UI
function loadGroupSettings() {
  if (!currentGroup || !currentGroup.settings) {
    // Default settings if group doesn't have settings (for backwards compatibility)
    currentGroup = currentGroup || {};
    currentGroup.settings = {
      seasonLength: 14,
      submissionsPerUser: 7,
      categories: ['top-pick', 'wild-card']
    };
  }
  
  // Update category select options in submission modal
  const categorySelect = document.getElementById('movie-category-modal');
  if (categorySelect && currentGroup.settings.categories) {
    categorySelect.innerHTML = '';
    currentGroup.settings.categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      // Format category name for display
      const displayName = cat.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      option.textContent = displayName;
      categorySelect.appendChild(option);
    });
  }
  
  // Update category grids dynamically - this will be handled in renderList
  // For now, we just need to ensure the grid elements exist
}

// Group setup modal handlers removed - only on welcome page

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
		const allSubmissions = await res.json();
		
		// Filter submissions by current group and season
		const currentGroupId = currentGroup?.id || null;
		const currentSeasonNumber = getActiveSeasonNumber();
		
		const filteredList = (allSubmissions || []).filter(item => {
			// Match group: if we have a group, item must match; if no group, item must not have a group
			const matchesGroup = currentGroupId 
				? (item.groupId === currentGroupId)
				: (!item.groupId);
			
			// Match season: if we have a season, item must match; if no season, allow any
			const matchesSeason = currentSeasonNumber
				? (item.seasonNumber === currentSeasonNumber)
				: true;
			
			return matchesGroup && matchesSeason;
		});
		
		// Fetch posters for items that don't have them
		// The server should enrich them, but we'll also try client-side as fallback
		const posterPromises = filteredList.map(async (item) => {
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
		renderList(filteredList);
	} catch (err) {
		console.error('Failed to load submissions:', err);
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
			const seasonNumber = getActiveSeasonNumber();
			const filteredHistory = history.filter((entry) => {
				const matchesGroup = groupId ? getEntryGroupId(entry) === groupId : !getEntryGroupId(entry);
				const matchesSeason = seasonNumber ? getEntrySeasonNumber(entry) === seasonNumber : true;
				return matchesGroup && matchesSeason;
			});
			const seasonHistory = getSeasonHistory(filteredHistory);
			const maxIndex = selectedWeekIndex ? Math.min(selectedWeekIndex, seasonHistory.length) : seasonHistory.length;
			const revealedEntries = seasonHistory.slice(0, maxIndex);
			// Extract movie titles from history (winners are revealed)
			const revealedTitles = revealedEntries.flatMap(h => getEntryWinners(h).map(w => w.title)).filter(Boolean);
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
		const categoriesContainer = document.getElementById('categories-container');
		if (categoriesContainer) {
			categoriesContainer.innerHTML = '<p>No submissions yet.</p>';
		}
		submissionCountEl.textContent = '0 movies submitted';
		pickNowBtn.disabled = true;
		return;
	}
	
	// Get group categories or use defaults
	const categories = (currentGroup && currentGroup.settings && currentGroup.settings.categories) || ['top-pick', 'wild-card'];
	const categoriesContainer = document.getElementById('categories-container');
	
	// Clear and rebuild category sections dynamically
	if (categoriesContainer) {
		categoriesContainer.innerHTML = '';
		
		// Get revealed movies from history (winners are automatically revealed)
		const revealedTitles = await getRevealedMovies();
		
		// Create sections for each category
		categories.forEach(category => {
			const categoryItems = list.filter(item => item.category === category).sort((a, b) => a.id.localeCompare(b.id));
			
			const section = document.createElement('div');
			section.className = 'category-section';
			
			// Format category name for display
			const categoryDisplayName = category.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
			const categoryIcon = category === 'top-pick' ? '⭐' : category === 'wild-card' ? '🎲' : category === 'classic' ? '🎩' : category === 'indie' ? '🎬' : category === 'international' ? '🌍' : category === 'documentary' ? '📽️' : '🎞️';
			
			section.innerHTML = `<h3 class="category-title">${categoryIcon} ${categoryDisplayName}</h3>`;
			
			const grid = document.createElement('div');
			grid.className = 'submissions-grid';
			grid.id = `${category}-grid`;
			
			// Render movies in this category
			if (categoryItems.length === 0) {
				grid.innerHTML = `<p class="empty-category">No ${categoryDisplayName} submitted yet.</p>`;
			} else {
				categoryItems.forEach((item, idx) => {
					const cardNumber = idx + 1;
					const isRevealed = revealedTitles.includes(item.title);
					const card = createMovieCard(item, cardNumber, isRevealed);
					grid.appendChild(card);
				});
			}
			
			section.appendChild(grid);
			categoriesContainer.appendChild(section);
		});
	}
	
	// Update submission count
	const total = list.length;
	const categoryCounts = categories.map(cat => {
		const count = list.filter(item => item.category === cat).length;
		const catName = cat.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
		return `${count} ${catName}`;
	}).join(', ');
	
	submissionCountEl.textContent = `${total} movie${total !== 1 ? 's' : ''} submitted (${categoryCounts})`;
	pickNowBtn.disabled = false;
	
	// Update grid references for backwards compatibility
	topPickGrid = document.getElementById('top-pick-grid');
	wildCardGrid = document.getElementById('wild-card-grid');
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
let lastFetchedTitle = '';
if (titleInput) {
titleInput.addEventListener('input', () => {
	clearTimeout(previewTimer);
	const value = titleInput.value.trim();
	
	// Only hide/show if value actually changed meaningfully
	if (!value) {
		if (!posterImg.hidden) {
			posterImg.hidden = true;
		}
		return;
	}
	
	// Skip if we're fetching the same title
	if (value === lastFetchedTitle) return;
	
	previewTimer = setTimeout(async () => {
		// Double-check the value hasn't changed during the timeout
		const currentValue = titleInput.value.trim();
		if (currentValue !== value) return;
		
		lastFetchedTitle = value;
		const p = await fetchPoster(value);
		
		// Verify the input hasn't changed since fetch started
		if (titleInput.value.trim() === value && p) {
			posterImg.src = p;
			posterImg.hidden = false;
		}
	}, 800); // Slightly longer debounce for mobile
});
}

// Character counter for description - throttled for performance
if (descriptionEl) {
	let charCounterTimer;
	descriptionEl.addEventListener('input', () => {
		clearTimeout(charCounterTimer);
		charCounterTimer = setTimeout(() => {
			if (charCountEl) {
				charCountEl.textContent = descriptionEl.value.length;
			}
		}, 100); // Small delay to reduce frequent updates
	});
}

// Profile modal and logout handlers - will be set up after DOM loads
function handleMenuAction(action) {
	if (!action) return;
	if (action === 'profile') {
		if (profileModal) profileModal.classList.remove('hidden');
		return;
	}
	if (action === 'view-clubs') {
		openClubsModal();
		return;
	}
	if (action === 'groups-home') {
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
	const closePopover = () => {
		if (clubDetailsPopover) clubDetailsPopover.classList.add('hidden');
	};

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
		const clickedInsideMenu = menu.contains(e.target);
		const clickedInsidePopover = clubDetailsPopover && clubDetailsPopover.contains(e.target);
		const clickedOpenButton = openClubDetailsBtn && openClubDetailsBtn.contains(e.target);
		if (!clickedInsideMenu && !clickedInsidePopover && !clickedOpenButton) {
			closePanel();
			closePopover();
		}
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

function openClubsModal() {
	if (!clubsModal) {
		clubsModal = document.getElementById('clubs-modal');
	}
	if (!clubsModal) return;
	clubsModal.classList.remove('hidden');
	loadUserClubs();
}

async function loadUserClubs() {
	if (!clubsModalStatusEl) clubsModalStatusEl = document.getElementById('clubs-modal-status');
	if (!clubsModalListEl) clubsModalListEl = document.getElementById('clubs-modal-list');
	if (!currentUser?.id || !clubsModalListEl) return;
	if (clubsModalStatusEl) {
		clubsModalStatusEl.textContent = 'Loading your clubs...';
		clubsModalStatusEl.className = 'status';
	}
	try {
		const res = await fetch(`${SERVER_URL}/user/${currentUser.id}/clubs`);
		const data = await res.json();
		if (!res.ok || !data.ok) {
			throw new Error(data.error || 'Failed to load clubs');
		}
		renderClubsModal(data.clubs || []);
		if (clubsModalStatusEl) clubsModalStatusEl.textContent = '';
	} catch (err) {
		console.error('Failed to load clubs', err);
		if (clubsModalStatusEl) {
			clubsModalStatusEl.textContent = '❌ Could not load clubs.';
			clubsModalStatusEl.className = 'status error';
		}
	}
}

function renderClubsModal(clubs) {
	if (!clubsModalListEl) return;
	clubsModalListEl.innerHTML = '';
	if (!Array.isArray(clubs) || clubs.length === 0) {
		clubsModalListEl.innerHTML = '<p class="no-reviews">No clubs joined yet.</p>';
		return;
	}
	clubs.forEach((club) => {
		const row = document.createElement('div');
		row.className = 'detail-row';
		const isCurrent = club.id && currentGroup?.id && club.id === currentGroup.id;
		const roleLabel = club.isAdmin ? ' · Admin' : '';
		row.innerHTML = `
			<span class="detail-label">${escapeHtml(club.name || 'Untitled Club')}${roleLabel}</span>
			<span class="detail-value">Code: ${escapeHtml(club.code || 'N/A')}</span>
			<button type="button" class="btn btn-secondary" ${isCurrent ? 'disabled' : ''} data-club-id="${escapeHtml(club.id)}">
				${isCurrent ? 'Current' : 'Open'}
			</button>
		`;
		const button = row.querySelector('button');
		if (button && !isCurrent) {
			button.addEventListener('click', () => {
				switchToClub(club);
			});
		}
		clubsModalListEl.appendChild(row);
	});
}

async function switchToClub(club) {
	if (!club || !club.id) return;
	currentGroup = club;
	localStorage.setItem('movieClubGroup', JSON.stringify(club));
	updateHeaderClubName();
	loadGroupSettings();
	const groupDetails = await loadGroupDetails();
	if (groupDetails) {
		// Update currentGroup with admin info from groupDetails
		if (groupDetails.admins && !currentGroup.admins) {
			currentGroup.admins = groupDetails.admins;
		}
		if (groupDetails.creatorId && !currentGroup.creatorId) {
			currentGroup.creatorId = groupDetails.creatorId;
		}
		renderClubDetails(groupDetails);
	} else {
		renderClubDetails();
	}
	selectedSeasonNumber = null;
	await loadSeasonInfo();
	if (!selectedSeasonNumber && currentSeason?.seasonNumber) {
		selectedSeasonNumber = currentSeason.seasonNumber;
	}
	await checkUserSubmissionStatus();
	renderCategoryRequirements();
	refreshList();
	refreshHistory();
	refreshDiscussionBoard();
	if (clubsModal) clubsModal.classList.add('hidden');
}

function openMembersModal() {
	if (!membersModal) {
		membersModal = document.getElementById('members-modal');
	}
	if (!membersModal) return;
	membersModal.classList.remove('hidden');
	renderMembersModal();
}

function closeMembersModal() {
	if (membersModal) membersModal.classList.add('hidden');
}

function renderMembersModal() {
	if (!membersModalListEl) {
		membersModalListEl = document.getElementById('members-modal-list');
	}
	if (!membersModalListEl) return;
	
	const members = groupDetailsCache?.memberDetails || [];
	const admins = groupDetailsCache?.admins || (currentGroup ? [currentGroup.creatorId] : []);
	
	if (members.length === 0) {
		if (currentGroup?.members && currentGroup.members.length > 0) {
			membersModalListEl.innerHTML = `<p class="no-reviews">Loading member details...</p>`;
			// Try to load member details
			loadGroupDetails().then(() => {
				renderMembersModal(); // Re-render after loading
			});
			return;
		} else {
			membersModalListEl.innerHTML = '<p class="no-reviews">No members found.</p>';
			return;
		}
	}
	
	membersModalListEl.innerHTML = '';
	members.forEach((member) => {
		const isAdmin = admins.includes(member.id);
		const isCreator = member.id === currentGroup?.creatorId;
		const row = document.createElement('div');
		row.className = 'detail-row';
		const name = member.username || member.name || 'Unknown Member';
		const adminBadge = isAdmin || isCreator ? '<span style="background: var(--gold); color: var(--bg-dark); padding: 0.25rem 0.5rem; border-radius: 8px; font-size: 0.75rem; font-weight: 700; margin-left: 0.5rem;">ADMIN</span>' : '';
		row.innerHTML = `
			<span class="detail-label">${escapeHtml(name)}${adminBadge}</span>
			<span class="detail-value">${member.email || 'No email'}</span>
		`;
		membersModalListEl.appendChild(row);
	});
}

function openUserSubmissionsModal() {
	if (!userSubmissionsModal) {
		userSubmissionsModal = document.getElementById('user-submissions-modal');
	}
	if (!userSubmissionsModal) return;
	userSubmissionsModal.classList.remove('hidden');
	loadUserSubmissions();
}

async function loadUserSubmissions() {
	if (!userSubmissionsStatusEl) userSubmissionsStatusEl = document.getElementById('user-submissions-status');
	if (!userSubmissionsListEl) userSubmissionsListEl = document.getElementById('user-submissions-list');
	if (!currentUser?.id || !currentGroup?.id || !userSubmissionsListEl) return;
	
	if (userSubmissionsStatusEl) {
		userSubmissionsStatusEl.textContent = 'Loading submission summary...';
		userSubmissionsStatusEl.className = 'status';
	}
	
	try {
		const res = await fetch(`${SERVER_URL}/group/${currentGroup.id}/submissions-summary?userId=${currentUser.id}`);
		const data = await res.json();
		
		if (!res.ok || !data.ok) {
			throw new Error(data.error || 'Failed to load submission summary');
		}
		
		renderUserSubmissions(data.summaries || [], data.totalSubmissions || 0);
		if (userSubmissionsStatusEl) userSubmissionsStatusEl.textContent = '';
	} catch (err) {
		console.error('Failed to load user submissions', err);
		if (userSubmissionsStatusEl) {
			userSubmissionsStatusEl.textContent = '❌ Could not load submission summary.';
			userSubmissionsStatusEl.className = 'status error';
		}
	}
}

function renderUserSubmissions(summaries, totalSubmissions) {
	if (!userSubmissionsListEl) return;
	
	if (!Array.isArray(summaries) || summaries.length === 0) {
		userSubmissionsListEl.innerHTML = '<p class="no-reviews">No members found.</p>';
		return;
	}
	
	userSubmissionsListEl.innerHTML = `
		<div style="margin-bottom: 1.5rem; padding: 1rem; background: rgba(255, 255, 255, 0.05); border-radius: 12px;">
			<strong style="color: var(--text-primary);">Total Submissions:</strong>
			<span style="color: var(--gold); font-size: 1.2rem; font-weight: 700; margin-left: 0.5rem;">${totalSubmissions}</span>
		</div>
	`;
	
	summaries.forEach((summary) => {
		const userCard = document.createElement('div');
		userCard.style.cssText = 'background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.5rem; margin-bottom: 1rem;';
		
		const adminBadge = summary.isAdmin ? '<span style="background: var(--gold); color: var(--bg-dark); padding: 0.25rem 0.5rem; border-radius: 8px; font-size: 0.75rem; font-weight: 700; margin-left: 0.5rem;">ADMIN</span>' : '';
		
		userCard.innerHTML = `
			<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
				<h3 style="margin: 0; color: var(--text-primary); display: flex; align-items: center;">
					${escapeHtml(summary.username || 'Unknown')}${adminBadge}
				</h3>
				<span style="color: var(--text-secondary); font-size: 0.9rem;">
					${summary.submissionCount} submission${summary.submissionCount !== 1 ? 's' : ''}
				</span>
			</div>
		`;
		
		if (summary.submissionCount === 0) {
			const emptyMsg = document.createElement('p');
			emptyMsg.style.cssText = 'color: var(--text-secondary); font-style: italic; margin: 0; padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 8px;';
			emptyMsg.textContent = 'No submissions yet';
			userCard.appendChild(emptyMsg);
		} else {
			const submissionsContainer = document.createElement('div');
			submissionsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 0.75rem;';
			
			Object.keys(summary.submissionsByCategory).forEach((category) => {
				const categoryDiv = document.createElement('div');
				categoryDiv.style.cssText = 'padding: 0.75rem; background: rgba(255, 255, 255, 0.05); border-radius: 8px;';
				
				const categoryDisplayName = category.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
				const categoryIcon = category === 'top-pick' ? '⭐' : category === 'wild-card' ? '🎲' : category === 'fan-favorite' ? '❤️' : '🎬';
				
				categoryDiv.innerHTML = `
					<div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem;">
						${categoryIcon} ${categoryDisplayName}
					</div>
				`;
				
				summary.submissionsByCategory[category].forEach((sub) => {
					const subDiv = document.createElement('div');
					subDiv.style.cssText = 'margin-left: 1rem; padding: 0.5rem; border-left: 2px solid var(--border-color);';
					
					const posterHtml = sub.posterUrl 
						? `<img src="${escapeHtml(sub.posterUrl)}" alt="${escapeHtml(sub.title)}" style="width: 50px; height: 75px; object-fit: cover; border-radius: 4px; margin-right: 0.75rem; float: left;">`
						: '';
					
					subDiv.innerHTML = `
						<div style="display: flex; align-items: start;">
							${posterHtml}
							<div style="flex: 1;">
								<div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem;">
									${escapeHtml(sub.title)}
								</div>
								<div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.25rem;">
									${escapeHtml(sub.description || 'No description')}
								</div>
								<div style="color: var(--text-secondary); font-size: 0.8rem; opacity: 0.7;">
									Submitted: ${new Date(sub.submittedAt).toLocaleDateString()}
								</div>
							</div>
						</div>
						<div style="clear: both;"></div>
					`;
					categoryDiv.appendChild(subDiv);
				});
				
				submissionsContainer.appendChild(categoryDiv);
			});
			
			userCard.appendChild(submissionsContainer);
		}
		
		userSubmissionsListEl.appendChild(userCard);
	});
}

function setupProfileAndLogoutHandlers() {
	// Get elements
	const closeProfileModalEl = document.getElementById('close-profile-modal');
	profileModal = document.getElementById('profile-modal');
	profileForm = document.getElementById('profile-form');
	profileFormContainer = document.getElementById('profile-form-container');
	profileDisplay = document.getElementById('profile-display');
	createGroupBtn = document.getElementById('create-group-btn');
	joinGroupBtn = document.getElementById('join-group-btn');
	groupFormSection = document.getElementById('group-form-section');
	joinGroupSection = document.getElementById('join-group-section');
	clubNameEl = document.getElementById('club-name');
	clubCodeEl = document.getElementById('club-code');
	clubSeasonLengthEl = document.getElementById('club-season-length');
	clubSubmissionsPerUserEl = document.getElementById('club-submissions-per-user');
	clubCategoriesEl = document.getElementById('club-categories');
	clubCurrentWeekEl = document.getElementById('club-current-week');
	// clubMembersEl removed - members now in separate modal
	copyClubCodeBtn = document.getElementById('copy-club-code');
	clubDetailsPopover = document.getElementById('club-details-popover');
	closeClubDetailsBtn = document.getElementById('close-club-details');
	editClubSettingsBtn = document.getElementById('edit-club-settings');
	clubSettingsForm = document.getElementById('club-settings-form');
	clubNameInput = document.getElementById('club-name-input');
	clubDescriptionInput = document.getElementById('club-description-input');
	clubSeasonLengthInput = document.getElementById('club-season-length-input');
	clubSubmissionsInput = document.getElementById('club-submissions-input');
	clubCategoriesInput = document.getElementById('club-categories-input');
	cancelClubSettingsBtn = document.getElementById('cancel-club-settings');
	deleteClubBtn = document.getElementById('delete-club-btn');
	adminSectionEl = document.getElementById('admin-section');
	adminSelectEl = document.getElementById('admin-select');
	adminAddBtn = document.getElementById('add-admin-btn');
	openClubDetailsBtn = document.getElementById('open-club-details');
	resetUserSelectEl = document.getElementById('reset-user-select');
	resetUserBtn = document.getElementById('reset-user-btn');
	seasonSelectEl = document.getElementById('season-select');
	weekSelectEl = document.getElementById('week-select');
	clubsModal = document.getElementById('clubs-modal');
	closeClubsModalBtn = document.getElementById('close-clubs-modal');
	clubsModalListEl = document.getElementById('clubs-modal-list');
	clubsModalStatusEl = document.getElementById('clubs-modal-status');
	membersModal = document.getElementById('members-modal');
	closeMembersModalBtn = document.getElementById('close-members-modal');
	membersModalListEl = document.getElementById('members-modal-list');
	viewMembersBtn = document.getElementById('view-members-btn');
	userSubmissionsModal = document.getElementById('user-submissions-modal');
	closeUserSubmissionsModalBtn = document.getElementById('close-user-submissions-modal');
	userSubmissionsListEl = document.getElementById('user-submissions-list');
	userSubmissionsStatusEl = document.getElementById('user-submissions-status');
	viewUserSubmissionsBtn = document.getElementById('view-user-submissions-btn');
	startNewSeasonBtn = document.getElementById('start-new-season-btn');
	headerClubNameEl = document.getElementById('club-header-name');

	// Close profile modal handler
	if (closeProfileModalEl && profileModal) {
		closeProfileModalEl.addEventListener('click', (e) => {
			e.preventDefault();
			profileModal.classList.add('hidden');
		});
	}

	if (closeClubDetailsBtn && clubDetailsPopover) {
		closeClubDetailsBtn.addEventListener('click', () => {
			clubDetailsPopover.classList.add('hidden');
		});
	}

	if (closeClubsModalBtn && clubsModal) {
		closeClubsModalBtn.addEventListener('click', () => {
			clubsModal.classList.add('hidden');
		});
	}

	// Members modal handlers
	if (viewMembersBtn) {
		viewMembersBtn.addEventListener('click', () => {
			openMembersModal();
		});
	}

	if (closeMembersModalBtn && membersModal) {
		closeMembersModalBtn.addEventListener('click', () => {
			membersModal.classList.add('hidden');
		});
	}

	if (membersModal) {
		membersModal.addEventListener('click', (e) => {
			if (e.target === membersModal) membersModal.classList.add('hidden');
		});
	}

	if (closeUserSubmissionsModalBtn && userSubmissionsModal) {
		closeUserSubmissionsModalBtn.addEventListener('click', () => {
			userSubmissionsModal.classList.add('hidden');
		});
	}

	if (userSubmissionsModal) {
		userSubmissionsModal.addEventListener('click', (e) => {
			if (e.target === userSubmissionsModal) userSubmissionsModal.classList.add('hidden');
		});
	}

	if (viewUserSubmissionsBtn) {
		viewUserSubmissionsBtn.addEventListener('click', () => {
			openUserSubmissionsModal();
		});
	}


	if (editClubSettingsBtn && clubSettingsForm) {
		editClubSettingsBtn.addEventListener('click', () => {
			populateSettingsForm();
			clubSettingsForm.classList.remove('hidden');
		});
	}

	if (cancelClubSettingsBtn && clubSettingsForm) {
		cancelClubSettingsBtn.addEventListener('click', () => {
			clubSettingsForm.classList.add('hidden');
		});
	}

	if (clubSettingsForm) {
		clubSettingsForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			if (!currentGroup?.id) return;

			const name = clubNameInput?.value.trim();
			const description = clubDescriptionInput?.value.trim() || '';
			const seasonLength = parseInt(clubSeasonLengthInput?.value, 10);
			const submissionsPerUser = parseInt(clubSubmissionsInput?.value, 10);
			const categoriesRaw = clubCategoriesInput?.value || '';
			const categories = categoriesRaw.split(',')
				.map((value) => normalizeCategory(value))
				.filter(Boolean);

			if (!name) {
				alert('Please enter a club name.');
				return;
			}
			if (!seasonLength || seasonLength < 4 || seasonLength > 52) {
				alert('Season length must be between 4 and 52 weeks.');
				return;
			}
			if (!submissionsPerUser || submissionsPerUser < 1 || submissionsPerUser > 20) {
				alert('Submissions per user must be between 1 and 20.');
				return;
			}
			if (!categories.length) {
				alert('Please enter at least one category.');
				return;
			}
			if (new Set(categories).size !== categories.length) {
				alert('Category names must be unique.');
				return;
			}

			try {
				const res = await fetch(`${SERVER_URL}/group/${currentGroup.id}/settings`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name, description, seasonLength, submissionsPerUser, categories, userId: currentUser?.id })
				});

				if (!res.ok) {
					const errorText = await res.text();
					alert('Update failed: Server returned ' + res.status + '. ' + errorText);
					return;
				}

				const data = await res.json();
				if (!data.ok) {
					alert('Update failed: ' + (data.error || 'Unknown error'));
					return;
				}

				currentGroup = data.group;
				// Ensure currentGroup has creatorId for admin checks
				if (data.group && !currentGroup.creatorId && data.group.creatorId) {
					currentGroup.creatorId = data.group.creatorId;
				}
				localStorage.setItem('movieClubGroup', JSON.stringify(currentGroup));
				loadGroupSettings();
				renderClubDetails(data.group);
				clubSettingsForm.classList.add('hidden');
			} catch (err) {
				console.error('Failed to update settings', err);
				alert('Network error. Make sure the server is running on port 3000.');
			}
		});
	}

	if (deleteClubBtn) {
		deleteClubBtn.addEventListener('click', async () => {
			if (!currentGroup?.id || !currentUser?.id) return;
			if (!confirm('Delete this club? This cannot be undone.')) return;
			const clubName = currentGroup.name || '';
			const typedName = prompt(`Type "${clubName}" to confirm deletion:`) || '';
			if (typedName.trim() !== clubName) {
				alert('Club name did not match. Deletion cancelled.');
				return;
			}
			try {
				const res = await fetch(`${SERVER_URL}/group/${currentGroup.id}/delete`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ userId: currentUser.id })
				});
				if (!res.ok) {
					const errorText = await res.text();
					alert('Delete failed: ' + errorText);
					return;
				}
				const data = await res.json();
				if (!data.ok) {
					alert('Delete failed: ' + (data.error || 'Unknown error'));
					return;
				}
				localStorage.removeItem('movieClubGroup');
				window.location.href = 'welcome.html';
			} catch (err) {
				console.error('Failed to delete club', err);
				alert('Network error. Make sure the server is running on port 3000.');
			}
		});
	}

	if (adminAddBtn && adminSelectEl) {
		adminAddBtn.addEventListener('click', async () => {
			const adminId = adminSelectEl.value;
			if (!adminId || !currentGroup?.id || !currentUser?.id) return;
			try {
				const res = await fetch(`${SERVER_URL}/group/${currentGroup.id}/admins`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ userId: currentUser.id, adminId })
				});
				if (!res.ok) {
					const errorText = await res.text();
					alert('Failed to add admin: ' + errorText);
					return;
				}
				const data = await res.json();
				if (!data.ok) {
					alert('Failed to add admin: ' + (data.error || 'Unknown error'));
					return;
				}
				if (groupDetailsCache) {
					groupDetailsCache.admins = data.admins;
				}
				renderClubDetails(groupDetailsCache);
				populateAdminSelect();
			} catch (err) {
				console.error('Failed to add admin', err);
				alert('Network error. Make sure the server is running on port 3000.');
			}
		});
	}

	if (resetUserBtn && resetUserSelectEl) {
		resetUserBtn.addEventListener('click', async () => {
			const targetUserId = resetUserSelectEl.value;
			if (!targetUserId || !currentGroup?.id || !currentUser?.id) return;
			if (!confirm('Reset this user\'s submissions for the current season?')) return;
			try {
				const res = await fetch(`${SERVER_URL}/group/${currentGroup.id}/reset-user`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ userId: currentUser.id, targetUserId })
				});
				if (!res.ok) {
					const errorText = await res.text();
					alert('Failed to reset user: ' + errorText);
					return;
				}
				const data = await res.json();
				if (!data.ok) {
					alert('Failed to reset user: ' + (data.error || 'Unknown error'));
					return;
				}
				alert('User submissions reset.');
			} catch (err) {
				console.error('Failed to reset user submissions', err);
				alert('Network error. Make sure the server is running on port 3000.');
			}
		});
	}

	if (clubsModal) {
		clubsModal.addEventListener('click', (e) => {
			if (e.target === clubsModal) clubsModal.classList.add('hidden');
		});
	}


	if (startNewSeasonBtn) {
		startNewSeasonBtn.addEventListener('click', async () => {
			if (!currentGroup?.id || !currentUser?.id) return;
			if (!isCurrentUserAdmin()) {
				alert('Only admins can start a new season.');
				return;
			}
			if (!currentSeason || currentSeason.isActive) {
				alert('The current season is still active.');
				return;
			}
			if (!confirm('Start a new season now? This will reset submissions for this club.')) {
				return;
			}
			startNewSeasonBtn.disabled = true;
			try {
				const res = await fetch(`${SERVER_URL}/group/${currentGroup.id}/season/start`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ userId: currentUser.id })
				});
				const data = await res.json();
				if (!res.ok || !data.ok) {
					alert(data.error || 'Failed to start a new season.');
					return;
				}
				await loadSeasonInfo();
				selectedSeasonNumber = currentSeason?.seasonNumber || null;
				await checkUserSubmissionStatus();
				renderCategoryRequirements();
				refreshList();
				refreshHistory();
				refreshDiscussionBoard();
				alert('✨ New season started!');
			} catch (err) {
				console.error('Failed to start new season', err);
				alert('Network error. Make sure the server is running on port 3000.');
			} finally {
				startNewSeasonBtn.disabled = false;
			}
		});
	}

	// Profile form group toggle buttons (for create/join group options)
	if (createGroupBtn) {
		createGroupBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			createGroupBtn.classList.toggle('active');
			if (joinGroupBtn) joinGroupBtn.classList.remove('active');
			if (groupFormSection) groupFormSection.style.display = createGroupBtn.classList.contains('active') ? 'block' : 'none';
			if (joinGroupSection) joinGroupSection.style.display = 'none';
		});
	}

	if (joinGroupBtn) {
		joinGroupBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			joinGroupBtn.classList.toggle('active');
			if (createGroupBtn) createGroupBtn.classList.remove('active');
			if (joinGroupSection) joinGroupSection.style.display = joinGroupBtn.classList.contains('active') ? 'block' : 'none';
			if (groupFormSection) groupFormSection.style.display = 'none';
		});
	}

	// Click outside modal to close
	if (profileModal) {
		profileModal.addEventListener('click', (e) => {
			if (e.target === profileModal) {
				profileModal.classList.add('hidden');
			}
		});
	}

	if (openClubDetailsBtn) {
		openClubDetailsBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			toggleClubDetails();
		});
	}

	if (seasonSelectEl) {
		seasonSelectEl.addEventListener('change', () => {
			selectedSeasonNumber = parseInt(seasonSelectEl.value, 10);
			selectedWeekIndex = null;
			activeSeasonHistory = getSeasonHistory(latestHistory);
			updateWeekSwitcher();
			renderCurrentWinnerFromHistory(latestHistory);
			renderHistory(latestHistory);
			refreshList();
			refreshDiscussionBoard();
		});
	}

	if (weekSelectEl) {
		weekSelectEl.addEventListener('change', () => {
			selectedWeekIndex = parseInt(weekSelectEl.value, 10);
			renderCurrentWinnerFromHistory(latestHistory);
			refreshList();
			refreshDiscussionBoard();
		});
	}
}

// Profile modal click handler moved to setupProfileAndLogoutHandlers()

// These handlers should be inside setupProfileAndLogoutHandlers() after elements are loaded
// Moving them there to ensure they're set up at the right time

function displayProfile() {
	if (!profileFormContainer) {
		profileFormContainer = document.getElementById('profile-form-container');
	}
	if (!profileDisplay) {
		profileDisplay = document.getElementById('profile-display');
	}
	if (!profileFormContainer || !profileDisplay || !currentUser) {
		return;
	}
	profileFormContainer.style.display = 'none';
	profileDisplay.style.display = 'block';
	const displayName = document.getElementById('display-name');
	const displayGroup = document.getElementById('display-group');
	if (displayName) displayName.textContent = currentUser.name || '';
	if (displayGroup) {
		if (currentUser.groupId) {
			displayGroup.textContent = `🎬 Group: ${currentUser.groupId}`;
		} else {
			displayGroup.textContent = '(No group yet)';
		}
	}
}

function hideProfile() {
	if (!profileFormContainer) {
		profileFormContainer = document.getElementById('profile-form-container');
	}
	if (!profileDisplay) {
		profileDisplay = document.getElementById('profile-display');
	}
	if (!profileFormContainer || !profileDisplay) {
		return;
	}
	profileFormContainer.style.display = 'block';
	profileDisplay.style.display = 'none';
}

function renderClubDetails(groupDetails = null) {
	if (!clubDetailsPopover) return;
	if (!currentGroup) {
		clubDetailsPopover.classList.add('hidden');
		return;
	}
	if (groupDetails) {
		groupDetailsCache = groupDetails;
	}
	if (clubNameEl) clubNameEl.textContent = currentGroup.name || 'Unnamed Club';
	if (clubCodeEl) clubCodeEl.textContent = currentGroup.code || 'N/A';
	if (clubSeasonLengthEl) {
		clubSeasonLengthEl.textContent = currentGroup.settings?.seasonLength
			? `${currentGroup.settings.seasonLength} weeks`
			: 'Not set';
	}
	if (clubSubmissionsPerUserEl) {
		clubSubmissionsPerUserEl.textContent = currentGroup.settings?.submissionsPerUser
			? `${currentGroup.settings.submissionsPerUser}`
			: 'Not set';
	}
	if (clubCategoriesEl) {
		const categories = currentGroup.settings?.categories || [];
		clubCategoriesEl.textContent = categories.length ? categories.join(', ') : 'Not set';
	}
	if (clubCurrentWeekEl) {
		if (currentSeason && currentSeason.currentWeek && currentSeason.totalWeeks) {
			clubCurrentWeekEl.textContent = `Week ${currentSeason.currentWeek} of ${currentSeason.totalWeeks}`;
		} else {
			clubCurrentWeekEl.textContent = 'Not available';
		}
	}
	// Members list removed from club details - now in separate modal
	updateHeaderClubName();
	updateAdminControls();
	if (copyClubCodeBtn) {
		copyClubCodeBtn.onclick = () => {
			if (!currentGroup.code) return;
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(currentGroup.code).then(() => {
					alert('Club code copied to clipboard!');
				}).catch(() => {
					alert('Copy failed. Please copy the code manually.');
				});
			} else {
				alert('Copy not supported. Please copy the code manually.');
			}
		};
	}
}

function updateHeaderClubName() {
	if (!headerClubNameEl) {
		headerClubNameEl = document.getElementById('club-header-name');
	}
	if (!headerClubNameEl) return;
	const name = currentGroup?.name || 'Movie Club';
	headerClubNameEl.textContent = name;
	document.title = `${name} — Dashboard`;
	
	// Update tagline/description
	const taglineEl = document.querySelector('.tagline');
	if (taglineEl) {
		const description = groupDetailsCache?.description || currentGroup?.description || 'Bonding, in the digital age, over a love of all things cinematic';
		taglineEl.textContent = description;
	}
}

function toggleClubDetails() {
	if (!clubDetailsPopover) return;
	clubDetailsPopover.classList.toggle('hidden');
	if (!clubDetailsPopover.classList.contains('hidden')) {
		renderClubDetails(groupDetailsCache);
	}
}

function populateSettingsForm() {
	if (!clubSettingsForm || !currentGroup) return;
	if (clubNameInput) {
		clubNameInput.value = currentGroup.name || '';
	}
	if (clubDescriptionInput) {
		clubDescriptionInput.value = groupDetailsCache?.description || currentGroup?.description || '';
	}
	if (clubSeasonLengthInput) {
		clubSeasonLengthInput.value = currentGroup.settings?.seasonLength || 14;
	}
	if (clubSubmissionsInput) {
		clubSubmissionsInput.value = currentGroup.settings?.submissionsPerUser || 7;
	}
	if (clubCategoriesInput) {
		const categories = currentGroup.settings?.categories || [];
		clubCategoriesInput.value = categories.join(', ');
	}
}

function normalizeCategory(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function updateAdminControls() {
	// Get admins from cache, or fall back to currentGroup, or just creatorId
	let admins = [];
	if (groupDetailsCache?.admins && Array.isArray(groupDetailsCache.admins)) {
		admins = groupDetailsCache.admins;
	} else if (currentGroup?.admins && Array.isArray(currentGroup.admins)) {
		admins = currentGroup.admins;
	} else if (currentGroup?.creatorId) {
		admins = [currentGroup.creatorId];
	}
	
	const isAdmin = currentUser?.id && admins.includes(currentUser.id);
	
	// Debug logging (can be removed in production)
	// console.log('updateAdminControls:', { 
	// 	userId: currentUser?.id, 
	// 	admins, 
	// 	isAdmin, 
	// 	hasGroupDetailsCache: !!groupDetailsCache,
	// 	hasCurrentGroup: !!currentGroup 
	// });

	if (editClubSettingsBtn) {
		editClubSettingsBtn.disabled = !isAdmin;
		editClubSettingsBtn.textContent = isAdmin ? 'Edit' : 'Admin only';
	}

	if (adminSectionEl) {
		adminSectionEl.classList.toggle('hidden', !isAdmin);
	}

	if (deleteClubBtn) {
		deleteClubBtn.disabled = !isAdmin;
		deleteClubBtn.textContent = isAdmin ? 'Delete Club' : 'Admin only';
	}

	// Hide/disable Club Details button for non-admins
	if (openClubDetailsBtn) {
		openClubDetailsBtn.disabled = !isAdmin;
		openClubDetailsBtn.style.display = isAdmin ? '' : 'none';
	}

	// Hide/disable Pick Winner button for non-admins
	if (pickNowBtn) {
		pickNowBtn.disabled = !isAdmin;
		pickNowBtn.style.display = isAdmin ? '' : 'none';
	}

	// Hide/disable Reset button for non-admins
	if (resetBtn) {
		resetBtn.disabled = !isAdmin;
		resetBtn.style.display = isAdmin ? '' : 'none';
	}

	updateSeasonActionVisibility();
	populateAdminSelect();
	populateResetUserSelect();
}

function isCurrentUserAdmin() {
	const admins = groupDetailsCache?.admins || (currentGroup ? [currentGroup.creatorId] : []);
	return Boolean(currentUser?.id && admins.includes(currentUser.id));
}

function updateSeasonActionVisibility() {
	if (!startNewSeasonBtn) return;
	const shouldShow = Boolean(currentSeason && !currentSeason.isActive && isCurrentUserAdmin());
	startNewSeasonBtn.style.display = shouldShow ? 'block' : 'none';
}

function populateAdminSelect() {
	if (!adminSelectEl) return;
	const members = groupDetailsCache?.memberDetails || [];
	const admins = groupDetailsCache?.admins || (currentGroup ? [currentGroup.creatorId] : []);
	adminSelectEl.innerHTML = '';

	const eligible = members.filter((member) => !admins.includes(member.id));
	if (!eligible.length) {
		const option = document.createElement('option');
		option.value = '';
		option.textContent = 'No eligible members';
		adminSelectEl.appendChild(option);
		if (adminAddBtn) adminAddBtn.disabled = true;
		return;
	}

	eligible.forEach((member) => {
		const option = document.createElement('option');
		option.value = member.id;
		option.textContent = member.username || member.name || 'Member';
		adminSelectEl.appendChild(option);
	});

	if (adminAddBtn) adminAddBtn.disabled = false;
}

function populateResetUserSelect() {
	if (!resetUserSelectEl) return;
	const members = groupDetailsCache?.memberDetails || [];
	resetUserSelectEl.innerHTML = '';

	if (!members.length) {
		const option = document.createElement('option');
		option.value = '';
		option.textContent = 'No members';
		resetUserSelectEl.appendChild(option);
		if (resetUserBtn) resetUserBtn.disabled = true;
		return;
	}

	members.forEach((member) => {
		const option = document.createElement('option');
		option.value = member.id;
		option.textContent = member.username || member.name || 'Member';
		resetUserSelectEl.appendChild(option);
	});
	if (resetUserBtn) resetUserBtn.disabled = false;
}

async function loadGroupDetails() {
	if (!currentGroup?.id) return null;
	try {
		const res = await fetch(`${SERVER_URL}/group/${currentGroup.id}`);
		if (res.ok) {
			return await res.json();
		}
	} catch (err) {
		console.warn('Failed to load group details', err);
	}
	return null;
}

// Removed group setup functions - handled on welcome page

const editProfileBtn = document.getElementById('edit-profile-btn');
if (editProfileBtn) {
	editProfileBtn.addEventListener('click', () => {
	hideProfile();
});
}

// Group setup removed - handled on welcome.html page

if (pickNowBtn) {
pickNowBtn.addEventListener('click', async () => {
	if (!isCurrentUserAdmin()) {
		alert('Only admins can pick this week\'s winners.');
		return;
	}
	if (!confirm('Pick this week\'s winners for every category? This will record the picks and reveal them.')) return;
	
	pickNowBtn.disabled = true;
	pickNowBtn.textContent = 'Picking...';
	try {
		const res = await fetch((SERVER_URL || '') + '/pick-weekly', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ groupId: currentGroup?.id || null })
		});
		const data = await res.json();
		if (data && data.ok) {
			if (statusEl) {
				statusEl.textContent = data.message || 'Picked winners';
				statusEl.className = 'status success';
			}
			renderCurrentWinner(data.winners || [], data.historyEntry);
			// Refresh history first, then refresh list to show revealed winner
			await refreshHistory();
			await refreshList();
		} else {
			if (statusEl) {
				statusEl.textContent = data.message || 'Pick failed';
				statusEl.className = 'status error';
			}
		}
	} catch (err) {
		if (statusEl) {
			statusEl.textContent = 'Pick request failed';
			statusEl.className = 'status error';
		}
	}
	pickNowBtn.disabled = false;
	pickNowBtn.textContent = "🏆 Pick Winner";
});
}

if (resetBtn) {
resetBtn.addEventListener('click', async () => {
	if (!isCurrentUserAdmin()) {
		alert('Only admins can reset submissions.');
		return;
	}
	if (!confirm('Reset all submissions? This cannot be undone.')) return;
	try {
		const res = await fetch((SERVER_URL || '') + '/reset', { method: 'POST' });
		const data = await res.json();
		if (statusEl) {
			statusEl.textContent = '↻ ' + (data.message || 'Reset');
			statusEl.className = 'status success';
		}
		await refreshList();
		await refreshHistory();
	} catch (err) {
		if (statusEl) {
			statusEl.textContent = 'Reset failed';
			statusEl.className = 'status error';
		}
	}
});
}

// history/dashboard
async function refreshHistory() {
  try {
    const res = await fetch((SERVER_URL || '') + '/history');
    const list = await res.json();
    latestHistory = Array.isArray(list) ? list : [];
    activeSeasonHistory = getSeasonHistory(latestHistory);
    updateSeasonSwitcher(latestHistory);
    updateWeekSwitcher();
    renderCurrentWinnerFromHistory(latestHistory);
    renderHistory(list);
  } catch (err) {
    historyEl.innerHTML = '<p class="error">Could not load history.</p>';
  }
}

function renderCurrentWinner(winner, historyEntry) {
  const winners = Array.isArray(winner) ? winner : (winner ? [winner] : []);
  if (!winners.length) { 
    currentWinnerEl.innerHTML = '<div class="winner-placeholder">No winner selected yet</div>';
    // Refresh discussion board to show appropriate message
    refreshDiscussionBoard();
    return;
  }
  const fallbackPoster = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="140" height="200"%3E%3Crect fill="%23ccc" width="100%25" height="100%25"/%3E%3Ctext x="50%25" y="50%25" font-family="Arial" font-size="14" fill="%23666" text-anchor="middle" dominant-baseline="middle"%3ENo Poster%3C/text%3E%3C/svg%3E';
  const winnerLines = winners.map((entry) => {
	const categoryLabel = entry.category ? ` <span style="opacity: 0.75;">(${escapeHtml(entry.category)})</span>` : '';
	const posterSrc = entry.posterUrl || fallbackPoster;
	return `
		<div style="display: grid; grid-template-columns: 140px 1fr; gap: 1.5rem; align-items: center; margin-bottom: 1.5rem;">
			<img src="${posterSrc}" alt="${escapeHtml(entry.title)} poster" style="width: 140px; border-radius: 12px; border: 2px solid var(--border-color); box-shadow: var(--shadow-md);">
			<div>
				<strong>${escapeHtml(entry.title)}</strong>${categoryLabel}
				<p>${escapeHtml(entry.description || '')}</p>
			</div>
		</div>
	`;
  }).join('');
  currentWinnerEl.innerHTML = `
    <div style="position: relative; z-index: 1;">
      ${winnerLines}
    </div>
  `;
  // Refresh discussion board when winner is set
  refreshDiscussionBoard();
}

function renderHistory(list) {
  if (!Array.isArray(list) || list.length === 0) {
    historyEl.innerHTML = '<p>No past winners.</p>';
    return;
  }
  const filtered = getSeasonHistory(list);
  if (filtered.length === 0) {
    historyEl.innerHTML = '<p>No past winners for this season.</p>';
    return;
  }
  historyEl.innerHTML = '';
  const displayHistory = filtered.slice().reverse();
  displayHistory.forEach(h => {
    const el = document.createElement('div');
    el.className = 'history-item';
	const winners = getEntryWinners(h);
	const winnersText = winners.length
		? winners.map(w => `${escapeHtml(w.title)}${w.category ? ` (${escapeHtml(w.category)})` : ''}`).join(', ')
		: 'No winners recorded';
    el.innerHTML = `
      <div class="history-meta">${new Date(h.pickedAt).toLocaleString()} - ${h.submissionsCount} submissions</div>
      <div class="history-title">${winnersText}</div>
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

function renderReviews(reviews, reviewsList) {
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
	const discussionBoards = document.getElementById('discussion-boards');
	if (!discussionBoards) return;

	const activeSeason = getActiveSeasonNumber();
	const isCurrentSeason = currentSeason?.seasonNumber === activeSeason;
	const isLatestWeek = selectedWeekIndex ? selectedWeekIndex === activeSeasonHistory.length : true;

	const entry = getSelectedWeekEntry();
	const winners = getEntryWinners(entry);
	await renderDiscussionBoards(discussionBoards, winners, isCurrentSeason && isLatestWeek);
}

async function renderDiscussionBoards(container, winners, allowReview) {
	container.innerHTML = '';
	if (!winners || winners.length === 0) {
		container.innerHTML = '<p class="no-reviews">🎬 No winners selected yet. Once winners are chosen, reviews will appear here!</p>';
		return;
	}

	const list = Array.isArray(winners) ? winners : [winners];
	for (const winner of list) {
		const board = document.createElement('div');
		board.className = 'discussion-board-section';
		const movieTitle = winner.title || 'Untitled';
		const categoryLabel = winner.category ? ` (${winner.category})` : '';
		board.innerHTML = `
			<div class="section-header" style="margin-bottom: 1rem;">
				<h3 style="margin: 0;">${escapeHtml(movieTitle)}${categoryLabel}</h3>
				<p class="section-subtitle">Share your thoughts</p>
			</div>
			<button type="button" class="btn btn-primary add-review-btn" data-movie-title="${escapeHtml(movieTitle)}" style="margin-bottom: 1.5rem; width: 100%;">➕ Add Your Review</button>
			<div class="reviews-list"></div>
		`;
		const addReviewButton = board.querySelector('.add-review-btn');
		if (addReviewButton) {
			addReviewButton.disabled = !allowReview;
			addReviewButton.style.opacity = allowReview ? '1' : '0.6';
			addReviewButton.textContent = allowReview ? '➕ Add Your Review' : '➕ Add Your Review (Current week only)';
			addReviewButton.addEventListener('click', () => openReviewModal(movieTitle));
		}
		container.appendChild(board);

		const reviewsList = board.querySelector('.reviews-list');
		const reviews = await loadReviews(movieTitle, currentGroup?.id || null);
		renderReviews(reviews, reviewsList);
	}
}

// Review modal handlers
const reviewModal = document.getElementById('review-modal');
const reviewForm = document.getElementById('review-form');
const closeReviewModal = document.getElementById('close-review-modal');
const reviewRating = document.getElementById('review-rating');
const ratingValue = document.getElementById('rating-value');
const ratingStars = document.getElementById('rating-stars');
const reviewText = document.getElementById('review-text');
const reviewCharCount = document.getElementById('review-char-count');

function openReviewModal(movieTitle) {
	if (!currentUser) {
		alert('Please create a profile first');
		return;
	}
	if (!movieTitle) {
		alert('No winner selected yet');
		return;
	}
	document.getElementById('review-movie-title').value = movieTitle;
	if (reviewModal) reviewModal.classList.remove('hidden');
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
const categoryRequirementsEl = document.getElementById('category-requirements');

// Season tracking
let currentSeason = null;

async function loadSeasonInfo() {
	try {
		// Load group settings first
		if (!currentGroup || !currentGroup.id) {
			console.warn('No group loaded, cannot load season info');
			return null;
		}
		
		const res = await fetch(`${SERVER_URL}/season?groupId=${currentGroup.id}`);
		if (res.ok) {
			currentSeason = await res.json();
			if (seasonInfo) {
				if (currentSeason.isActive) {
					seasonInfo.textContent = `Season ${currentSeason.seasonNumber} - Week ${currentSeason.currentWeek}/${currentSeason.totalWeeks} (${currentSeason.weeksRemaining} weeks remaining)`;
				} else {
					seasonInfo.textContent = `Season ${currentSeason.seasonNumber} ended. Admins can start a new season.`;
				}
			}
			updateSeasonActionVisibility();
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
		const groupIdParam = currentGroup?.id ? `?groupId=${currentGroup.id}` : '';
		const res = await fetch(`${SERVER_URL}/season/user-status/${currentUser.id}${groupIdParam}`);
		if (res.ok) {
			const data = await res.json();
			userSubmissionStatus = data;
			return data;
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
		renderCategoryRequirements();
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
	let previewTimerModal;
	
	// Character count for modal - throttled for performance
	if (descriptionModal && charCountModal) {
		let charCounterTimerModal;
		descriptionModal.addEventListener('input', () => {
			clearTimeout(charCounterTimerModal);
			charCounterTimerModal = setTimeout(() => {
				charCountModal.textContent = descriptionModal.value.length;
			}, 100); // Small delay to reduce frequent updates
		});
	}

	// Poster preview when title changes
	let lastFetchedTitleModal = '';
	if (titleModal && posterImgModal) {
		titleModal.addEventListener('input', () => {
			clearTimeout(previewTimerModal);
			const value = titleModal.value.trim();
			
			// Only hide/show if value actually changed meaningfully
			if (!value) {
				if (!posterImgModal.hidden) {
					posterImgModal.hidden = true;
				}
				return;
			}
			
			// Skip if we're fetching the same title
			if (value === lastFetchedTitleModal) return;
			
			previewTimerModal = setTimeout(async () => {
				// Double-check the value hasn't changed during the timeout
				const currentValue = titleModal.value.trim();
				if (currentValue !== value) return;
				
				lastFetchedTitleModal = value;
				const posterUrl = await fetchPoster(value);
				
				// Verify the input hasn't changed since fetch started
				if (titleModal.value.trim() === value && posterUrl) {
					posterImgModal.src = posterUrl;
					posterImgModal.hidden = false;
				}
			}, 800); // Slightly longer debounce for mobile
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

		// Block if user already submitted in this category
		if (!userSubmissionStatus) {
			await checkUserSubmissionStatus();
		}
		const submittedCategories = new Set((userSubmissionStatus?.submissions || []).map(s => s.category));
		if (submittedCategories.has(category)) {
			if (statusModal) {
				statusModal.textContent = '❌ You have already submitted a movie for this category.';
				statusModal.classList.add('error');
			} else {
				alert('You have already submitted a movie for this category.');
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
				await checkUserSubmissionStatus();
				renderCategoryRequirements();
				
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
					const friendlyMsg = errorMsg.includes('one movie per category')
						? 'You have already submitted a movie for this category.'
						: errorMsg.includes('already been submitted')
							? 'That movie is already on the list. Try another title.'
							: errorMsg;
					statusModal.textContent = `❌ Submission failed: ${friendlyMsg}`;
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
	document.addEventListener('DOMContentLoaded', initialize);
} else {
	initialize();
}

async function initialize() {
	// Check authentication first
	if (!checkAuth()) {
		return; // Will redirect to welcome.html
	}
	
	// Set up profile and logout handlers (needs DOM elements)
	setupProfileAndLogoutHandlers();
	setupMenuDropdown();

	// Load user from storage
	if (!loadUserFromStorage()) {
		window.location.href = 'login.html';
		return;
	}
	
	// Render profile now that elements are available
	displayProfile();
	renderClubDetails();
	
	// Load group settings and update UI
	loadGroupSettings();
	
	// Load season info
	await loadSeasonInfo();
	if (!selectedSeasonNumber && currentSeason?.seasonNumber) {
		selectedSeasonNumber = currentSeason.seasonNumber;
	}
	await checkUserSubmissionStatus();
	renderCategoryRequirements();
	renderClubDetails();

	const groupDetails = await loadGroupDetails();
	if (groupDetails) {
		// Update currentGroup with admin info from groupDetails
		if (groupDetails.admins && !currentGroup.admins) {
			currentGroup.admins = groupDetails.admins;
		}
		if (groupDetails.creatorId && !currentGroup.creatorId) {
			currentGroup.creatorId = groupDetails.creatorId;
		}
		renderClubDetails(groupDetails);
	}
	
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

function getActiveSeasonNumber() {
	return selectedSeasonNumber || currentSeason?.seasonNumber || null;
}

function getEntrySeasonNumber(entry) {
	if (!entry) return null;
	if (typeof entry.seasonNumber === 'number') return entry.seasonNumber;
	if (entry.winner?.seasonNumber) return entry.winner.seasonNumber;
	if (entry.winners && entry.winners[0]?.seasonNumber) return entry.winners[0].seasonNumber;
	return null;
}

function getEntryGroupId(entry) {
	if (!entry) return null;
	if (entry.groupId) return entry.groupId;
	if (entry.winner?.groupId) return entry.winner.groupId;
	if (entry.winners && entry.winners[0]?.groupId) return entry.winners[0].groupId;
	return null;
}

function getEntryWinners(entry) {
	if (!entry) return [];
	let winners = [];
	if (Array.isArray(entry.winners) && entry.winners.length) {
		winners = entry.winners;
	} else if (entry.winner) {
		winners = [entry.winner];
	}
	if (!winners.length) return [];
	return winners.map((winner) => {
		if (!winner.category && entry.category) {
			return { ...winner, category: entry.category };
		}
		return winner;
	});
}

function getSeasonHistory(history) {
	const groupId = currentGroup?.id || null;
	const seasonNumber = getActiveSeasonNumber();
	const filtered = (history || []).filter((entry) => {
		const matchesGroup = groupId ? getEntryGroupId(entry) === groupId : !getEntryGroupId(entry);
		const matchesSeason = seasonNumber ? getEntrySeasonNumber(entry) === seasonNumber : true;
		return matchesGroup && matchesSeason;
	});
	return filtered.sort((a, b) => new Date(a.pickedAt) - new Date(b.pickedAt));
}

function updateSeasonSwitcher(history) {
	if (!seasonSelectEl) return;
	const seasons = new Set();
	if (currentSeason?.seasonNumber) seasons.add(currentSeason.seasonNumber);
	(history || []).forEach((entry) => {
		if (entry?.winner?.seasonNumber) seasons.add(entry.winner.seasonNumber);
	});
	const sorted = Array.from(seasons).sort((a, b) => b - a);
	seasonSelectEl.innerHTML = '';
	sorted.forEach((season) => {
		const option = document.createElement('option');
		option.value = season;
		option.textContent = `Season ${season}`;
		seasonSelectEl.appendChild(option);
	});
	if (!selectedSeasonNumber && sorted.length) {
		selectedSeasonNumber = sorted[0];
	}
	if (selectedSeasonNumber) {
		seasonSelectEl.value = String(selectedSeasonNumber);
	}
}

function updateWeekSwitcher() {
	if (!weekSelectEl) return;
	weekSelectEl.innerHTML = '';
	const history = activeSeasonHistory || [];
	if (history.length === 0) {
		const option = document.createElement('option');
		option.value = '';
		option.textContent = 'Week 1';
		weekSelectEl.appendChild(option);
		weekSelectEl.disabled = true;
		return;
	}
	weekSelectEl.disabled = false;
	history.forEach((entry, idx) => {
		const option = document.createElement('option');
		option.value = idx + 1;
		const dateLabel = entry.pickedAt ? ` · ${new Date(entry.pickedAt).toLocaleDateString()}` : '';
		option.textContent = `Week ${idx + 1}${dateLabel}`;
		weekSelectEl.appendChild(option);
	});
	if (!selectedWeekIndex) {
		selectedWeekIndex = history.length;
	}
	weekSelectEl.value = String(selectedWeekIndex);
}

function renderCurrentWinnerFromHistory(history) {
	if (!Array.isArray(history) || history.length === 0) {
		renderCurrentWinner(null);
		return;
	}
	const entry = getSelectedWeekEntry();
	if (entry) {
		renderCurrentWinner(getEntryWinners(entry), entry);
	} else {
		renderCurrentWinner(null);
	}
}

function getSelectedWeekEntry() {
	const history = activeSeasonHistory || [];
	if (!history.length) return null;
	const index = selectedWeekIndex ? selectedWeekIndex - 1 : history.length - 1;
	return history[index] || null;
}

function renderCategoryRequirements() {
	if (!categoryRequirementsEl) return;
	const categories = currentGroup?.settings?.categories || ['top-pick', 'wild-card'];
	const submittedCategories = new Set((userSubmissionStatus?.submissions || []).map(s => s.category));
	categoryRequirementsEl.innerHTML = '';
	categories.forEach((category) => {
		const chip = document.createElement('span');
		chip.className = `category-chip${submittedCategories.has(category) ? ' completed' : ''}`;
		chip.textContent = submittedCategories.has(category)
			? `${category} ✓`
			: category;
		categoryRequirementsEl.appendChild(chip);
	});
}