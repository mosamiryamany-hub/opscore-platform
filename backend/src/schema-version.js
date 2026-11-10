'use strict';

// Shared schema metadata must stay independent of the local SQLite adapter so
// PostgreSQL runtime imports never load node:sqlite just to read this constant.
const CURRENT_SCHEMA_VERSION = 28;

module.exports = { CURRENT_SCHEMA_VERSION };
