# Deployment

Production checkout path:

```bash
cd /var/www/fantasy
```

Update production from `main`:

```bash
cd /var/www/fantasy
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
