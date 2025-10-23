#!/bin/bash
set -e

echo "Generating Prisma client..."
npx prisma generate

echo "Building Next.js application..."
npx next build
