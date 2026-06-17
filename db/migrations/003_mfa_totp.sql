-- ============================================================================
-- Migration 003 — Module Z MFA: real TOTP second factor (PLAT-AUTH-003)
-- ============================================================================
-- NON-DESTRUCTIVE, additive-only. Contains ZERO DROP statements.
-- Idempotent: safe to re-run.
--
-- Background: before this change the `mfa` JWT claim merely mirrored
-- core.app_user.mfa_enabled, so an "MFA-enabled" user satisfied every @Mfa()
-- gate WITHOUT presenting a second factor. This migration adds the per-user
-- TOTP secret the AuthService challenge/verify flow checks (RFC 6238). A login
-- now issues an mfa:false token; POST /auth/mfa/verify mints the mfa:true,
-- stepped-up token only after a valid authenticator code.
-- ============================================================================

-- 1. TOTP secret (base32) ----------------------------------------------------
ALTER TABLE core.app_user
  ADD COLUMN IF NOT EXISTS mfa_secret text;   -- base32; NULL until enrolled

-- 2. Dev-only enrolment for the demo finance manager -------------------------
--    Lets the @Mfa() sensitive-action flow (e.g. POST /ledger/adjustment) work
--    out of the box in dev. The secret below is a FIXED DEMO VALUE — never use
--    in production; real users enrol via POST /auth/mfa/enroll which generates
--    a random secret. Add this secret to an authenticator as a manual key.
UPDATE core.app_user
   SET mfa_secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
       mfa_enabled = true
 WHERE username = 'demo_finmgr';
