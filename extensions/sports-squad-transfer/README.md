# Fantasy → Sports.ru

One WebExtension with separate packages for Chromium and Firefox.

How the transfer works:

1. The background part of the extension only reads the `fantasy_session` cookie for `fantasy.tsyzhman.ru`.
2. Via HTTPS, she receives the latest saved version of the roster for the open league.
3. The content script requests the current server lineup from Sports.ru, without using a local draft of replacements.
4. One atomic mutation Sports.ru records all 15 players, first team, captain, vice-captain and bench order.
5. After confirmation from Sports.ru, the page is updated and shows the saved lineup.

The session cookie is not transmitted to the content script and does not end up in the Sports.ru DOM.
The extension does not send telemetry. To execute the command it sends
session token back only to `fantasy.tsyzhman.ru`, and the selected squad is
only in the official Sports.ru API.

Assembly:

```powershell
npm run extension:build
```

Result:

- `output/browser-extension/chromium` - unpacked extension for Chrome/Edge;
- `output/browser-extension/firefox` - unpacked extension for Firefox;
- ZIP packages - in `public/downloads`.
