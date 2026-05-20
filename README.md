# NodeValt

Daemon/CLI local para reduzir duplicacao de `node_modules` entre projetos Node.js.

MVP atual:

- `nodevalt init`
- `nodevalt scan <path>`
- `nodevalt status`
- parser de `package-lock.json` v2/v3

```bash
npm install
npm run build
npm run dev -- init
npm run dev -- scan ~/projects
npm run dev -- status
```
