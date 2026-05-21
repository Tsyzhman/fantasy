import { createHash } from "node:crypto";

// FotMob signs `/api/data/*` requests with an `x-mas` header. The signature is
// `MD5(JSON(body) + secretLyrics).toUpperCase()` where
// `body = {url, code, foo}`, `url` is the absolute request URL,
// `code` is `Date.now()`, `foo` is FotMob's current deploy marker, and the
// secret is the Three Lions lyrics below. The
// final header is `base64(JSON({body, signature}))`.
//
// The lyrics constant must have no leading or trailing newline; the internal
// blank lines DO contribute to the hash and must be preserved verbatim.
// Rotate the constant if FotMob switches secrets again.
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
(Football's coming home)`;

const SIGNING_FOO = "production:dbfd6d0c36fcd14bbcd5815cea66cd4b005b6a98";

export function createXMasHeader(absoluteUrl: string, now: number = Date.now()): string {
  const body = { url: absoluteUrl, code: now, foo: SIGNING_FOO };
  const signature = createHash("md5")
    .update(`${JSON.stringify(body)}${SECRET_LYRICS}`)
    .digest("hex")
    .toUpperCase();
  return Buffer.from(JSON.stringify({ body, signature })).toString("base64");
}

export function xMasSigningUrl(url: URL | string): string {
  const parsed = typeof url === "string" ? new URL(url) : url;
  return parsed.toString();
}
