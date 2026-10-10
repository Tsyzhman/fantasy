#!/usr/bin/env python3
"""@spec spec://common/INFRA-006-continuous-deployment#data
Direct permission probes in a disposable CI PostgreSQL service, never production.
"""
import importlib.util
import os
import json
import subprocess
import time
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
            prefix = "\\set operator_password 'isolated-operator-only'\n\\set migration_password 'isolated-migration-only'\n\\set runtime_password 'isolated-runtime-only'\n"
            roles.apply_roles(container, database,
                              f"postgresql://fantasy_app:isolated-runtime-only@localhost/{database}",
                              f"postgresql://fantasy_operator:isolated-operator-only@localhost/{database}",
                              f"postgresql://fantasy_migrator:isolated-migration-only@localhost/{database}")
            roles.verify(container, database,
                         f"postgresql://fantasy_app:isolated-runtime-only@localhost/{database}",
                         f"postgresql://fantasy_operator:isolated-operator-only@localhost/{database}")
            run("fantasy_migrator", database, "CREATE TABLE public.audit_future (id serial primary key, value audit_enum);")
            run("fantasy_app", database, "BEGIN; INSERT INTO public.audit_future(value) VALUES ('A'); ROLLBACK;")
            self.assertEqual(run("fantasy_app", database, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user);").stdout.strip(), "0")
            clone = "fantasy_roles_drop_probe_ci"
            run("fantasy_migrator", "postgres", f'CREATE DATABASE "{clone}";')
            client = subprocess.Popen(["docker", "exec", container, "psql", "-X", "-U", "fantasy_app", "-d", clone,
                                       "-c", "SELECT pg_sleep(30);"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                for _ in range(30):
                    active = run(admin, "postgres", f"SELECT count(*) FROM pg_stat_activity WHERE datname='{clone}' AND usename='fantasy_app';")
                    if active.stdout.strip() == "1":
                        break
                    time.sleep(0.1)
                else:
                    self.fail("Isolated runtime connection did not start")
                denied = roles.execute(container, "fantasy_migrator", "postgres",
                                       f'\\set VERBOSITY sqlstate\nDROP DATABASE "{clone}" WITH (FORCE);', check=False)
                self.assertNotEqual(denied.returncode, 0)
                self.assertIn("42501", denied.stderr)
                run("fantasy_operator", "postgres", f'DROP DATABASE "{clone}" WITH (FORCE);')
                client.communicate(timeout=10)
                self.assertEqual(run("fantasy_app", database, "SELECT 1;").stdout.strip(), "1")
            finally:
                run(admin, "postgres", f'DROP DATABASE IF EXISTS "{clone}" WITH (FORCE);')
                client.communicate(timeout=10)
            # Reapplying uses the protected operator and preserves the same runtime password.
            run("fantasy_operator", database, prefix + sql)
            roles.verify(container, database,
                         f"postgresql://fantasy_app:isolated-runtime-only@localhost/{database}",
                         f"postgresql://fantasy_operator:isolated-operator-only@localhost/{database}")
        finally:
            run(admin, "postgres", f'DROP DATABASE "{database}" WITH (FORCE);')
            run(admin, "postgres", "DROP ROLE IF EXISTS fantasy_migrator, fantasy_operator, fantasy_app;")

    def test_actual_bootstrap_oid_is_preserved_as_protected_operator(self):
        service = os.environ["TEST_POSTGRES_CONTAINER"]
        self.assertNotEqual(service, "fantasy-scout-postgres")
        image = json.loads(subprocess.check_output(["docker", "inspect", service]))[0]["Image"]
        container = "fantasy-audit-bootstrap-" + str(os.getpid())
        database = "fantasy_roles_test_ci"
        subprocess.run(["docker", "run", "-d", "--name", container, "--label", "purpose=audit-regression",
                        "--memory", "512m", "--cpus", "1", "--pids-limit", "128",
                        "--tmpfs", "/var/lib/postgresql/data:size=128m",
                        "-e", "POSTGRES_USER=fantasy_app", "-e", "POSTGRES_PASSWORD=isolated-runtime-only",
                        "-e", "POSTGRES_DB=" + database, image], check=True, capture_output=True)
        run = lambda user, db, sql: roles.execute(container, user, db, sql)
        try:
            # The entrypoint's initialization server only accepts Unix sockets.
            # Wait for the final TCP server and the requested database instead.
            for _ in range(30):
                ready = roles.execute(container, "fantasy_app", database, "SELECT 1;",
                                      "isolated-runtime-only", tcp=True, check=False)
                if ready.returncode == 0 and ready.stdout.strip() == "1":
                    break
                time.sleep(1)
            else:
                self.fail("Isolated bootstrap PostgreSQL did not become ready over TCP")
            self.assertEqual(run("fantasy_app", database, "SELECT oid FROM pg_roles WHERE rolname=current_user;").stdout.strip(), "10")
            run("fantasy_app", database, '''CREATE TABLE "AuthRateLimit" (id text primary key, action text, "subjectHash" text, "failedCount" int default 0);
CREATE TABLE "_prisma_migrations" (migration_name text);
CREATE TYPE public.audit_enum AS ENUM ('A','B');''')
            runtime_url = f"postgresql://fantasy_app:isolated-runtime-only@localhost/{database}"
            operator_url = f"postgresql://fantasy_operator:isolated-operator-only@localhost/{database}"
            migration_url = f"postgresql://fantasy_migrator:isolated-migration-only@localhost/{database}"
            roles.apply_roles(container, database, runtime_url, operator_url, migration_url)
            roles.verify(container, database, runtime_url, operator_url)
            self.assertEqual(run("fantasy_app", database, "SELECT oid=10 FROM pg_roles WHERE rolname='fantasy_operator'; SELECT count(*) FROM pg_roles WHERE rolname='fantasy_role_transition';").stdout.strip(), "t\n0")
            run("fantasy_migrator", database, "CREATE TABLE public.audit_future (id serial primary key, value audit_enum);")
            run("fantasy_app", database, "BEGIN; INSERT INTO public.audit_future(value) VALUES ('A'); ROLLBACK;")
            roles.apply_roles(container, database, runtime_url, operator_url, migration_url)
            roles.verify(container, database, runtime_url, operator_url)
        finally:
            details = json.loads(subprocess.check_output(["docker", "inspect", container]))[0]
            self.assertEqual(details["Config"]["Labels"].get("purpose"), "audit-regression")
            subprocess.run(["docker", "rm", "-f", container], check=True, capture_output=True)


if __name__ == "__main__":
    unittest.main()
