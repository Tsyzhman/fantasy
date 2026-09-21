"""libpq connection environment. @spec spec://modules/franchises/FEAT-005-franchise-analytics#data"""
from urllib.parse import urlsplit,unquote,parse_qsl

def postgres_environment(environ):
 """PGDATABASE is a database name, not a Prisma URL; keep credentials off argv."""
 result=dict(environ)
 connection=urlsplit(environ['DATABASE_URL'])
 if connection.scheme not in ('postgresql','postgres') or not connection.hostname or not connection.path.lstrip('/'):
  raise ValueError('DATABASE_URL must identify a PostgreSQL host and database')
 for key in ('PGHOST','PGHOSTADDR','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSERVICE'):
  result.pop(key,None)
 result.update(PGHOST=unquote(connection.hostname),PGPORT=str(connection.port or 5432),PGDATABASE=unquote(connection.path.lstrip('/')))
 if connection.username is not None:result['PGUSER']=unquote(connection.username)
 if connection.password is not None:result['PGPASSWORD']=unquote(connection.password)
 options={'sslmode':'PGSSLMODE','sslrootcert':'PGSSLROOTCERT','sslcert':'PGSSLCERT','sslkey':'PGSSLKEY','connect_timeout':'PGCONNECT_TIMEOUT','application_name':'PGAPPNAME'}
 for key,value in parse_qsl(connection.query):
  if key in options:result[options[key]]=value
 result.setdefault('PGCONNECT_TIMEOUT','15')
 return result
