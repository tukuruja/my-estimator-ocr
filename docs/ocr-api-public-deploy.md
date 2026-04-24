# OCR API Public Deploy

## Decision
- Platform: Railway
- Reason: this workspace can deploy the FastAPI app directly from the local `ai_api` directory with `railway up`, and the current Fly.io account is blocked by payment verification.

## Why Railway
- `Dockerfile` deploy from a local directory is supported.
- A Railway-managed HTTPS domain can be issued per service.
- `railway.json` lets this repo keep healthcheck and restart policy in code.

## Current app assumptions
- App dir: `ai_api/`
- Runtime: FastAPI + Uvicorn
- Public HTTPS endpoint target: `https://ocr-api-production-3482.up.railway.app`
- Local fallback remains `http://127.0.0.1:8000`

## Files added for deployment
- `ai_api/Dockerfile`
- `ai_api/.dockerignore`
- `ai_api/railway.json`

## Required env
- `CORS_ALLOW_ORIGINS`
- `CORS_ALLOW_ORIGIN_REGEX`
- `PYTHONUNBUFFERED=1`

## Railway project state
- Project: `my-estimator-ocr-api`
- Service: `ocr-api`
- Public domain: `https://ocr-api-production-3482.up.railway.app`

## Deploy commands
```bash
cd ai_api
railway login
railway init -n my-estimator-ocr-api
railway add --service ocr-api
railway variable set -s ocr-api \
  CORS_ALLOW_ORIGINS="https://my-estimator-ocr.vercel.app,https://tkr-estimate.vercel.app" \
  CORS_ALLOW_ORIGIN_REGEX="^https://my-estimator-[a-z0-9-]+-tukurtunjas-projects\\.vercel\\.app$" \
  PYTHONUNBUFFERED=1
railway up . --path-as-root -s ocr-api -d
railway domain -s ocr-api
```

## Frontend env after deploy
Set this for the frontend preview:
```bash
VITE_AI_API_BASE_URL=https://ocr-api-production-3482.up.railway.app
```

## Health check
- `/health`
- `/healthz`

## Known limitation
- This only publishes the OCR API.
- The public Vercel preview still does not include the Express `masters` / `reports` API unless that backend is also deployed separately.

## Official references
- Railway deploy from a local directory: https://docs.railway.com/deploy/cli
- Railway Dockerfile builds: https://docs.railway.com/deploy/dockerfiles
- Railway config as code: https://docs.railway.com/reference/config-as-code
- Railway healthchecks: https://docs.railway.com/reference/healthchecks
