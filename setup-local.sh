#!/bin/bash

# Setup script for local development environment
# This script will:
# 1. Generate Prisma client
# 2. Push schema changes to database
# 3. Start the development server

set -e

echo "🚀 Setting up local development environment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed or not in PATH"
    echo "Please install Node.js (v18+) or use a version manager like nvm"
    echo ""
    echo "To install nvm:"
    echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    echo ""
    echo "Then install Node.js:"
    echo "  nvm install 18"
    echo "  nvm use 18"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  DATABASE_URL environment variable is not set"
    echo "Please set it in your .env file or export it:"
    echo "  export DATABASE_URL='your-database-url'"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
else
    echo "✅ Dependencies already installed"
fi

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Push schema changes to database
echo "🗄️  Pushing schema changes to database..."
npx prisma db push

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the development server, run:"
echo "  npm run dev"
echo ""
echo "Then open http://localhost:3000 in your browser"
echo ""
echo "To test the PCN form:"
echo "  1. Log in to the application"
echo "  2. Navigate to an appointment"
echo "  3. Click 'Submit PCN' or go to /pcn/[appointment-id]"
echo ""

