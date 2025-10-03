#!/usr/bin/env node
import process from 'node:process';

const out = {
  argv: process.argv.slice(2),
  env: {
    AMP_TOOLBOX: process.env.AMP_TOOLBOX || null,
    AMP_EXPERIMENTAL_AGENT_MODE: process.env.AMP_EXPERIMENTAL_AGENT_MODE || null,
    PATH: process.env.PATH || null,
  }
};
console.log(JSON.stringify(out));
