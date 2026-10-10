#!/usr/bin/env python3
"""@spec spec://common/INFRA-006-continuous-deployment#data
Keep application credentials unchanged. Store migration/operator secrets on host only.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
from urllib.parse import unquote, urlsplit, urlunsplit


def execute(container, user, database, sql, password=None, tcp=False, check=True):
    args = ["docker", "exec", "-i"]
    if password:
        args += ["-e", "PGPASSWORD"]
    args += [container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", database]
    if tcp:
        args += ["-h", "127.0.0.1"]
    result = subprocess.run(args, input=sql, text=True, capture_output=True,
                            env={**os.environ, **({"PGPASSWORD": password} if password else {})}, timeout=120)
    if check and result.returncode:
        # Do not copy query text/parameters or passwords from PostgreSQL diagnostics.
        raise RuntimeError(f"Database role operation failed (exit {result.returncode}); review protected server diagnostics")
    return result


def protected_url(path, runtime_url, username):
    if path.exists():
        if path.stat().st_mode & 0o077:
            raise ValueError("Database credential file must be mode 600")
        value = path.read_text().strip().removeprefix("DATABASE_URL=")
        if urlsplit(value).username != username:
            raise ValueError("Protected database credential has an unexpected identity")
        return value
    original = urlsplit(runtime_url)
    hostname = original.hostname
    if not hostname or original.username != "fantasy_app" or not original.password:
        raise ValueError("Expected the existing application database URL")
    netloc = f"{username}:{secrets.token_hex(32)}@{hostname}:{original.port or 5432}"
    value = urlunsplit((original.scheme, netloc, original.path, original.query, original.fragment))
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write("DATABASE_URL=" + value + "\n")
        stream.flush()
        os.fsync(stream.fileno())
    return value


def verify(container, database, runtime_url, operator_url):
    runtime = urlsplit(runtime_url)
    operator = urlsplit(operator_url)
    execute(container, "fantasy_operator", database, "SELECT 1;", unquote(operator.password), tcp=True)
    attrs = execute(container, "fantasy_app", database,
                    "SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=current_user;",
                    unquote(runtime.password), tcp=True).stdout.strip()
    if attrs != "f|f|f|f|f":
        raise RuntimeError("Runtime role attributes are not restricted")
    execute(container, "fantasy_app", database, '''BEGIN;
INSERT INTO "AuthRateLimit" (id,action,"subjectHash") VALUES ('audit-role-probe','ROLE_PROBE','audit-role-probe');
UPDATE "AuthRateLimit" SET "failedCount"=1 WHERE id='audit-role-probe';
SELECT "failedCount" FROM "AuthRateLimit" WHERE id='audit-role-probe';
DELETE FROM "AuthRateLimit" WHERE id='audit-role-probe'; ROLLBACK;''', unquote(runtime.password), tcp=True)
    probes = {
        "create_table": 'CREATE TABLE public.audit_forbidden (id int)',
        "create_database": 'CREATE DATABASE audit_forbidden',
        "create_role": 'CREATE ROLE audit_forbidden',
        "truncate": 'TRUNCATE TABLE "AuthRateLimit"',
        "migration_write": 'DELETE FROM "_prisma_migrations" WHERE false',
        "admin_membership": 'SET ROLE fantasy_operator',
    }
    for name, sql in probes.items():
        result = execute(container, "fantasy_app", database,
                         "\\set VERBOSITY sqlstate\n" + sql + ";", unquote(runtime.password), tcp=True, check=False)
        if result.returncode == 0 or "42501" not in result.stderr:
            raise RuntimeError(f"Expected permission denial for {name}")
    print(json.dumps({"runtime": "fantasy_app", "attributes": [False] * 5,
                      "crud": "passed and rolled back", "negativePermissions": list(probes),
                      "operatorTcpLogin": "passed", "credentials": "protected host files only"}))


def apply_roles(container, database, runtime_url, operator_url, migration_url):
    state = execute(container, "fantasy_app", database,
                    "SELECT oid=10 FROM pg_roles WHERE rolname='fantasy_app'; SELECT count(*) FROM pg_roles WHERE rolname='fantasy_operator';").stdout.strip().splitlines()
    bootstrap = state[0] == "t"
    exists = state[1] == "1"
    transition = "fantasy_role_transition"
    sql = Path(__file__).with_name("runtime-database-roles.sql").read_text()
    def literal(value):
        return "'" + unquote(value).replace("'", "''") + "'"
    prefix = "\\set operator_password " + literal(urlsplit(operator_url).password) + "\n"
    prefix += "\\set migration_password " + literal(urlsplit(migration_url).password) + "\n"
    prefix += "\\set runtime_password " + literal(urlsplit(runtime_url).password) + "\n"
    if bootstrap:
        # PostgreSQL 16 forbids demoting OID 10. A short separate session renames
        # it to the protected operator and creates the same runtime login anew.
        transition_password = secrets.token_hex(32)
        prepare = "BEGIN; SELECT 'CREATE ROLE fantasy_role_transition LOGIN SUPERUSER' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='fantasy_role_transition') \\gexec\n"
        prepare += "ALTER ROLE fantasy_role_transition LOGIN SUPERUSER PASSWORD '" + transition_password + "'; COMMIT;"
        execute(container, "fantasy_app", database, prepare)
        try:
            execute(container, transition, database, prefix + sql, transition_password, tcp=True)
        finally:
            # On rollback the original bootstrap remains available. On success
            # the renamed operator has already received its protected password.
            cleanup_user = "fantasy_operator" if execute(container, "fantasy_app", database,
                "SELECT count(*) FROM pg_roles WHERE rolname='fantasy_operator';").stdout.strip() == "1" else "fantasy_app"
            execute(container, cleanup_user, database, "DROP ROLE IF EXISTS fantasy_role_transition;")
    else:
        execute(container, "fantasy_operator" if exists else "fantasy_app", database, prefix + sql)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", default="fantasy-scout-postgres")
    parser.add_argument("--web", default="fantasy-scout-web")
    parser.add_argument("--database", default="fantasy_scout")
    parser.add_argument("--config-dir", type=Path, default=Path("/home/deploy/.config/fantasy-scout"))
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    result = subprocess.run(["docker", "inspect", args.web], check=True, capture_output=True, text=True)
    env = json.loads(result.stdout)[0]["Config"]["Env"]
    runtime_url = next(value.split("=", 1)[1] for value in env if value.startswith("DATABASE_URL="))
    if urlsplit(runtime_url).path != "/" + args.database:
        raise ValueError("Runtime database differs from the selected target")
    args.config_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    operator_url = protected_url(args.config_dir / "database-operator.env", runtime_url, "fantasy_operator")
    migration_url = protected_url(args.config_dir / "database-migration.env", runtime_url, "fantasy_migrator")
    if not args.verify_only:
        apply_roles(args.container, args.database, runtime_url, operator_url, migration_url)
    execute(args.container, "fantasy_migrator", args.database, "SELECT 1;", unquote(urlsplit(migration_url).password), tcp=True)
    verify(args.container, args.database, runtime_url, operator_url)


if __name__ == "__main__":
    main()
