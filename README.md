# NodeValt

Daemon/CLI local para reduzir duplicacao de `node_modules` entre projetos Node.js.

MVP atual:

- `nodevalt init`
- `nodevalt scan <path>`
- `nodevalt status`
- parser de `package-lock.json` v2/v3
- store global para pacotes npm resolvidos no lockfile

```bash
npm install
npm run build
npm run dev -- init
npm run dev -- scan ~/projects
npm run dev -- status
npm run dev -- store populate ./app
npm run dev -- materialize ./app
npm run dev -- restore ./app
npm run dev -- doctor ./app
npm run dev -- gc
npm run dev -- daemon start
```
