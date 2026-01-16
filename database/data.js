// Unified data access layer - uses PostgreSQL if available, falls back to JSON file
const fs = require('fs');
const path = require('path');

let useDatabase = false;
let dbQueries = null;

// Try to use database if DATABASE_URL is set
// Note: initializeDatabase() must be called before using the database
// This is done asynchronously and won't block server startup
if (process.env.DATABASE_URL) {
  try {
    const { initializeDatabase } = require('./db');
    dbQueries = require('./queries');
    useDatabase = true;
    console.log('🗄️  Using PostgreSQL database');
    
    // Initialize schema on startup (fire-and-forget, errors won't crash server)
    initializeDatabase().catch(err => {
      console.error('Warning: Database initialization failed:', err.message);
      // Don't disable useDatabase here - let individual queries handle errors
      // The database might still work even if initialization has warnings
    });
  } catch (error) {
    console.warn('⚠️  Database not available, using JSON file:', error.message);
    useDatabase = false;
  }
} else {
  console.log('📄 Using JSON file storage (set DATABASE_URL to use PostgreSQL)');
}

// JSON file fallback
const DATA_FILE = path.join(__dirname, '..', 'submissions.json');

function loadJSON() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading JSON file:', e);
  }
  return { submissions: [], history: [], users: [], groups: [], reviews: [], watched: [], submissionArchive: [], userSubmissions: {} };
}

function saveJSON(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error saving JSON file:', e);
  }
}

// Unified API
const data = {
  async users() {
    if (useDatabase && dbQueries) {
      try {
        return await dbQueries.getAllUsers();
      } catch (err) {
        console.error('Database query failed, falling back to JSON:', err.message);
        // Fall through to JSON fallback
      }
    }
    const json = loadJSON();
    return json.users || [];
  },
  
  async getUserById(id) {
    if (useDatabase && dbQueries) {
      try {
        return await dbQueries.getUserById(id);
      } catch (err) {
        console.error('Database query failed, falling back to JSON:', err.message);
        // Fall through to JSON fallback
      }
    }
    const json = loadJSON();
    return json.users?.find(u => u.id === id);
  },
  
  async getUserByUsername(username) {
    if (useDatabase && dbQueries) {
      try {
        return await dbQueries.getUserByUsername(username);
      } catch (err) {
        console.error('Database query failed, falling back to JSON:', err.message);
        // Fall through to JSON fallback
      }
    }
    const json = loadJSON();
    return json.users?.find(u => (u.username || '').toLowerCase() === username.toLowerCase());
  },
  
  async createUser(user) {
    if (useDatabase && dbQueries) {
      return await dbQueries.createUser(user);
    }
    const json = loadJSON();
    if (!json.users) json.users = [];
    json.users.push(user);
    saveJSON(json);
    return user;
  },
  
  async updateUser(userId, updates) {
    if (useDatabase && dbQueries) {
      return await dbQueries.updateUser(userId, updates);
    }
    const json = loadJSON();
    const user = json.users?.find(u => u.id === userId);
    if (user) {
      Object.assign(user, updates);
      saveJSON(json);
    }
    return user;
  },
  
  async groups() {
    if (useDatabase && dbQueries) {
      try {
        return await dbQueries.getAllGroups();
      } catch (err) {
        console.error('Database query failed, falling back to JSON:', err.message);
        // Fall through to JSON fallback
      }
    }
    const json = loadJSON();
    return json.groups || [];
  },
  
  async getGroupById(id) {
    if (useDatabase && dbQueries) {
      try {
        return await dbQueries.getGroupById(id);
      } catch (err) {
        console.error('Database query failed, falling back to JSON:', err.message);
        // Fall through to JSON fallback
      }
    }
    const json = loadJSON();
    return json.groups?.find(g => g.id === id);
  },
  
  async getGroupByCode(code) {
    // Normalize code to uppercase for consistent matching
    const normalizedCode = String(code).trim().toUpperCase();
    if (useDatabase && dbQueries) {
      try {
        const group = await dbQueries.getGroupByCode(normalizedCode);
        // If group found in database, return it (even if null)
        // Only fall through to JSON if there was an actual error
        if (group !== null) return group;
        // If group is null (not found), still check JSON as fallback
      } catch (err) {
        console.error('Database query failed for getGroupByCode, falling back to JSON:', err.message);
        // Fall through to JSON fallback on error
      }
    }
    const json = loadJSON();
    return json.groups?.find(g => String(g.code || '').trim().toUpperCase() === normalizedCode) || null;
  },
  
  async createGroup(group) {
    if (useDatabase && dbQueries) {
      return await dbQueries.createGroup(group);
    }
    const json = loadJSON();
    if (!json.groups) json.groups = [];
    json.groups.push(group);
    saveJSON(json);
    return group;
  },
  
  async updateGroup(groupId, updates) {
    if (useDatabase && dbQueries) {
      return await dbQueries.updateGroup(groupId, updates);
    }
    const json = loadJSON();
    const group = json.groups?.find(g => g.id === groupId);
    if (group) {
      Object.assign(group, updates);
      saveJSON(json);
    }
    return group;
  },
  
  async deleteGroup(groupId) {
    if (useDatabase && dbQueries) {
      return await dbQueries.deleteGroup(groupId);
    }
    const json = loadJSON();
    json.groups = json.groups?.filter(g => g.id !== groupId) || [];
    saveJSON(json);
  },
  
  async submissions(filters = {}) {
    if (useDatabase && dbQueries) {
      return await dbQueries.getSubmissions(filters);
    }
    const json = loadJSON();
    let subs = json.submissions || [];
    if (filters.groupId !== undefined) {
      subs = subs.filter(s => (filters.groupId === null ? !s.groupId : s.groupId === filters.groupId));
    }
    if (filters.seasonNumber !== undefined) {
      subs = subs.filter(s => s.seasonNumber === filters.seasonNumber);
    }
    if (filters.userId !== undefined) {
      subs = subs.filter(s => s.userId === filters.userId);
    }
    return subs;
  },
  
  async createSubmission(submission) {
    if (useDatabase && dbQueries) {
      return await dbQueries.createSubmission(submission);
    }
    const json = loadJSON();
    if (!json.submissions) json.submissions = [];
    json.submissions.push(submission);
    saveJSON(json);
    return submission;
  },
  
  async updateSubmission(submissionId, updates) {
    if (useDatabase && dbQueries) {
      return await dbQueries.updateSubmission(submissionId, updates);
    }
    const json = loadJSON();
    const sub = json.submissions?.find(s => s.id === submissionId);
    if (sub) {
      Object.assign(sub, updates);
      saveJSON(json);
    }
    return sub;
  },
  
  async deleteSubmissions(filters = {}) {
    if (useDatabase && dbQueries) {
      return await dbQueries.deleteSubmissions(filters);
    }
    const json = loadJSON();
    if (filters.groupId !== undefined) {
      json.submissions = json.submissions?.filter(s => s.groupId !== filters.groupId) || [];
    } else {
      json.submissions = [];
    }
    saveJSON(json);
  },
  
  async history(filters = {}) {
    if (useDatabase && dbQueries) {
      return await dbQueries.getHistory(filters);
    }
    const json = loadJSON();
    let hist = json.history || [];
    if (filters.groupId !== undefined) {
      const getEntryGroupId = (entry) => entry.groupId || entry.winner?.groupId || entry.winners?.[0]?.groupId || null;
      hist = hist.filter(h => (filters.groupId === null ? !getEntryGroupId(h) : getEntryGroupId(h) === filters.groupId));
    }
    if (filters.seasonNumber !== undefined) {
      const getEntrySeasonNumber = (entry) => entry.seasonNumber || entry.winner?.seasonNumber || entry.winners?.[0]?.seasonNumber || null;
      hist = hist.filter(h => getEntrySeasonNumber(h) === filters.seasonNumber);
    }
    return hist.slice(0, 50);
  },
  
  async createHistoryEntry(entry) {
    if (useDatabase && dbQueries) {
      return await dbQueries.createHistoryEntry(entry);
    }
    const json = loadJSON();
    if (!json.history) json.history = [];
    json.history.unshift(entry);
    if (json.history.length > 50) json.history = json.history.slice(0, 50);
    saveJSON(json);
    return entry;
  },
  
  async deleteHistory(filters = {}) {
    if (useDatabase && dbQueries) {
      return await dbQueries.deleteHistory(filters);
    }
    const json = loadJSON();
    if (filters.groupId !== undefined) {
      json.history = json.history?.filter(h => {
        const groupId = h.groupId || h.winner?.groupId || h.winners?.[0]?.groupId || null;
        return groupId !== filters.groupId;
      }) || [];
    }
    saveJSON(json);
  },
  
  async submissionArchive(filters = {}) {
    if (useDatabase && dbQueries) {
      return await dbQueries.getSubmissionArchive(filters);
    }
    const json = loadJSON();
    let archive = json.submissionArchive || [];
    if (filters.groupId !== undefined) {
      archive = archive.filter(a => (filters.groupId === null ? !a.groupId : a.groupId === filters.groupId));
    }
    if (filters.seasonNumber !== undefined) {
      archive = archive.filter(a => a.seasonNumber === filters.seasonNumber);
    }
    if (filters.titleKey !== undefined) {
      archive = archive.filter(a => a.titleKey === filters.titleKey);
    }
    return archive;
  },
  
  async createSubmissionArchive(entry) {
    if (useDatabase && dbQueries) {
      return await dbQueries.createSubmissionArchive(entry);
    }
    const json = loadJSON();
    if (!json.submissionArchive) json.submissionArchive = [];
    const exists = json.submissionArchive.find(a => 
      a.titleKey === entry.titleKey && 
      a.groupId === entry.groupId && 
      a.seasonNumber === entry.seasonNumber
    );
    if (!exists) {
      json.submissionArchive.push(entry);
      saveJSON(json);
    }
  },
  
  async deleteSubmissionArchive(filters = {}) {
    if (useDatabase && dbQueries) {
      return await dbQueries.deleteSubmissionArchive(filters);
    }
    const json = loadJSON();
    if (json.submissionArchive) {
      let archive = json.submissionArchive;
      if (filters.groupId !== undefined) {
        archive = archive.filter(a => a.groupId !== filters.groupId);
      }
      if (filters.seasonNumber !== undefined) {
        archive = archive.filter(a => a.seasonNumber !== filters.seasonNumber);
      }
      json.submissionArchive = archive;
      saveJSON(json);
    }
  },
  
  async reviews(filters = {}) {
    if (useDatabase && dbQueries) {
      return await dbQueries.getReviews(filters);
    }
    const json = loadJSON();
    let revs = json.reviews || [];
    if (filters.movieTitle !== undefined) {
      revs = revs.filter(r => r.movieTitle === filters.movieTitle);
    }
    if (filters.groupId !== undefined) {
      revs = revs.filter(r => (filters.groupId === null ? !r.groupId : r.groupId === filters.groupId));
    }
    return revs;
  },
  
  async createReview(review) {
    if (useDatabase && dbQueries) {
      return await dbQueries.createReview(review);
    }
    const json = loadJSON();
    if (!json.reviews) json.reviews = [];
    json.reviews.push(review);
    saveJSON(json);
    return review;
  },
  
  async deleteReviews(filters = {}) {
    if (useDatabase && dbQueries) {
      return await dbQueries.deleteReviews(filters);
    }
    const json = loadJSON();
    if (filters.groupId !== undefined) {
      json.reviews = json.reviews?.filter(r => r.groupId !== filters.groupId) || [];
    }
    saveJSON(json);
  },
  
  async watched(filters = {}) {
    if (useDatabase && dbQueries) {
      return await dbQueries.getWatched(filters);
    }
    const json = loadJSON();
    let watched = json.watched || [];
    if (filters.userId !== undefined) {
      watched = watched.filter(w => w.userId === filters.userId);
    }
    if (filters.groupId !== undefined) {
      watched = watched.filter(w => (filters.groupId === null ? !w.groupId : w.groupId === filters.groupId));
    }
    return watched;
  },
  
  async createWatched(watched) {
    if (useDatabase && dbQueries) {
      return await dbQueries.createWatched(watched);
    }
    const json = loadJSON();
    if (!json.watched) json.watched = [];
    const exists = json.watched.find(w => w.id === watched.id);
    if (!exists) {
      json.watched.push(watched);
      saveJSON(json);
    }
    return watched;
  },
  
  async deleteWatched(filters = {}) {
    if (useDatabase && dbQueries) {
      return await dbQueries.deleteWatched(filters);
    }
    const json = loadJSON();
    if (filters.groupId !== undefined) {
      json.watched = json.watched?.filter(w => w.groupId !== filters.groupId) || [];
    }
    saveJSON(json);
  },
  
  async getUserSubmissions(seasonKey) {
    if (useDatabase && dbQueries) {
      return await dbQueries.getUserSubmissions(seasonKey);
    }
    const json = loadJSON();
    return json.userSubmissions?.[seasonKey] || [];
  },
  
  async setUserSubmissions(seasonKey, submissions) {
    if (useDatabase && dbQueries) {
      return await dbQueries.setUserSubmissions(seasonKey, submissions);
    }
    const json = loadJSON();
    if (!json.userSubmissions) json.userSubmissions = {};
    json.userSubmissions[seasonKey] = submissions;
    saveJSON(json);
  },
  
  async deleteUserSubmissions(seasonKey) {
    if (useDatabase && dbQueries) {
      return await dbQueries.deleteUserSubmissions(seasonKey);
    }
    const json = loadJSON();
    if (json.userSubmissions) {
      delete json.userSubmissions[seasonKey];
      saveJSON(json);
    }
  },
  
  async deleteUserSubmissionsByGroup(groupId) {
    if (useDatabase && dbQueries) {
      return await dbQueries.deleteUserSubmissionsByGroup(groupId);
    }
    const json = loadJSON();
    if (json.userSubmissions) {
      Object.keys(json.userSubmissions).forEach(key => {
        if (key.includes(`_${groupId}_`)) {
          delete json.userSubmissions[key];
        }
      });
      saveJSON(json);
    }
  },
  
  async getGlobalSeason() {
    if (useDatabase && dbQueries) {
      try {
        return await dbQueries.getGlobalSeason();
      } catch (err) {
        console.error('Database query failed, falling back to JSON:', err.message);
        // Fall through to JSON fallback
      }
    }
    const json = loadJSON();
    if (!json.season) {
      json.season = {
        number: 1,
        startDate: new Date().toISOString(),
        currentWeek: 1,
        endDate: null
      };
      saveJSON(json);
    }
    return json.season;
  },
  
  async updateGlobalSeason(updates) {
    if (useDatabase && dbQueries) {
      return await dbQueries.updateGlobalSeason(updates);
    }
    const json = loadJSON();
    if (!json.season) json.season = {};
    Object.assign(json.season, updates);
    saveJSON(json);
    return json.season;
  },
  
  isUsingDatabase() {
    return useDatabase;
  }
};

module.exports = data;
