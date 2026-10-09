# Initial investigation

Internet/forum search preceded implementation (Sports.ru, Reddit and Stack Overflow). Public Sports.ru landing pages are reachable but only state the transfer quota; they do not establish the club cap. The user's explicit instruction is authoritative for these four leagues. Do not confuse three transfers with three same-club players.

The shared ID matrix hardcodes 48 (Championship), 57 (Netherlands), 61 (Portugal), 71 (Turkey) as two. Both price writers use it. Current contest rows and cached Squad shell metadata must also be checked; changing the matrix alone cannot repair an already cached rule.

Correction reuses the existing league-ID matrix, a scoped current-season migration and current contest data already read by the shell. No replacement player cache, extra queries or timer is needed.
