# Local Development Setup Guide

## Quick Start

### 1. Ensure Node.js is Installed

Check if Node.js is available:
```bash
node --version  # Should be v18 or higher
npm --version
```

If Node.js is not installed:
- **Using Homebrew (macOS):**
  ```bash
  brew install node
  ```

- **Using NVM (Recommended):**
  ```bash
  # Install nvm
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
  
  # Reload shell
  source ~/.zshrc  # or ~/.bash_profile
  
  # Install and use Node.js 18
  nvm install 18
  nvm use 18
  ```

### 2. Set Up Environment Variables

Create a `.env.local` file in the project root (or use existing `.env`):

```bash
# Database
DATABASE_URL="your-postgresql-connection-string"
DIRECT_URL="your-direct-database-url"  # Same as DATABASE_URL for local dev

# Clerk Authentication (if using)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="your-clerk-key"
CLERK_SECRET_KEY="your-clerk-secret"

# Other environment variables as needed
```

### 3. Run Setup Script

```bash
./setup-local.sh
```

Or manually:
```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Push schema changes to database
npx prisma db push
```

### 4. Start Development Server

```bash
npm run dev
```

The application will be available at: **http://localhost:3000**

## Testing the PCN Form

### Access the PCN Form

1. **Log in** to the application
2. Navigate to an appointment that needs a PCN
3. Click "Submit PCN" or go directly to: `/pcn/[appointment-id]`

### Test Different Outcomes

The PCN form now supports the complete decision tree:

- **SIGNED**: Payment Plan/PIF → Total Price → Number of Payments
- **SHOWED**: Qualification Status → Offer Made? → Follow-up → Nurture Type
- **NO SHOW**: Communicative status (dropdown)
- **CANCELLED**: Updated cancellation reasons
- **CONTRACT SENT**: Notes only

### Test Data

If you need test appointment data, you can:
1. Create appointments through the UI
2. Import test data using the import scripts
3. Use the GHL webhook to create appointments

## Troubleshooting

### "Node.js not found"
- Make sure Node.js is installed and in your PATH
- Try restarting your terminal
- If using nvm, make sure it's initialized: `source ~/.nvm/nvm.sh`

### "DATABASE_URL is not set"
- Create a `.env.local` file with your database connection string
- Or export it: `export DATABASE_URL="your-url"`

### Prisma Errors
- Make sure your database is running and accessible
- Check that DATABASE_URL is correct
- Try: `npx prisma db push --force-reset` (⚠️ This will reset your database)

### Port Already in Use
- Change the port: `npm run dev -- -p 3001`
- Or kill the process using port 3000

## Schema Changes

The following schema changes have been made:

### Appointment Model - New PCN Fields:
- `paymentPlanOrPIF` - Payment plan or paid in full
- `totalPrice` - Total revenue for payment plans
- `numberOfPayments` - Number of payments
- `downsellOpportunity` - Company-configurable downsell options
- `whyNoOffer` - Why no offer was made
- `whyNoOfferNotes` - Notes for why no offer
- `noShowCommunicative` - Changed from Boolean to String enum
- `didCallAndText` - Optional tracking for no-shows
- `rescheduledTo` - New scheduled time
- `rescheduledFrom` - Original scheduled time

### Company Model - New Fields:
- `downsellOpportunities` - JSON array of company-specific downsell options
- GHL OAuth fields (for future use)

## Next Steps

After testing the PCN form:
1. Verify all decision tree branches work correctly
2. Test validation for each outcome
3. Check that data is saved correctly in the database
4. Test the form with different user roles (admin, rep, closer)

