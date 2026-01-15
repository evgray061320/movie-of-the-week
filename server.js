// Simple Node/Express backend for movie submissions
// Usage: set environment variables for DATABASE_URL (PostgreSQL) and run `npm install` then `npm start`
// If DATABASE_URL is not set, falls back to JSON file storage

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// Avoid browser 404s for favicon requests by returning 204 (no content)
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

const PORT = process.env.PORT || 3000;

// Unified data access layer (uses PostgreSQL if DATABASE_URL is set, otherwise JSON file)
const data = require('./database/data');

// Season management functions
const SEASON_WEEKS = 14;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

function normalizeTitle(value) {
  return String(value || '').trim().toLowerCase();
}

async function getCurrentWeek() {
  const season = await data.getGlobalSeason();
  if (!season || !season.startDate) return 1;
  const startDate = new Date(season.startDate);
  const now = new Date();
  const weeksSinceStart = Math.floor((now - startDate) / WEEK_MS);
  return Math.min(weeksSinceStart + 1, SEASON_WEEKS);
}

async function checkAndResetSeason() {
  const season = await data.getGlobalSeason();
  const currentWeek = await getCurrentWeek();
  if (currentWeek > SEASON_WEEKS && !season.endDate) {
    // Season has ended, reset
    const submissions = await data.submissions({ groupId: null });
    const history = await data.history({ groupId: null });
    const winnersCount = history.filter(h => {
      const historyDate = new Date(h.pickedAt);
      const seasonStart = new Date(season.startDate);
      const seasonEnd = new Date();
      return historyDate >= seasonStart && historyDate <= seasonEnd;
    }).length;
    
    // Start new season
    await data.updateGlobalSeason({
      seasonNumber: (season.number || 1) + 1,
      startDate: new Date().toISOString(),
      currentWeek: 1,
      endDate: null
    });
    
    // Note: Submissions are now filtered by season, so we don't need to delete them
    // User submissions will be tracked per season automatically
    
    console.log(`Season ${season.number} ended. New season ${(season.number || 1) + 1} started.`);
    return true;
  }
  return false;
}

// Initialize on server start
(async () => {
  try {
    await checkAndResetSeason();
    const season = await data.getGlobalSeason();
    if (season) {
      const currentWeek = await getCurrentWeek();
      await data.updateGlobalSeason({ currentWeek });
    }
  } catch (err) {
    console.error('Error initializing season:', err);
  }
})();

// Twilio removed — SMS paths have been removed in favor of email notifications.

// Notification system removed (email/SMS).

app.post('/submit', async (req, res) => {
  const { title, description, category, posterUrl, userId, groupId } = req.body || {};
  if (!title || !description) return res.status(400).json({ ok: false, error: 'missing fields (require title and description)' });
  
  // Validate category against group settings if groupId is provided
  if (groupId) {
    const group = await data.getGroupById(groupId);
    if (group && group.settings && group.settings.categories) {
      if (!category || !group.settings.categories.includes(category)) {
        return res.status(400).json({ ok: false, error: `category must be one of: ${group.settings.categories.join(', ')}` });
      }
      
      // No per-user submission limit; users submit one per category instead.
      
      // Use group season
      if (!group.season) {
        group.season = {
          number: 1,
          startDate: new Date().toISOString(),
          currentWeek: 1,
          endDate: null
        };
        await data.updateGroup(groupId, { season: group.season });
      }
      
      const seasonNumber = group.season.number;
      
      // Prevent duplicate titles in the same club/season
      const normalizedTitle = normalizeTitle(title);
      const existingSubmissions = await data.submissions({ groupId, seasonNumber });
      const existingSubmission = existingSubmissions.find(s =>
        normalizeTitle(s.title) === normalizedTitle
      );
      if (existingSubmission) {
        return res.status(400).json({ ok: false, error: 'This movie has already been submitted.' });
      }

      const pastSubmissions = await data.submissionArchive({ groupId, titleKey: normalizedTitle });
      const pastSubmission = pastSubmissions.find(entry => entry.seasonNumber < seasonNumber);
      if (pastSubmission) {
        return res.status(400).json({ ok: false, error: 'This movie was submitted in a previous season.' });
      }

      // Track user submission for this group's season
      const seasonKey = `season_${seasonNumber}_${groupId}_${userId || 'anonymous'}`;
      let userSubmissions = await data.getUserSubmissions(seasonKey);
      if (userSubmissions.some(s => s.category === category)) {
        return res.status(400).json({ ok: false, error: 'You can only submit one movie per category.' });
      }
      if (userSubmissions.length >= group.settings.categories.length) {
        return res.status(400).json({ ok: false, error: 'You have already submitted for all categories.' });
      }
      userSubmissions.push({ category, title, submittedAt: new Date().toISOString() });
      await data.setUserSubmissions(seasonKey, userSubmissions);
      
      const item = { id: Date.now().toString(36), title, description, category, posterUrl: posterUrl || null, userId: userId || null, groupId: groupId || null, submittedAt: new Date().toISOString(), seasonNumber };
      await data.createSubmission(item);
      
      const archiveEntries = await data.submissionArchive({ groupId, titleKey: normalizedTitle, seasonNumber });
      if (archiveEntries.length === 0) {
        await data.createSubmissionArchive({
          id: Date.now().toString(36),
          title: title,
          titleKey: normalizedTitle,
          groupId: groupId || null,
          seasonNumber,
          submittedAt: new Date().toISOString()
        });
      }
      return res.json({ ok: true, item });
    }
  }
  
  // Fallback to global season (backwards compatibility)
  await checkAndResetSeason();
  const globalSeason = await data.getGlobalSeason();
  if (!category || (category !== 'top-pick' && category !== 'wild-card')) {
    return res.status(400).json({ ok: false, error: 'category must be "top-pick" or "wild-card"' });
  }
  
  // Prevent duplicate titles in the same season (global)
  const normalizedTitle = normalizeTitle(title);
  const existingSubmissions = await data.submissions({ groupId: null, seasonNumber: globalSeason.number });
  const existingSubmission = existingSubmissions.find(s =>
    normalizeTitle(s.title) === normalizedTitle
  );
  if (existingSubmission) {
    return res.status(400).json({ ok: false, error: 'This movie has already been submitted.' });
  }

  const pastSubmissions = await data.submissionArchive({ groupId: null, titleKey: normalizedTitle });
  const pastSubmission = pastSubmissions.find(entry => entry.seasonNumber < globalSeason.number);
  if (pastSubmission) {
    return res.status(400).json({ ok: false, error: 'This movie was submitted in a previous season.' });
  }

  // Track user submission for this season
  const seasonKey = `season_${globalSeason.number}_${userId || 'anonymous'}`;
  let userSubmissions = await data.getUserSubmissions(seasonKey);
  if (userSubmissions.some(s => s.category === category)) {
    return res.status(400).json({ ok: false, error: 'You can only submit one movie per category.' });
  }
  if (userSubmissions.length >= 2) {
    return res.status(400).json({ ok: false, error: 'You have already submitted for all categories.' });
  }
  userSubmissions.push({ category, title, submittedAt: new Date().toISOString() });
  await data.setUserSubmissions(seasonKey, userSubmissions);
  
  const item = { id: Date.now().toString(36), title, description, category, posterUrl: posterUrl || null, userId: userId || null, groupId: groupId || null, submittedAt: new Date().toISOString(), seasonNumber: globalSeason.number };
  await data.createSubmission(item);
  
  const archiveEntries = await data.submissionArchive({ groupId: null, titleKey: normalizedTitle, seasonNumber: globalSeason.number });
  if (archiveEntries.length === 0) {
    await data.createSubmissionArchive({
      id: Date.now().toString(36),
      title: title,
      titleKey: normalizedTitle,
      groupId: null,
      seasonNumber: globalSeason.number,
      submittedAt: new Date().toISOString()
    });
  }
  res.json({ ok: true, item });
});

app.get('/submissions', async (req, res) => {
  try {
    const submissions = await data.submissions();
    
    // If server has OMDb API key, try to enrich submissions missing posterUrl
    const omdbKey = process.env.OMDB_API_KEY;
    if (omdbKey) {
      for (const item of submissions) {
        if (!item.posterUrl) {
          try {
            const url = `https://www.omdbapi.com/?t=${encodeURIComponent(item.title)}&apikey=${omdbKey}`;
            const resp = await fetch(url);
            const omdbData = await resp.json();
            if (omdbData && omdbData.Poster && omdbData.Poster !== 'N/A') {
              await data.updateSubmission(item.id, { posterUrl: omdbData.Poster });
              item.posterUrl = omdbData.Poster;
            }
          } catch (err) {
            console.error('Error enriching poster for', item.title, err);
          }
        }
      }
    }
    
    res.json(submissions);
  } catch (err) {
    console.error('Error fetching submissions:', err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

async function getSeasonWinnerTitles({ groupId = null, seasonNumber = null }) {
  const titles = new Set();
  const history = await data.history({ groupId, seasonNumber });
  history.forEach((entry) => {
    const winners = Array.isArray(entry.winners) && entry.winners.length
      ? entry.winners
      : entry.winner
        ? [entry.winner]
        : [];
    winners.forEach((winner) => {
      titles.add(normalizeTitle(winner.title));
    });
  });
  return titles;
}

async function pickWinnersByCategory({ groupId = null } = {}) {
  let categories = ['top-pick', 'wild-card'];
  let seasonNumber = 1;
  let relevantSubmissions = [];
  let groupSubmissionCount = 0;

  if (groupId) {
    const group = await data.getGroupById(groupId);
    if (!group) return null;
    categories = group.settings?.categories?.length ? group.settings.categories : categories;
    seasonNumber = group.season?.number || 1;
    relevantSubmissions = await data.submissions({ groupId, seasonNumber });
    groupSubmissionCount = relevantSubmissions.length;
  } else {
    const globalSeason = await data.getGlobalSeason();
    seasonNumber = globalSeason.number;
    relevantSubmissions = await data.submissions({ groupId: null, seasonNumber });
    groupSubmissionCount = relevantSubmissions.length;
  }

  if (groupSubmissionCount === 0) return null;

  const seasonWinnerTitles = await getSeasonWinnerTitles({ groupId, seasonNumber });
  const chosenTitles = new Set();
  const winners = [];
  const skippedCategories = [];

  categories.forEach((category) => {
    const eligible = relevantSubmissions.filter((submission) => {
      if (submission.category !== category) return false;
      const normalized = normalizeTitle(submission.title);
      if (seasonWinnerTitles.has(normalized)) return false;
      if (chosenTitles.has(normalized)) return false;
      return true;
    });

    if (!eligible.length) {
      skippedCategories.push(category);
      return;
    }

    const winner = eligible[Math.floor(Math.random() * eligible.length)];
    const submitter = await data.getUserById(winner.userId);
    const winnerClone = Object.assign({}, winner, {
      submittedBy: submitter?.name || submitter?.username || 'Unknown'
    });
    winners.push(winnerClone);
    chosenTitles.add(normalizeTitle(winner.title));
  });

  if (!winners.length) return null;

  const entry = {
    id: Date.now().toString(36),
    winners,
    winner: winners[0] || null,
    pickedAt: new Date().toISOString(),
    submissionsCount: groupSubmissionCount,
    groupId: groupId || null,
    seasonNumber
  };

  await data.createHistoryEntry(entry);
  return { winners, entry, skippedCategories };
}

app.post('/pick-weekly', async (req, res) => {
  const { groupId } = req.body || {};
  const result = await pickWinnersByCategory({ groupId: groupId || null });
  if (!result) return res.json({ ok: false, message: 'No submissions available to pick' });
  const winnerTitles = result.winners.map(w => w.title).filter(Boolean).join(', ');
  const skipped = result.skippedCategories.length
    ? ` Skipped: ${result.skippedCategories.join(', ')}.`
    : '';
  res.json({
    ok: true,
    winners: result.winners,
    historyEntry: result.entry,
    message: winnerTitles ? `Picked ${winnerTitles}.${skipped}` : `Picked winners.${skipped}`
  });
});

// Preview email for next/random pick without sending
// Notification endpoints removed.

// OMDb proxy: fetch poster info server-side so front-end doesn't need to expose API key
app.get('/omdb', async (req, res) => {
  const title = req.query.title;
  const key = process.env.OMDB_API_KEY;
  if (!title) return res.status(400).json({ ok: false, error: 'missing title' });
  if (!key) return res.json({ ok: false, error: 'OMDB API key not configured on server' });
  try {
    const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${key}`;
    const resp = await fetch(url);
    const data = await resp.json();
    return res.json(data);
  } catch (err) {
    console.error('OMDb proxy error', err);
    return res.status(500).json({ ok: false, error: 'OMDb fetch failed' });
  }
});

// History endpoint
app.get('/history', async (req, res) => {
  try {
    const history = await data.history();
    res.json(history);
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ===== USER & GROUP ENDPOINTS =====
app.post('/signup', async (req, res) => {
  const { username, password, securityQuestion, securityAnswer, genres } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'missing username or password' });
  }
  if (!securityQuestion || !securityAnswer) {
    return res.status(400).json({ ok: false, error: 'missing security question or answer' });
  }
  const normalizedUsername = String(username).trim();
  if (!normalizedUsername) {
    return res.status(400).json({ ok: false, error: 'invalid username' });
  }
  try {
    const existing = await data.getUserByUsername(normalizedUsername);
    if (existing) {
      return res.status(409).json({ ok: false, error: 'username already exists' });
    }
    const userId = Date.now().toString(36);
    const user = await data.createUser({
      id: userId,
      username: normalizedUsername,
      name: normalizedUsername,
      password,
      securityQuestion: String(securityQuestion).trim(),
      securityAnswer: String(securityAnswer).trim().toLowerCase(),
      genres: genres || [],
      createdAt: new Date().toISOString(),
      groupId: null
    });
    // Convert database format to API format
    const apiUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      password: user.password,
      securityQuestion: user.security_question,
      securityAnswer: user.security_answer,
      genres: user.genres,
      createdAt: user.created_at,
      groupId: user.group_id
    };
    res.json({ ok: true, user: apiUser });
  } catch (err) {
    console.error('Signup error:', err);
    if (err.code === '23505') { // Unique constraint violation
      return res.status(409).json({ ok: false, error: 'username already exists' });
    }
    res.status(500).json({ ok: false, error: 'Failed to create user' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'missing username or password' });
  }
  const normalizedUsername = String(username).trim();
  try {
    const user = await data.getUserByUsername(normalizedUsername);
    if (!user || user.password !== password) {
      return res.status(401).json({ ok: false, error: 'invalid username or password' });
    }
    // Convert database format to API format
    const apiUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      password: user.password,
      securityQuestion: user.security_question,
      securityAnswer: user.security_answer,
      genres: user.genres,
      createdAt: user.created_at,
      groupId: user.group_id
    };
    res.json({ ok: true, user: apiUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ ok: false, error: 'Failed to login' });
  }
});

app.post('/recover-password', async (req, res) => {
  const { username, securityQuestion, securityAnswer, password } = req.body || {};
  if (!username || !securityQuestion || !securityAnswer || !password) {
    return res.status(400).json({ ok: false, error: 'missing required fields' });
  }
  const normalizedUsername = String(username).trim();
  try {
    const user = await data.getUserByUsername(normalizedUsername);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'user not found' });
    }
    const normalizedAnswer = String(securityAnswer).trim().toLowerCase();
    if (user.security_question !== securityQuestion || user.security_answer !== normalizedAnswer) {
      return res.status(401).json({ ok: false, error: 'security answer does not match' });
    }
    await data.updateUser(user.id, { password });
    res.json({ ok: true });
  } catch (err) {
    console.error('Recover password error:', err);
    res.status(500).json({ ok: false, error: 'Failed to recover password' });
  }
});

app.get('/user/:id', async (req, res) => {
  try {
    const user = await data.getUserById(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });
    const apiUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      password: user.password,
      securityQuestion: user.security_question,
      securityAnswer: user.security_answer,
      genres: user.genres,
      createdAt: user.created_at,
      groupId: user.group_id
    };
    res.json(apiUser);
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ ok: false, error: 'Failed to get user' });
  }
});

app.get('/user/:id/clubs', async (req, res) => {
  const userId = req.params.id;
  try {
    const user = await data.getUserById(userId);
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });
    const allGroups = await data.groups();
    const clubs = allGroups
      .filter(group => Array.isArray(group.members) && group.members.includes(userId))
      .map(group => {
        const admins = group.admins || [group.creator_id];
        return {
          id: group.id,
          name: group.name,
          code: group.code,
          creatorId: group.creator_id,
          membersCount: group.members ? group.members.length : 0,
          isAdmin: admins.includes(userId),
          settings: group.settings || null,
          members: group.members || []
        };
      });
    res.json({ ok: true, clubs });
  } catch (err) {
    console.error('Get user clubs error:', err);
    res.status(500).json({ ok: false, error: 'Failed to get user clubs' });
  }
});

app.post('/create-group', async (req, res) => {
  const { name, creatorId, seasonLength, submissionsPerUser, categories } = req.body || {};
  if (!name || !creatorId) return res.status(400).json({ ok: false, error: 'missing name or creatorId' });
  
  // Validate and set defaults for settings
  const validSeasonLength = seasonLength && seasonLength >= 4 && seasonLength <= 52 ? seasonLength : 14;
  const validSubmissionsPerUser = submissionsPerUser && submissionsPerUser >= 1 && submissionsPerUser <= 20 ? submissionsPerUser : 7;
  const validCategories = categories && Array.isArray(categories) && categories.length > 0 ? categories : ['top-pick', 'wild-card'];
  
  const groupId = Date.now().toString(36);
  const groupCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  try {
    const group = await data.createGroup({
      id: groupId,
      name,
      creatorId,
      code: groupCode,
      members: [creatorId],
      createdAt: new Date().toISOString(),
      settings: {
        seasonLength: validSeasonLength,
        submissionsPerUser: validSubmissionsPerUser,
        categories: validCategories
      }
    });
    // Update creator's groupId
    await data.updateUser(creatorId, { groupId });
    
    // Convert to API format
    const apiGroup = {
      id: group.id,
      name: group.name,
      creatorId: group.creator_id,
      code: group.code,
      members: group.members,
      createdAt: group.created_at,
      settings: group.settings,
      season: group.season,
      admins: group.admins || [group.creator_id]
    };
    res.json({ ok: true, group: apiGroup });
  } catch (err) {
    console.error('Create group error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Group code already exists' });
    }
    res.status(500).json({ ok: false, error: 'Failed to create group' });
  }
});

app.post('/join-group', async (req, res) => {
  const { userId, groupCode } = req.body || {};
  if (!userId || !groupCode) return res.status(400).json({ ok: false, error: 'missing userId or groupCode' });
  try {
    const group = await data.getGroupByCode(groupCode);
    if (!group) return res.status(404).json({ ok: false, error: 'group not found' });
    const user = await data.getUserById(userId);
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });
    if (group.members.includes(userId)) return res.status(400).json({ ok: false, error: 'already a member' });
    
    group.members.push(userId);
    await data.updateGroup(group.id, { members: group.members });
    await data.updateUser(userId, { groupId: group.id });
    
    // Convert to API format
    const apiGroup = {
      id: group.id,
      name: group.name,
      creatorId: group.creator_id,
      code: group.code,
      members: group.members,
      createdAt: group.created_at,
      settings: group.settings,
      season: group.season
    };
    res.json({ ok: true, group: apiGroup });
  } catch (err) {
    console.error('Join group error:', err);
    res.status(500).json({ ok: false, error: 'Failed to join group' });
  }
});

app.put('/group/:id/settings', async (req, res) => {
  const { id } = req.params;
  const { name, seasonLength, submissionsPerUser, categories, userId } = req.body || {};
  try {
    const group = await data.getGroupById(id);
    if (!group) return res.status(404).json({ ok: false, error: 'group not found' });

    const admins = group.admins || [group.creator_id];
    if (!userId || !admins.includes(userId)) {
      return res.status(403).json({ ok: false, error: 'only the club admin can edit settings' });
    }

    const trimmedName = String(name || '').trim();
    const validSeasonLength = seasonLength && seasonLength >= 4 && seasonLength <= 52 ? seasonLength : null;
    const validSubmissionsPerUser = submissionsPerUser && submissionsPerUser >= 1 && submissionsPerUser <= 20 ? submissionsPerUser : null;
    const validCategories = Array.isArray(categories) && categories.length > 0 ? categories : null;

    if (!trimmedName || !validSeasonLength || !validSubmissionsPerUser || !validCategories) {
      return res.status(400).json({ ok: false, error: 'invalid settings' });
    }

    const updatedGroup = await data.updateGroup(id, {
      name: trimmedName,
      settings: {
        seasonLength: validSeasonLength,
        submissionsPerUser: validSubmissionsPerUser,
        categories: validCategories
      }
    });
    
    const apiGroup = {
      id: updatedGroup.id,
      name: updatedGroup.name,
      creatorId: updatedGroup.creator_id,
      code: updatedGroup.code,
      members: updatedGroup.members,
      admins: updatedGroup.admins,
      settings: updatedGroup.settings,
      season: updatedGroup.season,
      createdAt: updatedGroup.created_at
    };
    
    res.json({ ok: true, group: apiGroup });
  } catch (err) {
    console.error('Update group settings error:', err);
    res.status(500).json({ ok: false, error: 'Failed to update group settings' });
  }
});

app.post('/group/:id/season/start', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body || {};
  try {
    const group = await data.getGroupById(id);
    if (!group) return res.status(404).json({ ok: false, error: 'group not found' });

    const admins = group.admins || [group.creator_id];
    if (!userId || !admins.includes(userId)) {
      return res.status(403).json({ ok: false, error: 'only admins can start a new season' });
    }

    if (!group.season) {
      group.season = {
        number: 1,
        startDate: new Date().toISOString(),
        currentWeek: 1,
        endDate: null
      };
    }

    const groupSeasonLength = group.settings?.seasonLength || SEASON_WEEKS;
    const startDate = new Date(group.season.startDate);
    const now = new Date();
    const weeksSinceStart = Math.floor((now - startDate) / WEEK_MS);
    const rawWeek = weeksSinceStart + 1;
    const hasEnded = rawWeek > groupSeasonLength || Boolean(group.season.endDate);

    if (!hasEnded) {
      return res.status(400).json({ ok: false, error: 'current season is still active' });
    }

    if (!group.seasons) group.seasons = [];
    if (!group.season.endDate) {
      group.season.endDate = new Date().toISOString();
    }
    group.seasons.push({ ...group.season });

    const newSeason = {
      number: (group.season.number || 1) + 1,
      startDate: new Date().toISOString(),
      currentWeek: 1,
      endDate: null
    };

    // Clear submissions for this group
    await data.deleteSubmissions({ groupId: id });

    // Clear group user submission tracking
    await data.deleteUserSubmissionsByGroup(id);

    // Update group with new season
    await data.updateGroup(id, {
      seasons: group.seasons,
      season: newSeason
    });

    res.json({ ok: true, season: newSeason });
  } catch (err) {
    console.error('Start season error:', err);
    res.status(500).json({ ok: false, error: 'Failed to start new season' });
  }
});

app.get('/group/:id', async (req, res) => {
  try {
    const group = await data.getGroupById(req.params.id);
    if (!group) return res.status(404).json({ ok: false, error: 'group not found' });
    
    // Populate members details
    const memberPromises = (group.members || []).map(id => data.getUserById(id));
    const members = (await Promise.all(memberPromises)).filter(u => u);
    
    const apiGroup = {
      id: group.id,
      name: group.name,
      creatorId: group.creator_id,
      code: group.code,
      members: group.members,
      admins: group.admins || [group.creator_id],
      settings: group.settings,
      season: group.season,
      seasons: group.seasons,
      createdAt: group.created_at,
      memberDetails: members.map(user => ({
        id: user.id,
        username: user.username,
        name: user.name,
        genres: user.genres,
        createdAt: user.created_at
      }))
    };
    
    res.json(apiGroup);
  } catch (err) {
    console.error('Get group error:', err);
    res.status(500).json({ ok: false, error: 'Failed to get group' });
  }
});

app.post('/group/:id/admins', async (req, res) => {
  const { id } = req.params;
  const { userId, adminId } = req.body || {};
  try {
    const group = await data.getGroupById(id);
    if (!group) return res.status(404).json({ ok: false, error: 'group not found' });

    const admins = group.admins || [group.creator_id];
    if (!userId || !admins.includes(userId)) {
      return res.status(403).json({ ok: false, error: 'only admins can add admins' });
    }
    if (!adminId) {
      return res.status(400).json({ ok: false, error: 'missing adminId' });
    }
    if (!group.members.includes(adminId)) {
      return res.status(400).json({ ok: false, error: 'user must be a member of the club' });
    }
    if (!admins.includes(adminId)) {
      admins.push(adminId);
    }
    
    await data.updateGroup(id, { admins });
    res.json({ ok: true, admins });
  } catch (err) {
    console.error('Add admin error:', err);
    res.status(500).json({ ok: false, error: 'Failed to add admin' });
  }
});

app.post('/group/:id/delete', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body || {};
  try {
    const group = await data.getGroupById(id);
    if (!group) return res.status(404).json({ ok: false, error: 'group not found' });

    const admins = group.admins || [group.creator_id];
    if (!userId || !admins.includes(userId)) {
      return res.status(403).json({ ok: false, error: 'only admins can delete the club' });
    }

    // Remove group (deleted via data.deleteGroup below)

    // Clear group membership on users
    const allUsers = await data.users();
    for (const user of allUsers) {
      if (user.group_id === id) {
        await data.updateUser(user.id, { groupId: null });
      }
    }

    // Remove group submissions and history
    await data.deleteSubmissions({ groupId: id });
    await data.deleteHistory({ groupId: id });

    // Remove group reviews and watched entries
    await data.deleteReviews({ groupId: id });
    await data.deleteWatched({ groupId: id });

    // Remove group user submission tracking
    await data.deleteUserSubmissionsByGroup(id);
    
    // Delete the group
    await data.deleteGroup(id);

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ ok: false, error: 'Failed to delete group' });
  }
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ ok: false, error: 'Failed to delete group' });
  }
});

app.post('/reset', async (req, res) => {
  try {
    await data.deleteSubmissions();
    // Note: user_submissions are tracked per season, so we don't need to clear all
    res.json({ ok: true, message: 'All submissions cleared' });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ ok: false, error: 'Failed to reset submissions' });
  }
});

app.post('/group/:id/reset-user', async (req, res) => {
  const { id } = req.params;
  const { userId, targetUserId } = req.body || {};
  try {
    const group = await data.getGroupById(id);
    if (!group) return res.status(404).json({ ok: false, error: 'group not found' });

    const admins = group.admins || [group.creator_id];
    if (!userId || !admins.includes(userId)) {
      return res.status(403).json({ ok: false, error: 'only admins can reset user submissions' });
    }
    if (!targetUserId) {
      return res.status(400).json({ ok: false, error: 'missing targetUserId' });
    }
    const seasonNumber = group?.season?.number || 1;
    const seasonKey = `season_${seasonNumber}_${id}_${targetUserId}`;
    await data.setUserSubmissions(seasonKey, []);
    res.json({ ok: true });
  } catch (err) {
    console.error('Reset user error:', err);
    res.status(500).json({ ok: false, error: 'Failed to reset user submissions' });
  }
});

// ===== REVIEWS & WATCHED STATUS =====
app.post('/mark-watched', async (req, res) => {
  const { userId, movieTitle, groupId } = req.body || {};
  if (!userId || !movieTitle) return res.status(400).json({ ok: false, error: 'missing userId or movieTitle' });
  
  try {
    const watchedId = `${userId}_${movieTitle}_${groupId || 'global'}`;
    const existingWatched = await data.watched({ userId });
    const existing = existingWatched.find(w => w.id === watchedId);
    
    if (existing) {
      // Already marked as watched
      res.json({ ok: true, watched: existing });
    } else {
      const watched = {
        id: watchedId,
        userId,
        movieTitle,
        groupId: groupId || null,
        watchedAt: new Date().toISOString()
      };
      await data.createWatched(watched);
      res.json({ ok: true, watched });
    }
  } catch (err) {
    console.error('Mark watched error:', err);
    res.status(500).json({ ok: false, error: 'Failed to mark as watched' });
  }
});

app.get('/watched/:userId', async (req, res) => {
  const { userId } = req.params;
  const { groupId } = req.query;
  try {
    let watched = await data.watched({ userId });
    if (groupId) {
      watched = watched.filter(w => !w.groupId || w.groupId === groupId);
    }
    res.json(watched);
  } catch (err) {
    console.error('Get watched error:', err);
    res.status(500).json({ ok: false, error: 'Failed to get watched movies' });
  }
});

app.post('/review', async (req, res) => {
  const { userId, movieTitle, rating, review, groupId } = req.body || {};
  if (!userId || !movieTitle || !review) {
    return res.status(400).json({ ok: false, error: 'missing required fields (userId, movieTitle, review)' });
  }
  
  try {
    const reviewId = Date.now().toString(36);
    const reviewObj = await data.createReview({
      id: reviewId,
      userId,
      movieTitle,
      rating: rating || null,
      review: review.trim(),
      groupId: groupId || null,
      createdAt: new Date().toISOString()
    });
    
    // Get user info for the response
    const user = await data.getUserById(userId);
    res.json({ ok: true, review: { ...reviewObj, userName: user?.name || user?.username || 'Unknown' } });
  } catch (err) {
    console.error('Create review error:', err);
    res.status(500).json({ ok: false, error: 'Failed to create review' });
  }
});

app.get('/reviews', async (req, res) => {
  const { movieTitle, groupId } = req.query;
  try {
    let reviews = await data.reviews({ movieTitle, groupId });
    
    // Sort by newest first
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Populate user names
    const userPromises = reviews.map(r => data.getUserById(r.userId));
    const users = await Promise.all(userPromises);
    const reviewsWithUsers = reviews.map((r, i) => ({
      ...r,
      userName: users[i]?.name || users[i]?.username || 'Unknown'
    }));
    
    res.json(reviewsWithUsers);
  } catch (err) {
    console.error('Get reviews error:', err);
    res.status(500).json({ ok: false, error: 'Failed to get reviews' });
  }
});

app.get('/reviews/weekly', async (req, res) => {
  try {
    // Get reviews for the current week's winner
    const history = await data.history();
    const latestWinner = history[0];
    if (!latestWinner || !latestWinner.winner) {
      return res.json([]);
    }
    
    const movieTitle = latestWinner.winner.title;
    const { groupId } = req.query;
    
    let reviews = await data.reviews({ movieTitle, groupId });
    
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Populate user names
    const userPromises = reviews.map(r => data.getUserById(r.userId));
    const users = await Promise.all(userPromises);
    const reviewsWithUsers = reviews.map((r, i) => ({
      ...r,
      userName: users[i]?.name || users[i]?.username || 'Unknown'
    }));
    
    res.json(reviewsWithUsers);
  } catch (err) {
    console.error('Get weekly reviews error:', err);
    res.status(500).json({ ok: false, error: 'Failed to get weekly reviews' });
  }
});

// Schedule weekly picks. For dev/testing you can set PICK_INTERVAL_MS to a smaller value.
const PICK_INTERVAL_MS = process.env.PICK_INTERVAL_MS ? Number(process.env.PICK_INTERVAL_MS) : 7 * 24 * 60 * 60 * 1000;
setInterval(async () => {
  console.log('Running scheduled weekly pick...');
  try {
    await pickWinnersByCategory();
  } catch (err) {
    console.error('Scheduled pick error:', err);
  }
}, PICK_INTERVAL_MS);

// Season status endpoint - supports groupId parameter for per-group seasons
app.get('/season', async (req, res) => {
  const { groupId } = req.query;
  
  try {
    // If groupId is provided, use group-specific season settings
    if (groupId) {
      const group = await data.getGroupById(groupId);
      if (group && group.settings) {
        // Initialize group season if it doesn't exist
        if (!group.season) {
          const newSeason = {
            number: 1,
            startDate: new Date().toISOString(),
            currentWeek: 1,
            endDate: null
          };
          await data.updateGroup(groupId, { season: newSeason });
          group.season = newSeason;
        }
        
        const groupSeasonLength = group.settings.seasonLength || SEASON_WEEKS;
        const startDate = new Date(group.season.startDate);
        const now = new Date();
        const weeksSinceStart = Math.floor((now - startDate) / WEEK_MS);
        const rawWeek = weeksSinceStart + 1;
        const currentWeek = Math.min(rawWeek, groupSeasonLength);
        const hasEnded = rawWeek > groupSeasonLength || Boolean(group.season.endDate);
        
        // Update current week
        const updatedSeason = { ...group.season, currentWeek };
        
        // Mark season ended but do not auto-start a new one
        if (rawWeek > groupSeasonLength && !group.season.endDate) {
          updatedSeason.endDate = new Date().toISOString();
          const seasons = group.seasons || [];
          seasons.push({ ...updatedSeason });
          await data.updateGroup(groupId, { season: updatedSeason, seasons });
        } else {
          await data.updateGroup(groupId, { season: updatedSeason });
        }
        
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + (groupSeasonLength * 7));
        
        return res.json({
          seasonNumber: updatedSeason.number,
          currentWeek,
          totalWeeks: groupSeasonLength,
          startDate: updatedSeason.startDate,
          endDate: endDate.toISOString(),
          weeksRemaining: Math.max(0, groupSeasonLength - currentWeek),
          isActive: !hasEnded
        });
      }
    }
    
    // Default global season (for backwards compatibility)
    await checkAndResetSeason();
    const globalSeason = await data.getGlobalSeason();
    const currentWeek = await getCurrentWeek();
    await data.updateGlobalSeason({ currentWeek });
    
    const startDate = new Date(globalSeason.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (SEASON_WEEKS * 7));
    
    res.json({
      seasonNumber: globalSeason.number,
      currentWeek,
      totalWeeks: SEASON_WEEKS,
      startDate: globalSeason.startDate,
      endDate: endDate.toISOString(),
      weeksRemaining: Math.max(0, SEASON_WEEKS - currentWeek),
      isActive: currentWeek <= SEASON_WEEKS
    });
  } catch (err) {
    console.error('Get season error:', err);
    res.status(500).json({ ok: false, error: 'Failed to get season info' });
  }
});

// Check if user has submitted for current season
app.get('/season/user-status/:userId', async (req, res) => {
  const { userId } = req.params;
  const { groupId } = req.query;
  try {
    await checkAndResetSeason();
    
    let seasonKey;
    if (groupId) {
      const group = await data.getGroupById(groupId);
      const seasonNumber = group?.season?.number || 1;
      seasonKey = `season_${seasonNumber}_${groupId}_${userId}`;
    } else {
      const globalSeason = await data.getGlobalSeason();
      seasonKey = `season_${globalSeason.number}_${userId}`;
    }
    
    const userSubmissions = await data.getUserSubmissions(seasonKey);
    
    const hasTopPick = userSubmissions.some(s => s.category === 'top-pick');
    const hasWildCard = userSubmissions.some(s => s.category === 'wild-card');
    
    res.json({
      hasSubmissions: userSubmissions.length > 0,
      hasTopPick,
      hasWildCard,
      submissions: userSubmissions
    });
  } catch (err) {
    console.error('Get user status error:', err);
    res.status(500).json({ ok: false, error: 'Failed to get user status' });
  }
});

// Get submission summary by user for admin view
app.get('/group/:id/submissions-summary', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query; // Admin userId for authorization
  try {
    const group = await data.getGroupById(id);
    if (!group) return res.status(404).json({ ok: false, error: 'group not found' });

    const admins = group.admins || [group.creator_id];
    if (!userId || !admins.includes(userId)) {
      return res.status(403).json({ ok: false, error: 'only admins can view submission summary' });
    }

    const seasonNumber = group?.season?.number || 1;
    const members = group.members || [];
    
    // Get all submissions for this group and season
    const groupSubmissions = await data.submissions({ groupId: id, seasonNumber });

    // Group submissions by user
    const userPromises = members.map(memberId => data.getUserById(memberId));
    const users = await Promise.all(userPromises);
    
    const userSummaries = members.map((memberId, index) => {
      const user = users[index];
      const userSubs = groupSubmissions.filter(s => s.userId === memberId);
      
      // Organize by category
      const byCategory = {};
      userSubs.forEach(sub => {
        if (!byCategory[sub.category]) {
          byCategory[sub.category] = [];
        }
        byCategory[sub.category].push({
          title: sub.title,
          description: sub.description,
          posterUrl: sub.posterUrl,
          submittedAt: sub.submittedAt
        });
      });

      return {
        userId: memberId,
        username: user?.username || user?.name || 'Unknown',
        isAdmin: admins.includes(memberId),
        submissionCount: userSubs.length,
        submissionsByCategory: byCategory,
        categories: Object.keys(byCategory)
      };
    });

    // Sort by submission count (descending), then by username
    userSummaries.sort((a, b) => {
      if (b.submissionCount !== a.submissionCount) {
        return b.submissionCount - a.submissionCount;
      }
      return (a.username || '').localeCompare(b.username || '');
    });

    res.json({ ok: true, summaries: userSummaries, totalSubmissions: groupSubmissions.length });
  } catch (err) {
    console.error('Get submissions summary error:', err);
    res.status(500).json({ ok: false, error: 'Failed to get submissions summary' });
  }
});

const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, async () => {
  console.log(`Server listening on ${HOST}:${PORT}`);
  try {
    const globalSeason = await data.getGlobalSeason();
    console.log(`Current season: ${globalSeason.number}, Week: ${globalSeason.currentWeek}/${SEASON_WEEKS}`);
  } catch (err) {
    console.log('Note: Could not load season info (this is normal on first start)');
  }
});
