# Render Deployment (AyuDiet)

## 1) Backend Service (`ayudiet-v2`)
- Service type: `Web Service`
- Root directory: `ayudiet-v2`
- Build command: `npm install`
- Start command: `npm start`
- Node version: `20.x` (project supports `>=20 <23`)

### Required backend env
- `NODE_ENV=production`
- `PORT=5000` (Render usually injects this, keep optional)
- `MONGO_URI=<your atlas uri>`
- `JWT_SECRET=<strong random secret>`
- `CORS_ORIGIN=<frontend render url>`
- `FRONTEND_ORIGIN=<frontend render url>`

### If using Groq for meal generation
- `MEALS_LLM_MODEL=openai/gpt-oss-120b`
- `MEALS_LLM_BASE_URL=https://api.groq.com/openai/v1`
- `MEALS_LLM_API_KEY=<groq key>`

## 2) Frontend Service (`ayudiet-frontend`)

Choose one:

- Preferred: `Static Site`
  - Root directory: `ayudiet-frontend`
  - Build command: `npm install && npm run build`
  - Publish directory: `dist`

- Alternative: `Web Service`
  - Root directory: `ayudiet-frontend`
  - Build command: `npm install && npm run build`
  - Start command: `npm start`

### Required frontend env
- `VITE_API_URL=<backend render url>`

### Optional frontend env
- `VITE_ENABLE_GOOGLE_AUTH=false`
- `VITE_ENABLE_CLERK_AUTH=false`

## 3) Final checks
- Open frontend URL
- Login as doctor
- Generate/Preview/Download PDF
- Confirm doctor name + phone in PDF header
- Confirm AI plan generation works

