#!/bin/bash

# Setup script for integration implementation
# This script helps set up the database and dependencies

set -e

echo "🚀 Starting Integration Setup..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"
echo ""

# Step 1: Install dependencies
echo "📦 Step 1: Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Step 2: Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "⚠️  .env.local not found. Please create it with required environment variables."
    echo "   See NEXT-STEPS.md for the list of required variables."
    echo ""
    read -p "Continue with migration anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ .env.local found"
    echo ""
fi

# Step 3: Generate Prisma Client (needed before migration)
echo "🔧 Step 2: Generating Prisma Client..."
npx prisma generate
echo "✅ Prisma Client generated"
echo ""

# Step 4: Run database migration
echo "🗄️  Step 3: Running database migration..."
echo "   This will create:"
echo "   - GHL OAuth fields"
echo "   - Zoom integration fields"
echo "   - Appointment Zoom fields"
echo "   - PCNChangelog model"
echo "   - AIQuery model"
echo ""
read -p "Continue with migration? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Migration cancelled."
    exit 0
fi

npx prisma migrate dev --name add_all_integrations
echo "✅ Migration completed"
echo ""

# Step 5: Verify Prisma Client
echo "🔍 Step 4: Verifying Prisma Client..."
npx prisma generate
echo "✅ Prisma Client verified"
echo ""

echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Configure environment variables in .env.local"
echo "2. Set up Slack app commands (see NEXT-STEPS.md)"
echo "3. Configure GHL Marketplace app (see NEXT-STEPS.md)"
echo "4. Configure Zoom app webhooks (see NEXT-STEPS.md)"
echo "5. Test the integrations (see NEXT-STEPS.md testing checklist)"
echo ""

