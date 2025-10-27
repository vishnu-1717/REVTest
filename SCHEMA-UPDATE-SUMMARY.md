# Schema Update Complete

## New Features Added

### 1. **Commission Roles**
Added `CommissionRole` model for managing different commission structures:
- Name (e.g., "Closer", "Setter", "DM Setter")
- Default rate (percentage)
- Company-specific roles
- Links to users

### 2. **Enhanced User Model**
New fields on User:
- `commissionRoleId` - Links to commission role
- `customCommissionRate` - Override role rate if needed
- `canViewTeamMetrics` - Permission flag
- `canViewLeaderboard` - Permission flag

### 3. **Enhanced Commission Model**
New payment tracking fields:
- `releasedAmount` - Amount released so far (progressive payments)
- `totalAmount` - Total commission owed
- `releaseStatus` - "pending", "partial", "released", "paid"
- `overrideAmount` - Manual override if needed
- `overrideReason` - Why override was made
- `overrideByUserId` - Who made the override

### 4. **Enhanced Sale Model**
New payment and matching fields:
- `paymentType` - "pif", "payment_plan", "deposit"
- `totalAmount` - Total sale value
- `remainingAmount` - Amount still owed
- `matchedBy` - How it was matched ("appointment_id", "email", "phone", "manual")
- `matchConfidence` - 0.0 to 1.0
- `manuallyMatched` - Whether admin manually matched
- `matchedByUserId` - Admin who matched it

### 5. **New Models**

#### PaymentLink
- Unique token for payment URLs
- Expiration tracking
- Open tracking
- Links appointments to payment requests

#### UnmatchedPayment
- Tracks sales that couldn't be matched to appointments
- Suggests potential matches
- Admin review workflow

## Database Status

✅ All tables created successfully
✅ Relationships established
✅ Indexes added
✅ Prisma client generated

## Next Steps

The enhanced schema is ready for:
- Payment matching logic
- Commission role assignments
- Payment link generation
- Progressive commission releases
- Admin review workflows

