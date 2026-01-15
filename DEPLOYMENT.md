# Deployment Guide

This guide will help you deploy your Movie Club app to make it accessible via a URL.

## Option 1: Deploy to Render (Recommended - Free)

Render offers a free tier that's perfect for Node.js applications.

### Steps:

1. **Sign up for Render:**
   - Go to https://render.com
   - Sign up with your GitHub account (recommended) or email

2. **Connect your GitHub repository:**
   - In the Render dashboard, click "New +" → "Web Service"
   - Connect your GitHub account if you haven't already
   - Select the `movie-of-the-week` repository

3. **Configure the service:**
   - **Name:** `movie-of-the-week` (or any name you prefer)
   - **Region:** Choose closest to your users
   - **Branch:** `main`
   - **Root Directory:** (leave empty)
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free (512 MB RAM)

4. **Add Environment Variables (Optional):**
   - If you have an OMDb API key, click "Environment" tab
   - Add: `OMDB_API_KEY` = `your-api-key-here`

5. **Deploy:**
   - Click "Create Web Service"
   - Render will automatically build and deploy your app
   - Your app will be available at: `https://movie-of-the-week.onrender.com` (or similar)

### Note on Render Free Tier:
- Services may spin down after 15 minutes of inactivity
- First request after spin-down may take 30-50 seconds to respond
- Perfect for testing and low-traffic applications

---

## Option 2: Deploy to Vercel (Free)

Vercel is great for Node.js apps and has excellent performance.

### Steps:

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   cd "/Users/eleanorwalker/Desktop/Movie club"
   vercel
   ```
   
   Follow the prompts to link your project.

4. **For production:**
   ```bash
   vercel --prod
   ```

Your app will be available at a URL like: `https://movie-of-the-week.vercel.app`

---

## Option 3: Deploy to Railway (Free)

Railway offers a simple deployment process with a generous free tier.

### Steps:

1. **Sign up:** Go to https://railway.app and sign up with GitHub

2. **New Project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `movie-of-the-week` repository

3. **Configure:**
   - Railway will auto-detect it's a Node.js app
   - The default settings should work
   - Add `OMDB_API_KEY` in the Variables tab if needed

4. **Deploy:**
   - Click "Deploy" - Railway will automatically deploy
   - Your app will get a URL like: `https://movie-of-the-week.up.railway.app`

---

## Option 4: Deploy to Fly.io (Free)

Fly.io offers global deployment with a free tier.

### Steps:

1. **Install Fly CLI:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login:**
   ```bash
   fly auth login
   ```

3. **Create app:**
   ```bash
   cd "/Users/eleanorwalker/Desktop/Movie club"
   fly launch
   ```

4. **Deploy:**
   ```bash
   fly deploy
   ```

---

## After Deployment

Once deployed, your app will have a public URL. Update any hardcoded API endpoints in your frontend code if necessary to point to your deployed backend URL.

### Testing:
1. Visit your deployed URL
2. Test user registration/login
3. Test movie submissions
4. Verify the app is working correctly

---

## Important Notes:

- **File Persistence:** Your app uses a JSON file (`submissions.json`) for storage. On free hosting services, this file may reset when the service restarts. For production, consider using a proper database.

- **Environment Variables:** Keep sensitive keys (like API keys) as environment variables, not in your code.

- **HTTPS:** All recommended hosting services provide HTTPS by default, which is secure for production use.
