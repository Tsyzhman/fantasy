#!/usr/bin/env python3
"""@spec spec://common/INFRA-006-continuous-deployment#data
Direct permission probes in a disposable CI PostgreSQL service, never production.
"""
import importlib.util
import os
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("roles", Path(__file__).with_name("configure-production-database-roles.py"))
roles = importlib.util.module_from_spec(spec)
spec.loader.exec_module(roles)


@unittest.skipUnless(os.environ.get("TEST_POSTGRES_CONTAINER"), "Isolated PostgreSQL service required")
class RoleTests(unittest.TestCase):
    def test_crud_and_future_migration_grants_but_no_runtime_ddl(self):
        container = os.environ["TEST_POSTGRES_CONTAINER"]
        self.assertNotEqual(container, "fantasy-scout-postgres")
        admin = os.environ.get("TEST_ADMIN_USER", "postgres")
        database = "fantasy_roles_test_ci"
        run = lambda user, db, sql: roles.execute(container, user, db, sql)
        run(admin, "postgres", "CREATE ROLE fantasy_app LOGIN SUPERUSER PASSWORD 'isolated-runtime-only';")
        run(admin, "postgres", f'CREATE DATABASE "{database}" OWNER fantasy_app;')
        try:
            run("fantasy_app", database, '''CREATE TABLE "AuthRateLimit" (id text primary key, action text, "subjectHash" text, "failedCount" int default 0);
CREATE TABLE "_prisma_migrations" (migration_name text);
CREATE TYPE public.audit_enum AS ENUM ('A','B');''')
            sql = Path(__file__).with_name("runtime-database-roles.sql").read_text()
            prefix = "\\set operator_password 'isolated-operator-only'\n\\set migration_password 'isolated-migration-only'\n"
            run("fantasy_app", database, prefix + sql)
            roles.verify(container, database,
                         f"postgresql://fantasy_app:isolated-runtime-only@localhost/{database}",
                         f"postgresql://fantasy_operator:isolated-operator-only@localhost/{database}")
            run("fantasy_migrator", database, "CREATE TABLE public.audit_future (id serial primary key, value audit_enum);")
            run("fantasy_app", database, "BEGIN; INSERT INTO public.audit_future(value) VALUES ('A'); ROLLBACK;")
            self.assertEqual(run("fantasy_app", database, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user);").stdout.strip(), "0")
            # Reapplying uses the protected operator and preserves the same runtime password.
            run("fantasy_operator", database, prefix + sql)
            roles.verify(container, database,
                         f"postgresql://fantasy_app:isolated-runtime-only@localhost/{database}",
                         f"postgresql://fantasy_operator:isolated-operator-only@localhost/{database}")
        finally:
            run(admin, "postgres", f'DROP DATABASE "{database}" WITH (FORCE);')
            run(admin, "postgres", "DROP ROLE IF EXISTS fantasy_migrator, fantasy_operator, fantasy_app;")


if __name__ == "__main__":
    unittest.main()
