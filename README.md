# NodeValt

Daemon/CLI local para reduzir duplicacao de `node_modules` entre projetos Node.js.

Site: https://victorazesc.github.io/nodevalt/

Suporte atual:

- macOS: suportado.
- Linux e Windows: ainda nao suportados oficialmente.

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

Instalacao global via GitHub no macOS:

```bash
npm install -g https://github.com/victorazesc/nodevalt/archive/refs/heads/main.tar.gz
nodevalt init
nodevalt daemon install
nodevalt daemon status
```

Daemon automatico:

```bash
npm run dev -- daemon start
```

Ao iniciar, ele escaneia os paths configurados, materializa projetos npm/yarn que ja possuem `node_modules` na raiz, troca o `node_modules` real por uma arvore local gerenciada com hardlinks/copia e backup, observa mudancas em `package.json`/lockfile e repete o scan a cada 60s.

Opcoes:

```bash
npm run dev -- daemon start --path ~/projetos --scan-interval 30
npm run dev -- daemon start --no-auto-materialize
```

Rodando como observer do macOS:

```bash
npm run build
npm run dev -- daemon install
npm run dev -- daemon status
npm run dev -- daemon uninstall
```
