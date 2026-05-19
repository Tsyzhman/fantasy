# Deployment

Production checkout path:

```bash
cd /var/www/fantasy-scout
```

Update production from `main`:

```bash
cd /var/www/fantasy-scout
git checkout main
git pull origin main
npm install
npm run build
pm2 restart fantasy
```

If the PM2 process has a different name, check it with:

```bash
pm2 list
```

If Next.js fails with a missing `.next/prerender-manifest.json`, rebuild in the
same directory used by PM2:

```bash
cd /var/www/fantasy-scout
npm run build
test -f .next/prerender-manifest.json && echo "build ok"
pm2 restart fantasy-scout --update-env
```
