// Copy logos and app icons from brand/ (the source of truth) into the app before dev/build.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = join(dirname(fileURLToPath(import.meta.url)), '..')
const logo = join(web, '..', '..', 'brand', 'logo')
mkdirSync(join(web, 'public', 'brand'), { recursive: true })
for (const f of [
  'qrfinity-logo.svg',
  'qrfinity-logo-reversed.svg',
  'qrfinity-mark.svg',
  'qrfinity-mark-reversed.svg',
]) {
  copyFileSync(join(logo, f), join(web, 'public', 'brand', f))
}
copyFileSync(join(logo, 'qrfinity-app-icon.svg'), join(web, 'app', 'icon.svg'))
copyFileSync(join(logo, 'qrfinity-app-icon-180.png'), join(web, 'app', 'apple-icon.png'))
