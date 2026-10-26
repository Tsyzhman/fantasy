-- @spec spec://common/INFRA-006-continuous-deployment#data
-- Run by the protected operator adapter; passwords are psql stdin variables.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
-- OID 10 is PostgreSQL's immutable bootstrap superuser; preserve it as operator.
SELECT 'ALTER ROLE fantasy_app RENAME TO fantasy_operator'
WHERE EXISTS (SELECT FROM pg_roles WHERE rolname='fantasy_app' AND oid=10) \gexec
SELECT format('CREATE ROLE fantasy_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'runtime_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='fantasy_app') \gexec
SELECT 'CREATE ROLE fantasy_operator LOGIN SUPERUSER'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fantasy_operator') \gexec
SELECT 'CREATE ROLE fantasy_migrator LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fantasy_migrator') \gexec
ALTER ROLE fantasy_operator LOGIN SUPERUSER PASSWORD :'operator_password';
ALTER ROLE fantasy_migrator LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'migration_password';
SELECT format('ALTER DATABASE %I OWNER TO fantasy_migrator', current_database()) \gexec
-- The init user may also own the three system databases. Remove that ownership.
SELECT format('ALTER DATABASE %I OWNER TO fantasy_operator', datname)
FROM pg_database WHERE datname IN ('postgres', 'template0', 'template1')
AND datdba IN (SELECT oid FROM pg_roles WHERE rolname IN ('fantasy_app','fantasy_operator')) \gexec
ALTER SCHEMA public OWNER TO fantasy_migrator;
SELECT format('ALTER %s %I.%I OWNER TO fantasy_migrator',
 CASE relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p','S','v','m','f')
AND c.relowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('fantasy_app','fantasy_operator'))
ORDER BY CASE WHEN c.relkind = 'S' THEN 1 ELSE 0 END, c.oid \gexec
SELECT format('ALTER TYPE %I.%I OWNER TO fantasy_migrator', n.nspname, t.typname)
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype IN ('e','d')
AND t.typowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('fantasy_app','fantasy_operator')) \gexec
SELECT format('ALTER %s %I.%I(%s) OWNER TO fantasy_migrator',
 CASE p.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
 n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('fantasy_app','fantasy_operator')) \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC, fantasy_app;
SELECT format('REVOKE ALL ON DATABASE %I FROM fantasy_app', current_database()) \gexec
SELECT format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO fantasy_app', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO fantasy_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM fantasy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fantasy_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fantasy_app;
REVOKE INSERT, UPDATE, DELETE ON "_prisma_migrations" FROM fantasy_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fantasy_migrator IN SCHEMA public
 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fantasy_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fantasy_migrator IN SCHEMA public
 GRANT USAGE, SELECT ON SEQUENCES TO fantasy_app;
REVOKE fantasy_operator, fantasy_migrator FROM fantasy_app;
ALTER ROLE fantasy_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
COMMIT;
