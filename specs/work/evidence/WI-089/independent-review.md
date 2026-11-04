# Independent mobile sorting review

Root and the independent UI reviewer checked the working diff against FEAT-001.

- Shared desktop/mobile state, whole-filtered-pool sort before the first 18 cards, stable ties and null-last reuse the established comparator.
- Initial P2: when a source removed the active optional column, the UI said original order while rows retained the hidden sort. A small SSR/pure-function reproduction confirmed the mismatch. The author introduced one effective sort for all consumers, based on currently supported visible columns; empty filters retain the requested preference.
- Follow-up fixed: explicit column reset/hide now clears the requested sort even while that column is temporarily unavailable. Root inspected the final condition and the browser run covering temporary removal, Hide optional, restoration and Select all passed (six scenarios, six intentional viewport skips).
- Root visually inspected the Russian 320px light screenshot: controls fit the 296px content width, each control is 45px high. These are real component fixtures with the production stylesheet, not a full authenticated production screen.
- Existing production KHL price sorting at 390x844 works in both directions; evidence is in WI-084/khl-mobile-sort-before-release.json. No KHL code change is necessary for the reported football card gap.

The final browser evidence and runtime verification are recorded separately. No production squad or saved preference was changed for this review.
