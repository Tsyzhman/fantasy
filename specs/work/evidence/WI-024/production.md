# WI-024 production 0.3.75

- Commit: `571946036223be2689bebff730bed8a19273ab5e`
- Release: `20260916T152502Z-v0.3.75-5719460`
- Image: `sha256:19800a3f23032f0542c0c304426bfee025ef7f4d8463aa48b4a1fa3862f5f081`
- GitHub Actions `Deploy Production` 35113348204 and 35114283581 failed at artifact upload (quota). Deleted 83 stale artifacts (~1.08 GiB); GitHub still refused new uploads until 6–12h recalculation.
- Promoted with the same immutable archive and `scripts/deploy-production-docker.sh` over SSH Host `deploy`.

## Before
- Health: 0.3.74 / `5ce0976394b11b7d11f36eb982364c9cd36c8da9`
- Contest: `42|2026/2027|3`, `73|2026/2027|2`

## After
- Health: `{"status":"ok","release":{"version":"0.3.75","commit":"571946036223be2689bebff730bed8a19273ab5e"}}`
- Symlink, image labels and `/api/health` commit match.
- Contest: `42|2026/2027|3`, `73|2026/2027|3`
- Migration `20260916120000_europa_three_players_per_club` finished.
- web/worker healthy, restarts=0. Memory after swap: web 205.4 MiB, worker 744 MiB, postgres 1.2 GiB.
