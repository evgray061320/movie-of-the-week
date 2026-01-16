// Database query functions
const { query } = require('./db');

// Users
async function createUser(user) {
  const result = await query(
    `INSERT INTO users (id, username, name, password, security_question, security_answer, genres, email, group_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [user.id, user.username, user.name, user.password, user.securityQuestion, user.securityAnswer, 
     user.genres || [], user.email, user.groupId, user.createdAt || new Date()]
  );
  return result.rows[0];
}

async function getUserById(id) {
  const result = await query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0];
}

async function getUserByUsername(username) {
  const result = await query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  return result.rows[0];
}

async function getAllUsers() {
  const result = await query('SELECT * FROM users ORDER BY created_at DESC');
  return result.rows;
}

async function updateUser(userId, updates) {
  const fields = [];
  const values = [];
  let paramCount = 1;
  
  if (updates.groupId !== undefined) {
    fields.push(`group_id = $${paramCount++}`);
    values.push(updates.groupId);
  }
  if (updates.password !== undefined) {
    fields.push(`password = $${paramCount++}`);
    values.push(updates.password);
  }
  if (fields.length === 0) return null;
  
  values.push(userId);
  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0];
}

// Groups
async function createGroup(group) {
  const result = await query(
    `INSERT INTO groups (id, name, creator_id, code, members, admins, settings, season, seasons, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [group.id, group.name, group.creatorId, group.code, group.members || [], 
     group.admins || [], JSON.stringify(group.settings || {}), 
     JSON.stringify(group.season || null), JSON.stringify(group.seasons || []),
     group.createdAt || new Date()]
  );
  return result.rows[0];
}

async function getGroupById(id) {
  const result = await query('SELECT * FROM groups WHERE id = $1', [id]);
  if (result.rows[0]) {
    const group = result.rows[0];
    // JSONB fields are already parsed by pg driver - only parse if string
    group.settings = group.settings && typeof group.settings === 'string' ? JSON.parse(group.settings) : (group.settings || null);
    group.season = group.season && typeof group.season === 'string' ? JSON.parse(group.season) : (group.season || null);
    group.seasons = group.seasons && typeof group.seasons === 'string' ? JSON.parse(group.seasons) : (group.seasons || []);
    return group;
  }
  return null;
}

async function getGroupByCode(code) {
  // Normalize code to uppercase for consistent matching
  const normalizedCode = String(code).trim().toUpperCase();
  const result = await query('SELECT * FROM groups WHERE UPPER(TRIM(code)) = $1', [normalizedCode]);
  if (result.rows[0]) {
    const group = result.rows[0];
    // JSONB fields are already parsed by pg driver - only parse if string
    group.settings = group.settings && typeof group.settings === 'string' ? JSON.parse(group.settings) : (group.settings || null);
    group.season = group.season && typeof group.season === 'string' ? JSON.parse(group.season) : (group.season || null);
    group.seasons = group.seasons && typeof group.seasons === 'string' ? JSON.parse(group.seasons) : (group.seasons || []);
    return group;
  }
  return null;
}

async function getAllGroups() {
  const result = await query('SELECT * FROM groups ORDER BY created_at DESC');
  return result.rows.map(group => {
    // JSONB fields are already parsed by pg driver - only parse if string
    group.settings = group.settings && typeof group.settings === 'string' ? JSON.parse(group.settings) : (group.settings || null);
    group.season = group.season && typeof group.season === 'string' ? JSON.parse(group.season) : (group.season || null);
    group.seasons = group.seasons && typeof group.seasons === 'string' ? JSON.parse(group.seasons) : (group.seasons || []);
    return group;
  });
}

async function updateGroup(groupId, updates) {
  const fields = [];
  const values = [];
  let paramCount = 1;
  
  if (updates.name !== undefined) {
    fields.push(`name = $${paramCount++}`);
    values.push(updates.name);
  }
  if (updates.members !== undefined) {
    fields.push(`members = $${paramCount++}`);
    values.push(updates.members);
  }
  if (updates.admins !== undefined) {
    fields.push(`admins = $${paramCount++}`);
    values.push(updates.admins);
  }
  if (updates.settings !== undefined) {
    fields.push(`settings = $${paramCount++}`);
    values.push(JSON.stringify(updates.settings));
  }
  if (updates.season !== undefined) {
    fields.push(`season = $${paramCount++}`);
    values.push(JSON.stringify(updates.season));
  }
  if (updates.seasons !== undefined) {
    fields.push(`seasons = $${paramCount++}`);
    values.push(JSON.stringify(updates.seasons));
  }
  if (fields.length === 0) return null;
  
  values.push(groupId);
  const result = await query(
    `UPDATE groups SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  if (result.rows[0]) {
    const group = result.rows[0];
    // JSONB fields are already parsed by pg driver - only parse if string
    group.settings = group.settings && typeof group.settings === 'string' ? JSON.parse(group.settings) : (group.settings || null);
    group.season = group.season && typeof group.season === 'string' ? JSON.parse(group.season) : (group.season || null);
    group.seasons = group.seasons && typeof group.seasons === 'string' ? JSON.parse(group.seasons) : (group.seasons || []);
    return group;
  }
  return null;
}

async function deleteGroup(groupId) {
  await query('DELETE FROM groups WHERE id = $1', [groupId]);
}

// Submissions
async function createSubmission(submission) {
  const result = await query(
    `INSERT INTO submissions (id, title, description, category, poster_url, user_id, group_id, season_number, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [submission.id, submission.title, submission.description, submission.category,
     submission.posterUrl, submission.userId, submission.groupId, submission.seasonNumber || 1,
     submission.submittedAt || new Date()]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    posterUrl: row.poster_url,
    userId: row.user_id,
    groupId: row.group_id,
    seasonNumber: row.season_number,
    submittedAt: row.submitted_at
  };
}

async function getSubmissions(filters = {}) {
  let sql = 'SELECT * FROM submissions WHERE 1=1';
  const params = [];
  let paramCount = 1;
  
  if (filters.groupId !== undefined) {
    if (filters.groupId === null) {
      sql += ' AND group_id IS NULL';
    } else {
      sql += ` AND group_id = $${paramCount++}`;
      params.push(filters.groupId);
    }
  }
  if (filters.seasonNumber !== undefined) {
    sql += ` AND season_number = $${paramCount++}`;
    params.push(filters.seasonNumber);
  }
  if (filters.userId !== undefined) {
    sql += ` AND user_id = $${paramCount++}`;
    params.push(filters.userId);
  }
  
  sql += ' ORDER BY submitted_at DESC';
  
  const result = await query(sql, params);
  return result.rows.map(row => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    posterUrl: row.poster_url,
    userId: row.user_id,
    groupId: row.group_id,
    seasonNumber: row.season_number,
    submittedAt: row.submitted_at
  }));
}

async function deleteSubmissions(filters = {}) {
  let sql = 'DELETE FROM submissions WHERE 1=1';
  const params = [];
  let paramCount = 1;
  
  if (filters.groupId !== undefined) {
    sql += ` AND group_id = $${paramCount++}`;
    params.push(filters.groupId);
  }
  if (params.length === 0) {
    sql = 'DELETE FROM submissions';
    params = [];
  }
  
  await query(sql, params);
}

async function updateSubmission(submissionId, updates) {
  const fields = [];
  const values = [];
  let paramCount = 1;
  
  if (updates.posterUrl !== undefined) {
    fields.push(`poster_url = $${paramCount++}`);
    values.push(updates.posterUrl);
  }
  if (fields.length === 0) return null;
  
  values.push(submissionId);
  const result = await query(
    `UPDATE submissions SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  if (result.rows[0]) {
    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      posterUrl: row.poster_url,
      userId: row.user_id,
      groupId: row.group_id,
      seasonNumber: row.season_number,
      submittedAt: row.submitted_at
    };
  }
  return null;
}

// Submission Archive
async function createSubmissionArchive(entry) {
  await query(
    `INSERT INTO submission_archive (id, title, title_key, group_id, season_number, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING`,
    [entry.id, entry.title, entry.titleKey, entry.groupId, entry.seasonNumber, entry.submittedAt]
  );
}

async function getSubmissionArchive(filters = {}) {
  let sql = 'SELECT * FROM submission_archive WHERE 1=1';
  const params = [];
  let paramCount = 1;
  
  if (filters.groupId !== undefined) {
    if (filters.groupId === null) {
      sql += ' AND group_id IS NULL';
    } else {
      sql += ` AND group_id = $${paramCount++}`;
      params.push(filters.groupId);
    }
  }
  if (filters.seasonNumber !== undefined) {
    sql += ` AND season_number = $${paramCount++}`;
    params.push(filters.seasonNumber);
  }
  if (filters.titleKey !== undefined) {
    sql += ` AND title_key = $${paramCount++}`;
    params.push(filters.titleKey);
  }
  
  const result = await query(sql, params);
  return result.rows.map(row => ({
    id: row.id,
    title: row.title,
    titleKey: row.title_key,
    groupId: row.group_id,
    seasonNumber: row.season_number,
    submittedAt: row.submitted_at
  }));
}

// History (Winners)
async function createHistoryEntry(entry) {
  const result = await query(
    `INSERT INTO history (id, winners, winner, picked_at, submissions_count, group_id, season_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [entry.id, JSON.stringify(entry.winners || []), JSON.stringify(entry.winner || null),
     entry.pickedAt || new Date(), entry.submissionsCount || 0, entry.groupId, entry.seasonNumber]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    // JSONB fields are already parsed by pg driver - only parse if string
    winners: row.winners && typeof row.winners === 'string' ? JSON.parse(row.winners) : (row.winners || []),
    winner: row.winner && typeof row.winner === 'string' ? JSON.parse(row.winner) : (row.winner || null),
    pickedAt: row.picked_at,
    submissionsCount: row.submissions_count,
    groupId: row.group_id,
    seasonNumber: row.season_number
  };
}

async function getHistory(filters = {}) {
  let sql = 'SELECT * FROM history WHERE 1=1';
  const params = [];
  let paramCount = 1;
  
  if (filters.groupId !== undefined) {
    if (filters.groupId === null) {
      sql += ' AND group_id IS NULL';
    } else {
      sql += ` AND group_id = $${paramCount++}`;
      params.push(filters.groupId);
    }
  }
  if (filters.seasonNumber !== undefined) {
    sql += ` AND season_number = $${paramCount++}`;
    params.push(filters.seasonNumber);
  }
  
  sql += ' ORDER BY picked_at DESC LIMIT 50';
  
  const result = await query(sql, params);
  return result.rows.map(row => ({
    id: row.id,
    // JSONB fields are already parsed by pg driver - only parse if string
    winners: row.winners && typeof row.winners === 'string' ? JSON.parse(row.winners) : (row.winners || []),
    winner: row.winner && typeof row.winner === 'string' ? JSON.parse(row.winner) : (row.winner || null),
    pickedAt: row.picked_at,
    submissionsCount: row.submissions_count,
    groupId: row.group_id,
    seasonNumber: row.season_number
  }));
}

async function deleteHistory(filters = {}) {
  let sql = 'DELETE FROM history WHERE 1=1';
  const params = [];
  let paramCount = 1;
  
  if (filters.groupId !== undefined) {
    sql += ` AND group_id = $${paramCount++}`;
    params.push(filters.groupId);
  }
  await query(sql, params);
}

// Reviews
async function createReview(review) {
  const result = await query(
    `INSERT INTO reviews (id, user_id, movie_title, rating, review, group_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [review.id, review.userId, review.movieTitle, review.rating, review.review,
     review.groupId, review.createdAt || new Date()]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    movieTitle: row.movie_title,
    rating: row.rating,
    review: row.review,
    groupId: row.group_id,
    createdAt: row.created_at
  };
}

async function getReviews(filters = {}) {
  let sql = 'SELECT * FROM reviews WHERE 1=1';
  const params = [];
  let paramCount = 1;
  
  if (filters.movieTitle !== undefined) {
    sql += ` AND movie_title = $${paramCount++}`;
    params.push(filters.movieTitle);
  }
  if (filters.groupId !== undefined) {
    if (filters.groupId === null) {
      sql += ' AND group_id IS NULL';
    } else {
      sql += ` AND group_id = $${paramCount++}`;
      params.push(filters.groupId);
    }
  }
  
  sql += ' ORDER BY created_at DESC';
  
  const result = await query(sql, params);
  return result.rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    movieTitle: row.movie_title,
    rating: row.rating,
    review: row.review,
    groupId: row.group_id,
    createdAt: row.created_at
  }));
}

async function deleteReviews(filters = {}) {
  let sql = 'DELETE FROM reviews WHERE 1=1';
  const params = [];
  let paramCount = 1;
  
  if (filters.groupId !== undefined) {
    sql += ` AND group_id = $${paramCount++}`;
    params.push(filters.groupId);
  }
  await query(sql, params);
}

// Watched
async function createWatched(watched) {
  await query(
    `INSERT INTO watched (id, user_id, movie_title, group_id, watched_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [watched.id, watched.userId, watched.movieTitle, watched.groupId, watched.watchedAt || new Date()]
  );
}

async function getWatched(filters = {}) {
  let sql = 'SELECT * FROM watched WHERE 1=1';
  const params = [];
  let paramCount = 1;
  
  if (filters.userId !== undefined) {
    sql += ` AND user_id = $${paramCount++}`;
    params.push(filters.userId);
  }
  if (filters.groupId !== undefined) {
    if (filters.groupId === null) {
      sql += ' AND group_id IS NULL';
    } else {
      sql += ` AND group_id = $${paramCount++}`;
      params.push(filters.groupId);
    }
  }
  
  const result = await query(sql, params);
  return result.rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    movieTitle: row.movie_title,
    groupId: row.group_id,
    watchedAt: row.watched_at
  }));
}

async function deleteWatched(filters = {}) {
  let sql = 'DELETE FROM watched WHERE 1=1';
  const params = [];
  let paramCount = 1;
  
  if (filters.groupId !== undefined) {
    sql += ` AND group_id = $${paramCount++}`;
    params.push(filters.groupId);
  }
  await query(sql, params);
}

// User Submissions Tracking
async function getUserSubmissions(seasonKey) {
  const result = await query('SELECT * FROM user_submissions WHERE season_key = $1', [seasonKey]);
  if (result.rows[0]) {
    // JSONB fields are already parsed by pg driver - only parse if string
    const submissions = result.rows[0].submissions;
    return submissions && typeof submissions === 'string' ? JSON.parse(submissions) : (submissions || []);
  }
  return [];
}

async function setUserSubmissions(seasonKey, submissions) {
  await query(
    `INSERT INTO user_submissions (season_key, submissions)
     VALUES ($1, $2)
     ON CONFLICT (season_key) 
     DO UPDATE SET submissions = $2, updated_at = CURRENT_TIMESTAMP`,
    [seasonKey, JSON.stringify(submissions)]
  );
}

async function deleteUserSubmissions(seasonKey) {
  await query('DELETE FROM user_submissions WHERE season_key = $1', [seasonKey]);
}

async function deleteUserSubmissionsByGroup(groupId) {
  await query('DELETE FROM user_submissions WHERE season_key LIKE $1', [`%_${groupId}_%`]);
}

// Global Season
async function getGlobalSeason() {
  const result = await query('SELECT * FROM global_season ORDER BY id DESC LIMIT 1');
  if (result.rows[0]) {
    const row = result.rows[0];
    return {
      number: row.season_number,
      startDate: row.start_date,
      currentWeek: row.current_week,
      endDate: row.end_date
    };
  }
  // Create default if none exists
  const insertResult = await query(
    `INSERT INTO global_season (season_number, start_date, current_week)
     VALUES (1, CURRENT_TIMESTAMP, 1)
     RETURNING *`
  );
  const row = insertResult.rows[0];
  return {
    number: row.season_number,
    startDate: row.start_date,
    currentWeek: row.current_week,
    endDate: row.end_date
  };
}

async function updateGlobalSeason(updates) {
  const fields = [];
  const values = [];
  let paramCount = 1;
  
  if (updates.seasonNumber !== undefined) {
    fields.push(`season_number = $${paramCount++}`);
    values.push(updates.seasonNumber);
  }
  if (updates.currentWeek !== undefined) {
    fields.push(`current_week = $${paramCount++}`);
    values.push(updates.currentWeek);
  }
  if (updates.endDate !== undefined) {
    fields.push(`end_date = $${paramCount++}`);
    values.push(updates.endDate);
  }
  if (updates.startDate !== undefined) {
    fields.push(`start_date = $${paramCount++}`);
    values.push(updates.startDate);
  }
  if (fields.length === 0) return null;
  
  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  
  const result = await query(
    `UPDATE global_season SET ${fields.join(', ')} 
     WHERE id = (SELECT id FROM global_season ORDER BY id DESC LIMIT 1)
     RETURNING *`,
    values
  );
  if (result.rows[0]) {
    const row = result.rows[0];
    return {
      number: row.season_number,
      startDate: row.start_date,
      currentWeek: row.current_week,
      endDate: row.end_date
    };
  }
  return null;
}

module.exports = {
  // Users
  createUser,
  getUserById,
  getUserByUsername,
  getAllUsers,
  updateUser,
  
  // Groups
  createGroup,
  getGroupById,
  getGroupByCode,
  getAllGroups,
  updateGroup,
  deleteGroup,
  
  // Submissions
  createSubmission,
  getSubmissions,
  deleteSubmissions,
  updateSubmission,
  
  // Submission Archive
  createSubmissionArchive,
  getSubmissionArchive,
  
  // History
  createHistoryEntry,
  getHistory,
  deleteHistory,
  
  // Reviews
  createReview,
  getReviews,
  deleteReviews,
  
  // Watched
  createWatched,
  getWatched,
  deleteWatched,
  
  // User Submissions
  getUserSubmissions,
  setUserSubmissions,
  deleteUserSubmissions,
  deleteUserSubmissionsByGroup,
  
  // Global Season
  getGlobalSeason,
  updateGlobalSeason
};
