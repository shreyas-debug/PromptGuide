# Backend Deployment Guide

## Quick Setup for Frontend Configuration

If you've deployed your backend to a hosting service, update the `frontend/config.json` file with your backend URL:

```json
{
  "apiUrl": "https://your-backend-url.com"
}
```

## Popular Backend Hosting Options

### 1. Railway
- Sign up at https://railway.app
- Connect your GitHub repository
- Select the `backend` directory
- Add environment variables (GROQ_API_KEY, GOOGLE_API_KEY)
- Railway will provide a URL like: `https://your-app.railway.app`

### 2. Render
- Sign up at https://render.com
- Create a new Web Service
- Connect your GitHub repository
- Set root directory to `backend`
- Add environment variables
- Render will provide a URL like: `https://your-app.onrender.com`

### 3. Heroku
- Sign up at https://heroku.com
- Install Heroku CLI
- Create a `Procfile` in the backend directory:
  ```
  web: gunicorn run:app
  ```
- Deploy using Heroku CLI
- Heroku will provide a URL like: `https://your-app.herokuapp.com`

### 4. PythonAnywhere
- Sign up at https://www.pythonanywhere.com
- Upload your backend code
- Configure WSGI file
- PythonAnywhere will provide a URL like: `https://your-username.pythonanywhere.com`

## After Deploying Backend

1. Update `frontend/config.json` with your backend URL
2. Commit and push the changes
3. The GitHub Pages site will automatically redeploy
4. Your frontend will now connect to the deployed backend!

## Testing Your Backend

Once deployed, test your backend endpoints:
- `GET https://your-backend-url.com/api/gauntlets`
- `POST https://your-backend-url.com/api/evaluate`
- `POST https://your-backend-url.com/api/refine`

Make sure CORS is enabled (already done in `backend/app/__init__.py`).

