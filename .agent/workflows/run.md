---
description: How to reliably run the Revphlo SaaS application
---

To run the application in your terminal with all necessary checks, use the following single command:

// turbo
```bash
npm install && npx prisma generate && npx prisma db push && npm run dev
```

### What this command does:
1.  `npm install`: Ensures all dependencies are up to date.
2.  `npx prisma generate`: Updates the Prisma Client to match the database schema.
3.  `npx prisma db push`: Synchronizes your local database with the schema (safely).
4.  `npm run dev`: Starts the Next.js development server.

> [!NOTE]
> If port 3000 is occupied, the server will automatically start on port 3001. Check the terminal output for the final URL.
