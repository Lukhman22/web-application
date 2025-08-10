## Deploying the project

1. Upload this repo to GitHub.
2. Backend: On Render, create a new Web Service, connect your GitHub repo -> select `backend` folder. Set environment variable `JWT_SECRET` and deploy.
3. Frontend: On Vercel, import project, select `frontend` folder. In Vercel's Environment variables set `VITE_API_URL` to your Render backend URL.
4. After builds succeed you'll have public frontend + backend URLs.
