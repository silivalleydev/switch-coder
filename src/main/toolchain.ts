import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'fs'
import { join, delimiter } from 'path'

/**
 * Bundled toolchain for machines with nothing installed (and for the Mac App Store sandbox):
 * `node` = Electron's own runtime (ELECTRON_RUN_AS_NODE), `npm`/`npx` = the bundled npm package.
 * Wrappers are generated into the writable app data dir and prepended to PATH for child processes.
 */
const binDir = () => join(app.getPath('userData'), 'bin')
const npmCli = () => { const rel = join('node_modules', 'npm', 'bin'); const dev = join(app.getAppPath(), rel); return existsSync(dev) ? dev : join(process.resourcesPath, 'app.asar.unpacked', rel) }

export function ensureToolchain(): string {
  const dir = binDir(); mkdirSync(dir, { recursive: true })
  const exe = process.execPath; const npmBin = npmCli()
  if (process.platform === 'win32') {
    const w = (name: string, body: string) => writeFileSync(join(dir, name + '.cmd'), body)
    w('node', `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${exe}" %*\r\n`)
    w('npm', `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${exe}" "${join(npmBin, 'npm-cli.js')}" %*\r\n`)
    w('npx', `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${exe}" "${join(npmBin, 'npx-cli.js')}" %*\r\n`)
  } else {
    const w = (name: string, body: string) => { const p = join(dir, name); writeFileSync(p, body); chmodSync(p, 0o755) }
    w('node', `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${exe}" "$@"\n`)
    w('npm', `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${exe}" "${join(npmBin, 'npm-cli.js')}" "$@"\n`)
    w('npx', `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${exe}" "${join(npmBin, 'npx-cli.js')}" "$@"\n`)
  }
  return dir
}

/** Environment for child processes: bundled tools first, npm state kept inside the app container (sandbox-safe). */
export function toolchainEnv(): NodeJS.ProcessEnv {
  const dir = ensureToolchain()
  const data = app.getPath('userData')
  const cache = join(data, 'npm-cache'); mkdirSync(cache, { recursive: true })
  const systemPath = process.env.PATH ?? (process.platform === 'win32' ? '' : '/usr/bin:/bin:/usr/sbin:/sbin')
  return {
    PATH: [dir, systemPath, '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean).join(delimiter),
    npm_config_cache: cache,
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
    npm_config_loglevel: 'warn',
    npm_config_yes: 'true',
    NPM_CONFIG_USERCONFIG: join(data, 'npmrc'),
    XDG_CONFIG_HOME: join(data, 'xdg'),
    HOME: process.env.HOME,
  }
}
