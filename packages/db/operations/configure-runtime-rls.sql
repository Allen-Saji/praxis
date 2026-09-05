-- Run as the table owner after migrations, never through the web runtime.
-- This role belongs exclusively to the trusted server. Tenant authorization
-- remains in the application; browser clients must use the authenticated API.
DO $runtime_rls$
DECLARE
  table_name text;
  browser_role text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'praxis_app'
    AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb) THEN
    RAISE EXCEPTION 'praxis_app must exist as a restricted server role';
  END IF;

  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated', 'authenticator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      IF pg_has_role(browser_role, 'praxis_app', 'MEMBER') THEN
        RAISE EXCEPTION 'Browser-facing roles must not be members of praxis_app';
      END IF;
    END IF;
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'organizations', 'users', 'organization_members', 'auth_challenges',
    'sessions', 'wallets', 'agents', 'wallet_agent_assignments',
    'policy_scopes', 'policy_versions', 'policy_recipient_rules',
    'agent_credentials', 'spend_intents', 'budget_reservations',
    'wallet_budget_counters', 'assignment_budget_counters',
    'audit_events', 'wallet_execution_leases'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    IF EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public'
      AND p.tablename = table_name AND p.policyname = 'praxis_server_access') THEN
      EXECUTE format('ALTER POLICY praxis_server_access ON public.%I TO praxis_app
        USING (current_user = ''praxis_app'') WITH CHECK (current_user = ''praxis_app'')', table_name);
    ELSE
      EXECUTE format('CREATE POLICY praxis_server_access ON public.%I FOR ALL TO praxis_app
        USING (current_user = ''praxis_app'') WITH CHECK (current_user = ''praxis_app'')', table_name);
    END IF;
  END LOOP;
END
$runtime_rls$;
