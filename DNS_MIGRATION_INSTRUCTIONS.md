# DNS Migration Instructions: Railway → Vercel

## Current Status

✅ **Vercel Deployment:** FULLY FUNCTIONAL
- Latest Production URL: https://maggieforbesstrategies-landing-i80hkzw5w.vercel.app
- Authentication: ✅ Working
- Database (Supabase): ✅ Connected
- All APIs: ✅ Functional
- CORS: ✅ Configured

❌ **Railway:** OFFLINE (502 errors)
- Domain currently points here: maggieforbesstrategies.com
- Application not responding (server.js removed)

---

## Migration Summary

### Completed Changes

1. **Removed Railway-specific files:**
   - `server.js` - Express server (not needed for Vercel serverless)
   - `railway.json` - Railway configuration
   - `nixpacks.toml` - Railway build configuration

2. **Updated Vercel configuration:**
   - Added CORS headers to `vercel.json`
   - All API routes configured as serverless functions
   - Environment variables configured (15 variables including ADMIN_PASSWORD)

3. **Database:**
   - Already using Supabase PostgreSQL
   - Connection pooling optimized for serverless
   - All tables initialized and ready

---

## DNS Update Required

To complete the migration, update your DNS records to point to Vercel:

### Option 1: Using Vercel DNS (Recommended)

1. Go to your domain registrar (wherever you bought maggieforbesstrategies.com)
2. Update nameservers to Vercel's:
   ```
   ns1.vercel-dns.com
   ns2.vercel-dns.com
   ```
3. In Vercel dashboard, add the domain:
   - Go to: https://vercel.com/maggie-forbes-strategies/maggieforbesstrategies-landing/settings/domains
   - Add domain: `maggieforbesstrategies.com`
   - Add domain: `www.maggieforbesstrategies.com`

### Option 2: Using CNAME (If you want to keep current nameservers)

Update your DNS A records:

**For Root Domain (maggieforbesstrategies.com):**
```
Type: A
Name: @
Value: 76.76.21.21
TTL: Auto/3600
```

**For WWW Subdomain (www.maggieforbesstrategies.com):**
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
TTL: Auto/3600
```

---

## Verification Steps

After updating DNS (allow 5-60 minutes for propagation):

1. **Test the domain:**
   ```bash
   curl -I https://maggieforbesstrategies.com
   # Should show: server: Vercel
   ```

2. **Test authentication:**
   ```bash
   curl -X POST https://maggieforbesstrategies.com/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"password":"mfs2024admin"}'
   # Should return: {"success":true,"expiresAt":"..."}
   ```

3. **Run full test suite:**
   ```bash
   node test-auth-flow.js
   ```

---

## Test Results (Before DNS Migration)

### ✅ Vercel (ALL TESTS PASSING)
- ✅ Rejects wrong password
- ✅ Accepts correct password
- ✅ Session cookie set correctly
- ✅ Protected endpoints work
- ✅ Logout works
- ✅ Database connected

### ❌ Railway (ALL TESTS FAILING - Expected)
- ❌ 502 Application failed to respond
- This is normal - we removed server.js

---

## Environment Variables (Already Configured)

All environment variables are set in Vercel for Production, Preview, and Development:

- `DATABASE_URL` - Supabase connection string ✅
- `ADMIN_PASSWORD` - Authentication password ✅
- `ANTHROPIC_API_KEY` - AI features ✅
- `SUPABASE_SERVICE_ROLE_KEY` ✅
- `MFS_TENANT_ID` ✅
- Plus 10 more for Stripe, Calendly, social integrations

---

## Rollback Plan (If Needed)

If something goes wrong after DNS update:

1. Revert DNS records to Railway
2. Restore server.js from git history:
   ```bash
   git checkout ab0ce92 -- server.js railway.json nixpacks.toml
   git push
   ```

---

## Post-Migration Cleanup

After DNS migration is successful and tested:

1. **Delete Railway project** (to avoid charges)
2. **Remove test files:**
   ```bash
   rm test-auth-flow.js
   rm .env.vercel
   ```
3. **Update documentation** if needed

---

## Support Links

- Vercel Domains: https://vercel.com/docs/concepts/projects/domains
- Vercel Dashboard: https://vercel.com/maggie-forbes-strategies/maggieforbesstrategies-landing
- DNS Propagation Check: https://www.whatsmydns.net/

---

Generated: 2025-11-28
Migration Type: Railway → Vercel + Supabase
