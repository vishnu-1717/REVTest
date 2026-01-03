# REVTest

Internal development environment for Revphlo analytics and integrations.

## Tech Stack
- Next.js
- PostgreSQL (Neon)
- Prisma ORM
- Clerk Authentication
- GoHighLevel API
- Zoom API
- OpenAI API

## Prerequisites
- Node.js v18+
- npm
- Git

## Setup

### Clone Repository
git clone https://github.com/vishnu-1717/REVTest.git
cd REVTest

### Install Dependencies
npm install

## Environment Variables
Create a `.env` file in the project root with the following values:

DATABASE_URL="your_postgresql_url"
DIRECT_URL="your_direct_url"

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="your_clerk_publishable_key"
CLERK_SECRET_KEY="your_clerk_secret_key"

GHL_API_KEY="your_ghl_api_key"

ZOOM_CLIENT_ID="your_zoom_client_id"
ZOOM_CLIENT_SECRET="your_zoom_client_secret"

OPENAI_API_KEY="your_openai_api_key"

## Database Setup
npx prisma generate
npx prisma db push

## Run Locally
npm run dev

Application will be available at:
http://localhost:8080

## Integrations
- GoHighLevel appointment ingestion
- Zoom recording and transcript ingestion
- OpenAI-powered analytics

## Notes
- Do not commit the `.env` file
- Ensure all environment variables are set before running
- Dashboard filters and analytics are production-stable

## Status
Active development
