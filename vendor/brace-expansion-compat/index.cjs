"use strict";

const upstream = require("brace-expansion-v5");
const expand = typeof upstream === "function" ? upstream : upstream.expand;

if (typeof expand !== "function") {
  throw new TypeError("brace-expansion 5 compatibility adapter could not find expand().");
}

module.exports = expand;
module.exports.expand = expand;
module.exports.EXPANSION_MAX = upstream.EXPANSION_MAX;
module.exports.EXPANSION_MAX_LENGTH = upstream.EXPANSION_MAX_LENGTH;
