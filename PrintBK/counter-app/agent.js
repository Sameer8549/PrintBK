'use strict';
const dns = require('dns');
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {}
process.env.DESKTOP_SUPERVISED = 'true';
require('./dist/agent/worker.js');
