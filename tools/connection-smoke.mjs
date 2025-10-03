#!/usr/bin/env node
import { EnhancedAmpClient } from '../packages/amp-client/dist/enhanced-client.js'

async function main() {
  const ampCliPath = process.env.AMP_CLI_PATH || 'production'
  const client = new EnhancedAmpClient({
    runtimeConfig: { ampCliPath },
    env: process.env,
  })
  await client.initialize()
  client.on('streaming-event', (ev) => {
    if (ev?.type === 'connection-info') {
      console.log('[connection-info]', JSON.stringify(ev))
    }
    if (ev?.type === 'token') {
      process.stdout.write(ev.data?.content || '')
    }
  })
  const res = await client.runIteration('/whoami', process.cwd(), undefined)
  console.log('\n[result]', JSON.stringify(res))
}

main().catch((e) => {
  console.error('ERROR', e?.message || e)
  process.exit(1)
})
