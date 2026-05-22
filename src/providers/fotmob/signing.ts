import { createHash } from "node:crypto";

// FotMob signs `/api/data/*` requests with an `x-mas` header. The signature
// is `MD5(JSON(body) + secretLyrics).toUpperCase()` where
//   body = { url, code, foo }
//   url  = request path+query (e.g. "/api/data/matchDetails?matchId=1")
//   code = Date.now() in ms
//   foo  = current FotMob deploy marker, e.g. "production:<sha>"
// Final header = base64(JSON({body, signature}))
//
// Decoded from the live JS bundle: I=function(e){var n={url:e,code:Date.now(),
// foo:"production:..."}, o=md5(JSON.stringify(n)+lyrics).toUpperCase(); return
// btoa(JSON.stringify({body:n,signature:o}))}.
//
// The lyrics constant must have no leading/trailing newlines; internal blank
// lines DO contribute to the hash. Use unix LF endings — Windows CRLF in this
// source file would break the hash on Linux containers.
//
// The deploy marker rotates with each FotMob deploy. Override at runtime via
// MACHETE_FOTMOB_DEPLOY_ID. To discover the current value:
//   curl -sI https://www.fotmob.com/api/data/leagues?id=47 | grep x-client-version
const SECRET_LYRICS = `[Spoken Intro: Alan Hansen & Trevor Brooking]
I think it's bad news for the English game
We're not creative enough, and we're not positive enough

[Refrain: Ian Broudie & Jimmy Hill]
It's coming home, it's coming home, it's coming
Football's coming home (We'll go on getting bad results)
It's coming home, it's coming home, it's coming
Football's coming home
It's coming home, it's coming home, it's coming
Football's coming home
It's coming home, it's coming home, it's coming
Football's coming home

[Verse 1: Frank Skinner]
Everyone seems to know the score, they've seen it all before
They just know, they're so sure
That England's gonna throw it away, gonna blow it away
But I know they can play, 'cause I remember

[Chorus: All]
Three lions on a shirt
Jules Rimet still gleaming
Thirty years of hurt
Never stopped me dreaming

[Verse 2: David Baddiel]
So many jokes, so many sneers
But all those "Oh, so near"s wear you down through the years
But I still see that tackle by Moore and when Lineker scored
Bobby belting the ball, and Nobby dancing

[Chorus: All]
Three lions on a shirt
Jules Rimet still gleaming
Thirty years of hurt
Never stopped me dreaming

[Bridge]
England have done it, in the last minute of extra time!
What a save, Gordon Banks!
Good old England, England that couldn't play football!
England have got it in the bag!
I know that was then, but it could be again

[Refrain: Ian Broudie]
It's coming home, it's coming
Football's coming home
It's coming home, it's coming home, it's coming
Football's coming home
(England have done it!)
It's coming home, it's coming home, it's coming
Football's coming home
It's coming home, it's coming home, it's coming
Football's coming home
[Chorus: All]
(It's coming home) Three lions on a shirt
(It's coming home, it's coming) Jules Rimet still gleaming
(Football's coming home
It's coming home) Thirty years of hurt
(It's coming home, it's coming) Never stopped me dreaming
(Football's coming home
It's coming home) Three lions on a shirt
(It's coming home, it's coming) Jules Rimet still gleaming
(Football's coming home
It's coming home) Thirty years of hurt
(It's coming home, it's coming) Never stopped me dreaming
(Football's coming home
It's coming home) Three lions on a shirt
(It's coming home, it's coming) Jules Rimet still gleaming
(Football's coming home
It's coming home) Thirty years of hurt
(It's coming home, it's coming) Never stopped me dreaming
(Football's coming home)`.replace(/\r\n/g, "\n");

const DEFAULT_DEPLOY_ID = "production:dbfd6d0c36fcd14bbcd5815cea66cd4b005b6a98";

function deployId(): string {
  return process.env.MACHETE_FOTMOB_DEPLOY_ID || DEFAULT_DEPLOY_ID;
}

export function createXMasHeader(pathWithQuery: string, now: number = Date.now()): string {
  const body = { url: pathWithQuery, code: now, foo: deployId() };
  const signature = createHash("md5")
    .update(`${JSON.stringify(body)}${SECRET_LYRICS}`)
    .digest("hex")
    .toUpperCase();
  return Buffer.from(JSON.stringify({ body, signature })).toString("base64");
}

export function xMasSigningPath(url: URL | string): string {
  const parsed = typeof url === "string" ? new URL(url) : url;
  return `${parsed.pathname}${parsed.search}`;
}
