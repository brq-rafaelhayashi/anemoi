# Tangerina Browser Support Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar no pacote Web Components do Tangerina a matriz versionada de browsers que o Anemoi deve executar para emitir um Gate de Confiabilidade.

**Architecture:** O Tangerina publica um JSON pequeno, estável e independente de ferramentas dentro de `packages/components`; o arquivo entra no pacote npm. O Anemoi apenas valida e executa essa política. Este plano é o pré-requisito externo de `2026-07-18-playwright-test-confiabilidade-comportamental.md`.

**Tech Stack:** JSON, npm package files, pnpm >= 9, Node.js 24.13.1.

## Global Constraints

- Executar no repositório `tangerina-web-core`, em worktree próprio criado com `superpowers:using-git-worktrees`.
- Não adicionar dependência do Tangerina ao Anemoi nem usar o nome Anemoi no schema.
- O schema inicial é exatamente `schemaVersion: 1`.
- Browsers obrigatórios iniciais: `chromium`, `firefox`, `webkit`.
- Browsers opcionais iniciais: nenhum.
- O arquivo deve ser publicado pelo pacote `@gol-smiles/tangerina-web-core`.
- Antes de editar, o shell do worktree deve honrar `.nvmrc`; parar se `node` não for 24.13.1
  ou se `pnpm` não iniciar. No checkout atual, `/opt/homebrew/bin/node` 25.6.1 está quebrado
  por `llhttp`, portanto ele não pode ser usado para executar este plano.

---

### Task 1: Publicar a matriz no pacote de componentes

**Files:**
- Create: `packages/components/browser-support.json`
- Modify: `packages/components/package.json`

**Interfaces:**
- Consumes: nenhuma interface de código.
- Produces: `packages/components/browser-support.json` com `{schemaVersion: 1, required: BrowserName[], optional: BrowserName[]}`, onde `BrowserName` pertence a `chromium | firefox | webkit`.

- [ ] **Step 1: Validar o runtime antes de qualquer edição**

Após ativar o `.nvmrc` com o gerenciador Node disponível no ambiente:

```bash
command -v node
node --version
pnpm --version
```

Expected: `node` aponta para o runtime Node 24.13.1, `node --version` imprime `v24.13.1` e
`pnpm --version` imprime uma versão `>=9`. Se aparecer erro `dyld`/`llhttp`, interromper sem
editar o Tangerina e corrigir a seleção do runtime fora deste plano.

- [ ] **Step 2: Criar a matriz versionada**

Criar `packages/components/browser-support.json`:

```json
{
  "schemaVersion": 1,
  "required": [
    "chromium",
    "firefox",
    "webkit"
  ],
  "optional": []
}
```

- [ ] **Step 3: Incluir o contrato no pacote publicado**

Em `packages/components/package.json`, acrescentar `browser-support.json` ao array `files`:

```json
"files": [
  "dist",
  "loader",
  "register.js",
  "register-lazy.js",
  "custom-elements.json",
  "browser-support.json"
]
```

- [ ] **Step 4: Validar schema e conteúdo**

Run:

```bash
jq -e '
  .schemaVersion == 1 and
  .required == ["chromium", "firefox", "webkit"] and
  .optional == []
' packages/components/browser-support.json
```

Expected: exit `0` e saída `true`.

- [ ] **Step 5: Verificar que o pacote inclui o arquivo**

Run:

```bash
(
  cd packages/components
  npm pack --dry-run --json
) | jq -e '.[0].files | any(.path == "browser-support.json")'
```

Expected: exit `0` e saída `true`. Usar `npm pack --dry-run` aqui mantém a verificação
compatível com pnpm 9; [`pnpm pack --dry-run`](https://pnpm.io/cli/pack#--dry-run) só existe
a partir do pnpm 10.26.

- [ ] **Step 6: Rodar o typecheck do pacote**

Run:

```bash
pnpm --filter @gol-smiles/tangerina-web-core typecheck
```

Expected: exit `0`.

- [ ] **Step 7: Commit**

```bash
git add packages/components/browser-support.json packages/components/package.json
git commit -m "feat(components): publish browser support matrix"
```
