# CSV Import Guide

## Step 1: Place Your CSV File

Place your CSV file in the root directory with this exact name:
```
PCN_Test_Data__BudgetDog__-_PCN_Log__1_.csv
```

## Step 2: Install Dependencies

Dependencies are already installed, but if needed:
```bash
npm install
```

## Step 3: Run the Import

Run the import script:
```bash
npx tsx scripts/import-csv.ts
```

Or compile and run:
```bash
npx tsx scripts/import-csv.ts
```

## What Gets Imported

The import script will:
- ✅ Create contacts from CSV data
- ✅ Create closer users from email addresses
- ✅ Create appointments with all metadata
- ✅ Map statuses (Signed, Showed, No-showed, Cancelled)
- ✅ Store objection types and notes
- ✅ Track qualification status
- ✅ Import cash collected amounts

## Expected CSV Format

Your CSV should have these columns (or similar):
- `Appointment ID`
- `Date`
- `Appointment Start Time`
- `Contact Name`
- `Email`
- `Phone`
- `Closer` (email address)
- `Call Outcome` (Signed, Showed, No-showed, Cancelled)
- `Calendar`
- `First Call or Follow Up`
- `Notes`
- `Qualifiation Status`
- `Follow Up Scheduled`
- `Nurture Type`
- `Cash Collected`
- `Why Didnt the Prospect Move Forward?`
- Other metadata fields

## Verify Import

After importing, check:
- **Dashboard**: http://localhost:3000/dashboard
- **Analytics**: http://localhost:3000/analytics
- **API**: http://localhost:3000/api/analytics

