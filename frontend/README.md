# Frontend

## Overview
The `frontend` folder contains the React-based user interface for the Food Calorie App.  
It allows users to upload food images (and optionally audio input), triggers analysis requests, and visualizes the returned results.

The frontend is responsible for:
- User interface (screens, components, interactions)
- Capturing and uploading media (image / audio) to the backend
- Displaying meals and analysis results returned by the backend
- Basic client-side state handling (forms, UI state)
- Calling backend REST endpoints (no direct ML inference in the browser)

## Architecture position

```text
Frontend (React / Vite) → Backend (Node.js / Express) → ml_service (FastAPI) → ML Models
                                   ↓
                             PostgreSQL (Prisma)
```

The frontend does not perform machine learning itself. Instead, it sends requests to the backend API and renders the returned structured results.

## Repository structure (key files)
package.json — npm scripts and dependencies

vite.config.js — Vite configuration

index.html — HTML entry

src/main.jsx — React entry point

src/App.jsx — main app component (prototype entry)

src/ — UI components, pages, and application logic

public/ — static assets (icons, images)

## Tech stack
Runtime: Node.js (18+, tested with v24.12.0)

UI: React (19)

Build tool / dev server: Vite (7)

Charts: Recharts (3)

Linting: ESLint

Prerequisites
Node.js (18+, tested with v24.12.0)

npm

## Installation
From the project root:

cd frontend
npm install
Environment variables
The frontend reads configuration from a .env file inside the frontend folder.
Do not commit this file to source control.

## Core variable:

VITE_API_URL — backend base URL

Example frontend/.env:

VITE_API_URL=http://localhost:5001
If you update .env, restart the dev server.

## Running the frontend
### Development
npm run dev
### Production build
npm run build
Preview production build locally
npm run preview
Linting
npm run lint
How the frontend talks to the backend
The frontend sends HTTP requests to the backend (base URL configured via VITE_API_URL).

The backend handles authentication, storage, and orchestration of ML inference via ml_service.

The frontend receives structured JSON results and displays them.

## Troubleshooting
Backend not reachable / network error: verify the backend is running and VITE_API_URL is correct (backend default port: 5001).

CORS issues: ensure the backend allows requests from the frontend origin (Vite dev server).

Port conflicts: Vite may auto-select another port; check the terminal output.

## Limitations
Prototype-level UI (university project scope)

Limited automated test coverage

Local development assumes the backend is available locally

## License / usage
This frontend is part of a university project and intended for academic and educational use.


