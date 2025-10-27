# Clerk Webhook Integration

## ✅ What's Been Created

**File:** `app/api/webhooks/clerk/route.ts`
- Handles Clerk user creation events
- Syncs Clerk users with your database
- Uses `svix` for webhook verification
- Links existing users or creates new ones

## 🔧 Setup Required

### 1. Get Your Webhook Secret

In your [Clerk Dashboard](https://dashboard.clerk.com/):
1. Go to **Webhooks** section
2. Create a new webhook endpoint: `https://yourdomain.com/api/webhooks/clerk`
3. Select **User Created** event
4. Copy the **Signing Secret**

### 2. Add Secret to Environment

Replace `YOUR_WEBHOOK_SECRET` in `.env.local`:

```bash
# Clerk Webhook
CLERK_WEBHOOK_SECRET=whsec_your_actual_secret_here
```

### 3. Update Middleware (Already Done)

The middleware already includes `/api/webhooks(.*)` as a public route, so Clerk can reach your webhook.

## 🎯 How It Works

### User Sign-Up Flow:
1. **User signs up** via Clerk
2. **Clerk sends webhook** to `/api/webhooks/clerk`
3. **Webhook handler**:
   - Verifies the webhook signature
   - Extracts user data (email, name, Clerk ID)
   - Checks if user exists in database by email
   - **If exists**: Links Clerk ID to existing user
   - **If new**: Creates new user record

### Database Integration:
- Stores Clerk ID in `customFields.clerkId`
- Links Clerk users to your existing User model
- Handles both new and existing users

## 🔒 Security Features

- **Webhook verification** using `svix` library
- **Signature validation** with Clerk's signing secret
- **Header validation** for required svix headers
- **Error handling** for verification failures

## 🚀 Next Steps

1. **Get your webhook secret** from Clerk Dashboard
2. **Add it to `.env.local`**
3. **Test the webhook** by creating a new user
4. **Verify user sync** in your database

Your Clerk users will now automatically sync with your database! 🎉
