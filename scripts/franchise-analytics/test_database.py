"""@spec spec://modules/franchises/FEAT-005-franchise-analytics#data"""
import unittest
from database import postgres_environment

class DatabaseEnvironmentTest(unittest.TestCase):
 def test_prisma_url_becomes_libpq_fields(self):
  source={'DATABASE_URL':'postgresql://user%40test:p%3Ass%40word@postgres:5433/fantasy%2Dtest?connection_limit=4&schema=public&sslmode=require','PGHOSTADDR':'127.0.0.1','PGSERVICE':'stale'}
  env=postgres_environment(source)
  self.assertEqual((env['PGHOST'],env['PGPORT'],env['PGDATABASE']),('postgres','5433','fantasy-test'))
  self.assertEqual((env['PGUSER'],env['PGPASSWORD']),('user@test','p:ss@word'))
  self.assertEqual(env['PGSSLMODE'],'require')
  self.assertNotIn('PGHOSTADDR',env)
  self.assertNotIn('PGSERVICE',env)
  self.assertEqual(source['PGHOSTADDR'],'127.0.0.1')
 def test_ipv6_and_no_password(self):
  env=postgres_environment({'DATABASE_URL':'postgres://user@[::1]/test','PGPASSWORD':'stale'})
  self.assertEqual(env['PGHOST'],'::1')
  self.assertEqual(env['PGPORT'],'5432')
  self.assertNotIn('PGPASSWORD',env)
 def test_invalid_url_never_exposes_secret(self):
  with self.assertRaisesRegex(ValueError,'must identify'):
   postgres_environment({'DATABASE_URL':'https://user:secret@example.com/data'})

if __name__=='__main__':unittest.main()
