#!/usr/bin/env python3
"""@spec spec://common/INFRA-006-continuous-deployment#observability
Apply the reviewed PostgreSQL budget and logging without restarting the database.
"""
import json
import subprocess


def main():
    container = "fantasy-scout-postgres"
    details = json.loads(subprocess.check_output(["docker", "inspect", container]))[0]
    logging = details["HostConfig"]["LogConfig"]
    if logging["Type"] != "json-file" or not logging["Config"].get("max-size") or not logging["Config"].get("max-file"):
        raise RuntimeError("PostgreSQL needs bounded Docker log retention before enabling query diagnostics")
    subprocess.run(["docker", "update", "--memory", "2g", "--memory-swap", "2g",
                    "--cpus", "2", "--pids-limit", "256", container], check=True, capture_output=True)
    sql = """ALTER SYSTEM SET log_min_duration_statement = '500ms';
ALTER SYSTEM SET log_temp_files = '10MB';
ALTER SYSTEM SET log_parameter_max_length = '0';
ALTER SYSTEM SET log_parameter_max_length_on_error = '0';
ALTER ROLE fantasy_migrator SET lock_timeout = '5s';
ALTER ROLE fantasy_migrator SET statement_timeout = '120s';
SELECT pg_reload_conf();
"""
    command = ["docker", "exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
               "-v", "ON_ERROR_STOP=1", "-U", "fantasy_operator", "-d", "fantasy_scout"]
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError("PostgreSQL online diagnostic configuration failed")
    verification = subprocess.check_output(command, input="SELECT json_object_agg(name,setting) FROM pg_settings WHERE name IN ('log_min_duration_statement','log_temp_files','log_parameter_max_length','log_parameter_max_length_on_error');", text=True)
    actual = json.loads(verification.strip())
    expected = {"log_min_duration_statement": "500", "log_temp_files": "10240",
                "log_parameter_max_length": "0", "log_parameter_max_length_on_error": "0"}
    if actual != expected:
        raise RuntimeError("PostgreSQL did not apply the reviewed diagnostic settings")
    print(json.dumps({"postgresBudget": {"memoryBytes": 2147483648, "cpus": 2, "pids": 256},
                      "logging": actual, "migrationTimeouts": {"lockSeconds": 5, "statementSeconds": 120},
                      "restart": False, "dockerLogRetention": logging}))


if __name__ == "__main__":
    main()
