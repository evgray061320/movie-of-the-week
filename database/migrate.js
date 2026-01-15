// Migration script to move data from JSON file to PostgreSQL
const fs = require('fs');
const path = require('path');
const { initializeDatabase } = require('./db');
const db = require('./queries');

async function migrateFromJSON() {
  console.log('🔄 Starting migration from JSON to PostgreSQL...');
  
  try {
    // Initialize database schema
    await initializeDatabase();
    
    // Load JSON file
    const jsonPath = path.join(__dirname, '..', 'submissions.json');
    if (!fs.existsSync(jsonPath)) {
      console.log('⚠️  No submissions.json file found. Starting with empty database.');
      return;
    }
    
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log('📦 Loaded JSON data');
    
    // Migrate users
    if (jsonData.users && jsonData.users.length > 0) {
      console.log(`📝 Migrating ${jsonData.users.length} users...`);
      for (const user of jsonData.users) {
        try {
          await db.createUser({
            id: user.id,
            username: user.username,
            name: user.name || user.username,
            password: user.password,
            securityQuestion: user.securityQuestion,
            securityAnswer: user.securityAnswer,
            genres: user.genres || [],
            email: user.email,
            groupId: user.groupId,
            createdAt: user.createdAt
          });
        } catch (err) {
          if (err.code !== '23505') { // Ignore duplicate key errors
            console.error(`Error migrating user ${user.id}:`, err.message);
          }
        }
      }
      console.log('✅ Users migrated');
    }
    
    // Migrate groups
    if (jsonData.groups && jsonData.groups.length > 0) {
      console.log(`📝 Migrating ${jsonData.groups.length} groups...`);
      for (const group of jsonData.groups) {
        try {
          await db.createGroup({
            id: group.id,
            name: group.name,
            creatorId: group.creatorId,
            code: group.code,
            members: group.members || [],
            admins: group.admins || [group.creatorId],
            settings: group.settings,
            season: group.season,
            seasons: group.seasons || [],
            createdAt: group.createdAt
          });
        } catch (err) {
          if (err.code !== '23505') {
            console.error(`Error migrating group ${group.id}:`, err.message);
          }
        }
      }
      console.log('✅ Groups migrated');
    }
    
    // Migrate submissions
    if (jsonData.submissions && jsonData.submissions.length > 0) {
      console.log(`📝 Migrating ${jsonData.submissions.length} submissions...`);
      for (const submission of jsonData.submissions) {
        try {
          await db.createSubmission({
            id: submission.id,
            title: submission.title,
            description: submission.description,
            category: submission.category,
            posterUrl: submission.posterUrl,
            userId: submission.userId,
            groupId: submission.groupId,
            seasonNumber: submission.seasonNumber || 1,
            submittedAt: submission.submittedAt
          });
        } catch (err) {
          if (err.code !== '23505') {
            console.error(`Error migrating submission ${submission.id}:`, err.message);
          }
        }
      }
      console.log('✅ Submissions migrated');
    }
    
    // Migrate submission archive
    if (jsonData.submissionArchive && jsonData.submissionArchive.length > 0) {
      console.log(`📝 Migrating ${jsonData.submissionArchive.length} archive entries...`);
      for (const entry of jsonData.submissionArchive) {
        try {
          await db.createSubmissionArchive({
            id: entry.id,
            title: entry.title,
            titleKey: entry.titleKey,
            groupId: entry.groupId,
            seasonNumber: entry.seasonNumber,
            submittedAt: entry.submittedAt
          });
        } catch (err) {
          // Ignore conflicts
        }
      }
      console.log('✅ Submission archive migrated');
    }
    
    // Migrate history
    if (jsonData.history && jsonData.history.length > 0) {
      console.log(`📝 Migrating ${jsonData.history.length} history entries...`);
      for (const entry of jsonData.history) {
        try {
          await db.createHistoryEntry({
            id: entry.id,
            winners: entry.winners || (entry.winner ? [entry.winner] : []),
            winner: entry.winner || (entry.winners && entry.winners[0] ? entry.winners[0] : null),
            pickedAt: entry.pickedAt,
            submissionsCount: entry.submissionsCount,
            groupId: entry.groupId,
            seasonNumber: entry.seasonNumber
          });
        } catch (err) {
          if (err.code !== '23505') {
            console.error(`Error migrating history ${entry.id}:`, err.message);
          }
        }
      }
      console.log('✅ History migrated');
    }
    
    // Migrate reviews
    if (jsonData.reviews && jsonData.reviews.length > 0) {
      console.log(`📝 Migrating ${jsonData.reviews.length} reviews...`);
      for (const review of jsonData.reviews) {
        try {
          await db.createReview({
            id: review.id,
            userId: review.userId,
            movieTitle: review.movieTitle,
            rating: review.rating,
            review: review.review,
            groupId: review.groupId,
            createdAt: review.createdAt
          });
        } catch (err) {
          if (err.code !== '23505') {
            console.error(`Error migrating review ${review.id}:`, err.message);
          }
        }
      }
      console.log('✅ Reviews migrated');
    }
    
    // Migrate watched
    if (jsonData.watched && jsonData.watched.length > 0) {
      console.log(`📝 Migrating ${jsonData.watched.length} watched entries...`);
      for (const watched of jsonData.watched) {
        try {
          await db.createWatched({
            id: watched.id,
            userId: watched.userId,
            movieTitle: watched.movieTitle,
            groupId: watched.groupId,
            watchedAt: watched.watchedAt
          });
        } catch (err) {
          // Ignore conflicts
        }
      }
      console.log('✅ Watched entries migrated');
    }
    
    // Migrate user submissions tracking
    if (jsonData.userSubmissions) {
      console.log(`📝 Migrating user submissions tracking...`);
      for (const [seasonKey, submissions] of Object.entries(jsonData.userSubmissions)) {
        try {
          await db.setUserSubmissions(seasonKey, submissions);
        } catch (err) {
          console.error(`Error migrating user submissions ${seasonKey}:`, err.message);
        }
      }
      console.log('✅ User submissions tracking migrated');
    }
    
    // Migrate global season
    if (jsonData.season) {
      console.log('📝 Migrating global season...');
      await db.updateGlobalSeason({
        seasonNumber: jsonData.season.number || 1,
        startDate: jsonData.season.startDate,
        currentWeek: jsonData.season.currentWeek || 1,
        endDate: jsonData.season.endDate
      });
      console.log('✅ Global season migrated');
    }
    
    console.log('🎉 Migration complete!');
    console.log('\n⚠️  IMPORTANT: Make sure to:');
    console.log('1. Set DATABASE_URL environment variable on Render');
    console.log('2. Run this migration script once after database is set up');
    console.log('3. Users and data will now persist permanently!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateFromJSON()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { migrateFromJSON };
