# Database Setup Guide

This guide will help you set up PostgreSQL database for the Movie Club app so that **user data persists permanently**, even after code deployments.

## Why Database?

✅ **Users persist permanently** - No more lost accounts after deployments  
✅ **Data survives restarts** - Database is separate from your code  
✅ **Scalable** - Can handle many users and submissions  
✅ **Safe** - Database backups are available on Render  

## Step 1: Create PostgreSQL Database on Render

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Click "New +"** → **"PostgreSQL"**
3. **Configure**:
   - **Name**: `movie-club-db` (or your preferred name)
   - **Database**: `movie_club`
   - **User**: `movie_club_user` (auto-generated)
   - **Region**: Choose closest to your app
   - **PostgreSQL Version**: 15 (or latest)
   - **Plan**: Free (or paid for production)
4. **Click "Create Database"**
5. **Copy the "Internal Database URL"** - You'll need this!

## Step 2: Connect Database to Your App

1. **Go to your Web Service** on Render (the one running your app)
2. **Go to "Environment" tab**
3. **Add Environment Variable**:
   - **Key**: `DATABASE_URL`
   - **Value**: Paste the "Internal Database URL" from Step 1
4. **Click "Save Changes"**

## Step 3: Initialize Database Schema

The database schema will be automatically created when your app starts (if `DATABASE_URL` is set).

Alternatively, you can manually run the migration:

```bash
node database/migrate.js
```

## Step 4: Migrate Existing Data (Optional)

If you have existing data in `submissions.json`:

1. Make sure your local `.env` file has `DATABASE_URL` pointing to your Render database
2. Run the migration script:
   ```bash
   node database/migrate.js
   ```

This will copy all users, groups, submissions, and history to the database.

## Step 5: Deploy and Verify

1. **Commit and push your changes** to GitHub
2. **Render will auto-deploy**
3. **Check the logs** - You should see: `✅ Connected to PostgreSQL database`
4. **Test the app** - Create a new user account
5. **Verify persistence** - Deploy a code change and confirm the user still exists!

## Environment Variables

Make sure these are set on Render:

- `DATABASE_URL` - **Required** - PostgreSQL connection string
- `PORT` - Auto-set by Render (usually 10000)
- `OMDB_API_KEY` - Optional - For movie poster lookups

## How It Works

- **Local Development**: Set `DATABASE_URL` in a `.env` file (not committed to git)
- **Production (Render)**: Set `DATABASE_URL` in Render dashboard
- **Database is separate**: Code changes don't affect user data
- **Automatic backups**: Render provides automatic backups for paid plans

## Troubleshooting

### "Connection refused" error
- Check that `DATABASE_URL` is set correctly
- Verify the database is running on Render
- Make sure you're using the "Internal Database URL" (not External)

### "Table does not exist" error
- The schema auto-initializes on first connection
- Check logs for initialization messages
- You can manually run: `node database/migrate.js`

### Data not appearing
- Run the migration script to copy data from JSON file
- Check database connection in logs
- Verify environment variables are set

## Important Notes

⚠️ **Once migrated to database:**
- Users and data are stored permanently in PostgreSQL
- Code deployments won't affect user accounts
- `submissions.json` is ignored and won't be used
- Always backup your database before major changes

## Backup Your Database

**Free Plan**: Manual exports recommended  
**Paid Plans**: Automatic backups available

To export data:
```bash
pg_dump $DATABASE_URL > backup.sql
```

To restore:
```bash
psql $DATABASE_URL < backup.sql
```

---

**Your users will now persist permanently! 🎉**
