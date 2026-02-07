# Backend

## Overview

The `backend` folder contains the Node.js backend for the Food Calorie App. It exposes REST APIs for authentication, meal management, and analysis orchestration, and acts as the central integration layer between the frontend, the database, and the ML services.

The backend is responsible for:

* User authentication and authorization
* Managing meals and analysis results
* Handling image and audio uploads
* Calling the `ml_service` for ML-based inference
* Persisting structured results in the database

---

## Architecture position

```
Frontend → Backend (Node.js / Express) → ml_service (FastAPI) → ML Models
                           ↓
                     PostgreSQL (Prisma)
```

The backend does **not** perform machine learning itself. Instead, it validates requests, stores metadata, forwards media files to the ML service, and persists the returned analysis results.

---

## Repository structure (key files)

* `package.json` — npm scripts and dependencies
* `src/server.js` — main server entry point
* `src/controllers/` — request handling logic

  * `authController.js`
  * `mealController.js`
  * `analysisController.js`
* `src/routes/` — API route definitions

  * `authRoutes.js`
  * `mealRoutes.js`
  * `analysisRoutes.js`
* `src/config/db.js` — Prisma database client setup
* `prisma/` — Prisma schema, migrations, and seed scripts
* `uploads/` — local storage for uploaded images and audio
* `utils/` — helper utilities (token handling, nutrition cache, scaling)

---

## Tech stack

* **Runtime**: Node.js (>= 18)
* **Framework**: Express
* **Database ORM**: Prisma
* **Database**: PostgreSQL (Neon in production)
* **Auth**: JWT-based authentication
* **ML integration**: REST calls to FastAPI-based `ml_service`

---

## Prerequisites

* Node.js 18+
* npm or yarn
* PostgreSQL database (local or hosted)

---

## Installation

From the `backend` folder:

```bash
npm install
```

Generate Prisma client and apply migrations:

```bash
npx prisma generate
npx prisma migrate dev --name init
```

(Optional) Seed the database:

```bash
node prisma/seed.js
```

---

## Environment variables

The backend reads configuration from the project root `.env` file. **Do not commit this file to source control.**

### Core variables

* `DATABASE_URL` — Prisma database connection string
* `PORT` — backend server port (default: 5001)
* `NODE_ENV` — `development` or `production`
* `JWT_SECRET` — secret used to sign JWTs
* `JWT_EXPIRES_IN` — token expiration (e.g. `1h`)

### Integration variables

* `ML_SERVICE_URL` — image analysis endpoint of `ml_service`

  * Example: `http://127.0.0.1:5002/predict`
* `FASTAPI_AUDIO_URL` — audio analysis endpoint of `ml_service`

  * Example: `http://127.0.0.1:5002/analyze-audio`

### Optional third-party APIs

* `OPENAI_API_KEY`
* `MISTRAL_API_KEY`

---

## Running the backend

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

The server will start on the configured `PORT` and expose the REST API.

---

## API overview

See `src/routes/` for full route definitions. Key endpoints include:

### Authentication

* `POST /auth/register` — create a new user
* `POST /auth/login` — authenticate and receive JWT

### Meals

* `GET /meals` — fetch meals for the authenticated user
* `POST /meals` — create a new meal (image and/or audio upload)

### Analysis

* `POST /analysis` — submit image or audio for ML analysis
* `GET /analysis/:id` — retrieve stored analysis results

Authentication is required for all meal and analysis endpoints.

---

## File uploads and storage

* Uploaded images and audio files are stored locally under:

  * `uploads/images/`
  * `uploads/audio/`

For production deployments, this should be replaced with external object storage (e.g. S3 or cloud storage).

---

## ML service integration

* The backend forwards uploaded media files to the `ml_service` via HTTP
* The ML service returns structured JSON results
* The backend validates, enriches, and persists these results in the database

The backend assumes the ML service is reachable at the URLs defined in the environment variables.

---

## Database and Prisma

* Schema definition: `prisma/schema.prisma`
* Migrations: `prisma/migrations/`

Use in production:

```bash
npx prisma migrate deploy
```

---

## Testing

* API testing is performed using simple test scripts located in the project root
* Example tests include:

  * `test_fastapi_image.py`
  * `test_fastapi_audio.py`
  * `test_model.py`

These scripts assume that the backend and ML services are running locally.

---

## Limitations

* Local file storage is not suitable for production
* Minimal automated test coverage
* Backend assumes trusted ML service responses

---

## Troubleshooting

* **Database errors**: verify `DATABASE_URL` and network access
* **Prisma issues**: run `npx prisma generate` before migrations
* **Upload failures**: ensure write permissions for `uploads/`
* **ML errors**: confirm `ml_service` is running and URLs are correct

---

## Deployment notes

* Configure all secrets securely in the environment
* Run database migrations before starting the server
* Externalize file storage for production use

---

## License / usage

This backend is part of a university project and intended for academic and educational use.
