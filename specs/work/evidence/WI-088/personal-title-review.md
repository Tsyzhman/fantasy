# Personal round title review — 0.3.152

Candidate: `3e58a9f3d7d45fc9f26b815f9b9c33a80e2d4b65`. Canon action: none.

Before: a valid unfinished personal round titled `тур 4` aborted acquisition because the parser required a comma. Fresh source evidence confirms a real XI behind the current tour-ID-zero endpoint, not absent history.

After: one parser line accepts exactly the short title while retaining every previously accepted comma-prefixed title. Domain, path, team identity and competition consistency checks remain. The calendar continues to determine completion; no unfinished round is dropped or marked finished.

Root and the independent Sol 6.1 Max reviewer rejected an intermediate fullmatch because it unnecessarily rejected legacy comma titles containing newlines. The final re.match comma-or-strict-end form preserves compatibility. Independent checks passed five focused tests, 28 legacy variants and 14 invalid inputs. The author passed all 50 Python tests.

Approved source blob: `87b914cfda7326d9a6019c090ee2aa42405bef9f`; tests `74d348dc8b029bbcb1c95454a7d20b873cbb724d`; sanitized fixture `3287abeb26b194c858ef42fd4be1b65acb9419f7`. Source SHA-256: `aadae950bf2a0e0c230bd8d7dfc0cb9569b6bfcac9e53f76428fd761e5bf987c`.

The read-only rehearsal reconstructed exactly 820 submitted UIDs from 74 franchise pages, 734 forms and 803 profiles: no missing or extra UID. The candidate parsed all 820; old code rejected 578 current UEL4 links. All formerly valid 242 outputs were identical. It retained 7,512 team histories and 68,866 unique team-round pairs. Peak RSS 82,288,640 bytes; max/OOM events zero, no network/source writes, container removed. This proves parser coverage, not full calculation/import acceptance.

Root authorizes delivery of the exact candidate only after the canonical full CI/artifact checks pass. Full monitored refresh and publication acceptance remain open.
