#!/usr/bin/env node

if (process.env.SHIPP_DAEMON_CHILD === '1') {
  // Running as daemon child — go straight to server
  require('../dist/index.js');
} else {
  // Running as CLI — dispatch subcommands
  const { runCli } = require('../dist/cli.js');
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
