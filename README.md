# AyuDiet Fullstack

AyuDiet is an AI-powered clinical diet management platform for doctors and dieticians.
This monorepo contains:

- `ayudiet-frontend` (React + Vite)
- `ayudiet-v2` (Node.js + Express + MongoDB)
- `AYUDIET-LLM_MODEL` (Python FastAPI + strict LLM pipeline)

## Features

- Doctor authentication (email/password, optional Google and Clerk login)
- Patient lifecycle management (create, update, documents, photo uploads)
- AI-assisted diet plan generation with fallback-safe behavior
- Plan review workflow (pending, approved, rejected, active)
- Adaptive plan logic from progress trends (adherence, energy, digestion, weight)
- Safety guardrails (allergy, diabetes, hypertension checks)
- Multilingual-ready PDF diet plan generation
- Dashboard insights and chatbot support

## Monorepo Structure

```text
AYUDIET-FULLSTACK/
  ayudiet-frontend/     # React app
  ayudiet-v2/           # Express backend API
  AYUDIET-LLM_MODEL/    # Python strict LLM service
```

## Tech Stack

- Frontend: React, Vite, Tailwind, Axios, Zustand
- Backend: Node.js, Express, MongoDB (Mongoose), JWT, Multer, PDFKit
- AI Service: Python, FastAPI, LangChain/LangGraph, strict schema wrappers

## Prerequisites

- Node.js `>=20 <23`
- npm
- MongoDB Atlas URI (`mongodb+srv://...`)
- Python 3.13+ (for `AYUDIET-LLM_MODEL`)

## 1) Backend Setup (`ayudiet-v2`)

### Install

```bash
cd ayudiet-v2
npm install
```

### Environment

Create `ayudiet-v2/.env`:

```env
NODE_ENV=development
PORT=5000

MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/<db>?retryWrites=true&w=majority
JWT_SECRET=<min_32_char_secret>

# CORS
CORS_ORIGIN=http://localhost:5173
FRONTEND_ORIGIN=http://localhost:5173

# AI meal generation (example: Groq OpenAI-compatible)
MEALS_LLM_MODEL=openai/gpt-oss-120b
MEALS_LLM_BASE_URL=https://api.groq.com/openai/v1
MEALS_LLM_API_KEY=<your_key>

# Optional auth toggles
ENABLE_GOOGLE_AUTH=false
GOOGLE_CLIENT_ID=
ENABLE_CLERK_AUTH=false
CLERK_SECRET_KEY=
ENABLE_EMAIL_OTP_VERIFICATION=false

# Optional OTP email provider
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

### Run

```bash
npm start
```

### Test

```bash
npm test
```

## 2) Frontend Setup (`ayudiet-frontend`)

### Install

```bash
cd ayudiet-frontend
npm install
```

### Environment

Create `ayudiet-frontend/.env` (or copy from `.env.example`):

```env
VITE_API_URL=http://localhost:5000
VITE_LOCAL_API_URL=
VITE_ENABLE_GOOGLE_AUTH=false
VITE_GOOGLE_CLIENT_ID=
VITE_ENABLE_CLERK_AUTH=false
VITE_CLERK_PUBLISHABLE_KEY=
```

### Run (dev)

```bash
npm run dev
```

## 3) Strict LLM Service Setup (`AYUDIET-LLM_MODEL`)

This module is maintained as a separate Python service and can be run independently.

```bash
cd AYUDIET-LLM_MODEL
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

See module docs: `AYUDIET-LLM_MODEL/README.md`

## API Routing Notes

Backend mounts routes under both:

- `/auth`, `/patients`, `/plans`, `/progress`, `/health`
- `/api/auth`, `/api/patients`, `/api/plans`, `/api/progress`, `/api/health`

This helps local and deployed clients work with either prefix style.

## Deployment

See deployment guide:

- `DEPLOY_RENDER.md`

## Security Notes

- Never commit `.env` files or API keys.
- Use strong `JWT_SECRET` (32+ chars).
- Use HTTPS `VITE_API_URL` in production.

## License

Add your preferred license before public release.