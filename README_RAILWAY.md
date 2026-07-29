# 🚀 Railway Deployment Guide

This repository is configured as a dual-service monorepo for seamless, production-ready deployment on **[Railway.app](https://railway.app)**.

---

## 🏗️ Architecture Overview

| Service | Path | Tech Stack | Docker Build |
| :--- | :--- | :--- | :--- |
| **Backend API** | `/backend` | Python 3.11 / FastAPI / Uvicorn | `backend/Dockerfile` |
| **Frontend Web** | `/frontend` | Node.js 20 / Next.js 16 (Standalone) | `frontend/Dockerfile` |

---

## 🛠️ Step-by-Step Deployment Instructions

### 1. Create a New Railway Project
1. Log in to your [Railway Dashboard](https://railway.app/dashboard).
2. Click **New Project** → Select **Deploy from GitHub repo**.
3. Choose your repository: `Pramukh-Group-AI-System-V2`.

---

### 2. Configure Backend Service (`/backend`)

1. In your Railway project canvas, select the repository service and rename it to `backend`.
2. Go to **Settings**:
   - **Root Directory**: Set to `backend`
   - **Config File**: Automatically detects `backend/railway.json` / `backend/Dockerfile`.
3. Go to **Variables** and add your backend environment variables:

```env
# Database (PostgreSQL / Supabase pooling connection string)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres

# Supabase Credentials
SUPABASE_URL=https://[YOUR-PROJECT].supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# OpenAI API Key (For AI Speech-to-Text & Vision Features)
OPENAI_API_KEY=sk-proj-...
```

4. Go to **Networking** → Click **Generate Domain** (e.g. `https://pramukh-backend-production.up.railway.app`).

---

### 3. Configure Frontend Service (`/frontend`)

1. Click **+ New** in your Railway canvas → Select **GitHub Repo** → Choose `Pramukh-Group-AI-System-V2` again.
2. Rename this second service to `frontend`.
3. Go to **Settings**:
   - **Root Directory**: Set to `frontend`
   - **Config File**: Automatically detects `frontend/railway.json` / `frontend/Dockerfile`.
4. Go to **Variables** and add the frontend environment variables:

```env
# Public Supabase Access
NEXT_PUBLIC_SUPABASE_URL=https://[YOUR-PROJECT].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

# Python Backend Connection URL (Use the Backend domain generated in Step 2)
PYTHON_BACKEND_URL=https://pramukh-backend-production.up.railway.app
```

5. Go to **Networking** → Click **Generate Domain** (e.g. `https://pramukh-erp-production.up.railway.app`).

---

### 🌐 Railway Private Networking (Optional / Performance Optimization)

Railway supports free, low-latency internal networking between services in the same project workspace:
- You can set `PYTHON_BACKEND_URL` on the frontend service to the private internal domain:
  `http://backend.railway.internal:8000`
- This speeds up backend API requests by communicating directly inside Railway's internal network mesh.

---

### 🚦 Health Checks & Monitoring

Both services include pre-configured health check endpoints:
- **Backend Health Check**: `GET /` (returns `{"status": "healthy"}`)
- **Frontend Health Check**: `GET /` (returns HTTP `200 OK`)

Railway automatically monitors these endpoints and restarts containers if needed.
