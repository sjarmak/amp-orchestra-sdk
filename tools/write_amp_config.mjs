#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const key = process.env.AMP_API_KEY || process.env.AMP_TOKEN
if (!key) {
  process.stderr.write('AMP_API_KEY not set in environment\n')
  process.exit(1)
}
const dir = path.join(os.homedir(), 'Library', 'Application Support', 'ampsm')
fs.mkdirSync(dir, { recursive: true })
const file = path.join(dir, 'config.json')
let existing = {}
try { existing = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
existing.amp_env = existing.amp_env || {}
existing.amp_env.AMP_API_KEY = key
fs.writeFileSync(file, JSON.stringify(existing, null, 2))
