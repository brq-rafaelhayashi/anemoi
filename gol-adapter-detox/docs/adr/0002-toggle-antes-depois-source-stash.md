# Toggle Antes/Depois: Modo Source + git stash do componente

## Status

accepted

## Contexto

O app tem dois modos de execução (`TANGERINA_MODE`): `package` (pacote `6.0.2` + patch) e `source` (Metro resolve o core no `src/` do repo DS local). O caminho óbvio para "antes/depois" seria o comando `com/sem` que já existe — rodar em `package` vs `source`.

Mas a verificação do git mostrou dois confundidores:
1. **Drift de versão**: o source do DS está em `6.0.5`; o app consome `6.0.2`. `package vs source` carrega o diff 6.0.2→6.0.5, não só a correção.
2. **Edições em massa**: o `src/` do DS tem ~16 componentes modificados na working tree ao mesmo tempo (ports em andamento). `source` mostra todos, não só o componente do card.

A correção que se quer provar **é exatamente a working tree do repo DS** — verificado em `InputCounter`: `git diff HEAD` é o próprio hunk de a11y, e `HEAD` é o baseline sem ele.

## Decisão

Capturar **Antes e Depois ambos em Modo Source**, alternando por **git no repo DS, escopado aos arquivos do Componente da Branch**:

1. Capturar **Depois primeiro** (working tree as-is = fix portado).
2. `git stash push -- <arquivos do componente>` → Fast Refresh → capturar **Antes** (baseline = `HEAD` sem o fix).
3. `git stash pop` → restaura o port.

Mesma versão 6.0.5 nos dois lados → zero drift; isola só a edição do componente.

## Consequências

- **Crash-safety obrigatória**: os arquivos são trabalho NÃO commitado e o histórico do DS é um único commit "init". Usar `git checkout HEAD -- <arquivo>` destruiria o port sem recuperação. Por isso: Depois primeiro, stash (não checkout), e detecção de stash órfão no início de cada execução para recuperar de uma queda no meio do ciclo.
- **Self-check de validade por card**: antes de capturar, rodar `git diff HEAD -- src/components/<Componente>`. Se vier vazio (ou se HEAD já tiver as props), o toggle é inválido para aquele card — abortar com aviso, porque Antes ≈ Depois.
- **Honestidade na evidência**: isto prova "o port corrige o bug no source 6.0.5", não "reproduz o bug exato shippado no 6.0.2". Declarar no bundle para a QA não estranhar diferença de baseline.
- O comando `com/sem` (package vs source) continua útil para validar **paridade** patch≡source no fluxo de cleanup (gol-ds-create-pr), não para o antes/depois do fix.
