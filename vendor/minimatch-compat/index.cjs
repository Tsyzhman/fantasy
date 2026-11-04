/** @spec spec://common/INFRA-006-continuous-deployment#runtime */
"use strict";

const upstream = require("minimatch-v11");

// glob 7 uses _glob to decide whether a wildcard may include dot files.
// v11's nonrecursive Matcher supports test(), but glob 7 calls String#match.
class Minimatch extends upstream.Minimatch {
  parse(pattern) {
    const part = super.parse(pattern);
    if (part && typeof part === "object") {
      part._glob = pattern;
      part[Symbol.match] = value => part.test(value) ? [value] : null;
    }
    return part;
  }
}

module.exports = Object.assign(
  (path, pattern, options) => upstream.minimatch(path, pattern, options),
  upstream,
  { Minimatch }
);
