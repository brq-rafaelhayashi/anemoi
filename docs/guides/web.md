# Guia do Anemoi Web

Execute todos os comandos deste guia na raiz do repositório Anemoi. O checkout consumidor do
`tangerina-web-core` é apenas o alvo configurado; não execute o Anemoi a partir dele.

## Preparação

Use Node.js 24.13.1 e mantenha `node`, `npm` e `pnpm` no `PATH`. O runtime efetivo deve ser pnpm 9
ou superior. `packageManager` é opcional no consumidor; se estiver declarado, também deve indicar
pnpm 9 ou superior. Instale o Anemoi e configure um alias:

```bash
npm install
npm run web:configure -- --alias tangerina --repo /absolute/path/to/tangerina-web-core
npm run web -- --repo tangerina --doctor
```

O comando de configuração grava `.anemoi.local.json`, que é local e ignorado pelo Git. O primeiro
alias vira o padrão. Para alterar explicitamente o padrão:

```bash
npm run web:configure -- \
  --alias tangerina-local \
  --repo /absolute/path/to/another-tangerina-web-core \
  --default
```

Aliases aceitam letras minúsculas, números e hifens simples, começam por letra e não podem conter
hifens consecutivos. `--repo` aceita um alias configurado ou um caminho direto, absoluto ou relativo.
Sem `--repo`, o comando usa `defaultRepository`.

## Execução

Exemplo completo:

```bash
npm run web -- \
  --repo tangerina \
  --component tgr-button \
  --card CDCOM-123 \
  --frameworks wc,react,angular \
  --stories Primary,Disabled \
  --themes light,dark \
  --viewports sm,lg \
  --brands gol
```

Flags preservadas:

| Flag | Comportamento |
| --- | --- |
| `--repo <alias-ou-caminho>` | Seleciona o checkout consumidor; se omitido, usa o alias padrão. |
| `--component <nome>` | Componente obrigatório para captura, por exemplo `tgr-button`. |
| `--card <identificador>` | Segmento do output; o padrão é `sem-card`. |
| `--frameworks <lista>` | Lista separada por vírgulas; padrão `wc,react,angular`. Aceita `wc`, `react` e `angular`. |
| `--stories <lista>` | Filtra pelos nomes exatos das stories, separados por vírgulas. Sem a flag, usa todas as stories do componente. |
| `--themes <lista>` | Lista separada por vírgulas; padrão `light,dark`. |
| `--viewports <lista>` | Lista separada por vírgulas; padrão `sm,lg`. Valores disponíveis: `xs` 320 px, `sm` 360 px, `md` 768 px, `lg` 1024 px e `xl` 1440 px. |
| `--brands <lista>` | Lista separada por vírgulas; padrão `gol`. Valores disponíveis: `gol`, `smiles` e `clube-smiles`. |
| `--doctor` | Diagnostica identidade, scripts, pnpm, Storybook, artefatos WC/React/Angular e Chromium sem iniciar captura. |
| `--list-stories` | Faz o preflight e o build do Storybook, lista as stories encontradas para o componente e encerra sem capturar. |
| `--skip-build` | Reutiliza os artefatos dos seis builds do consumidor; os demais preflights e builds continuam ativos. |

Na configuração, `--alias`, `--repo` e o booleano `--default` acompanham o comando
`npm run web:configure`. O modo before/after não faz parte do fluxo suportado.

## Ordem automática de build

Antes de capturar, o Anemoi valida a versão efetiva de pnpm e executa no checkout consumidor, nesta
ordem:

1. `pnpm build:tokens`
2. `pnpm build:assets`
3. `pnpm build:fonts`
4. `pnpm build:components`
5. `pnpm build:react`
6. `pnpm build:angular`

Depois, o doctor valida os artefatos. O Anemoi constrói o Storybook estático do WC para descobrir as
stories, resolve os args CSF e constrói os harnesses React e Angular selecionados antes de capturar.
O Storybook é necessário mesmo quando a lista original de frameworks não contém WC.

`--skip-build` pula somente os seis comandos acima. A validação da versão de pnpm, o doctor, o build
do Storybook, os builds dos harnesses e a captura continuam. Portanto, use a flag apenas quando os
artefatos do consumidor já estiverem atualizados; ausência ou desatualização detectável ainda bloqueia
a execução.

Esses builds podem atualizar artefatos gerados conforme os scripts do Tangerina, mas o Anemoi nunca
executa operações Git no checkout consumidor.

## Estrutura do output

Cada run cria:

```text
<tangerina-web-core>/outputs/anemoi-web/<card>/<componente>/<timestamp>-<id>/
├── manifest.json
├── summary.md
├── index.html
├── logs/
│   └── tangerina/
├── build/
│   ├── wc/
│   ├── react/
│   └── angular/
├── wc/<brand>/<story>/<viewport>/<theme>.png
├── react/<brand>/<story>/<viewport>/<theme>.png
├── angular/<brand>/<story>/<viewport>/<theme>.png
└── diff/
    ├── react-vs-wc/
    └── angular-vs-wc/
```

No sucesso, `manifest.json` contém `tool: "Anemoi Web"`, `status: "passed"`, eixos, contagem de
células e grupos de paridade. `summary.md` resume o run. `index.html` usa caminhos relativos e pode
ser aberto offline para comparar WC, React e Angular lado a lado.

## Falhas

Se uma etapa falhar depois da criação do diretório do run, o Anemoi preserva um `manifest.json` com
`status: "failed"`, `stage`, mensagem de erro e `logPath`. O log relevante fica dentro de `logs/`.
Uma execução falha não publica `index.html`; se ele já existia, é removido.

Falhas anteriores à criação do run, como alias inexistente ou ausência de configuração, encerram com
mensagem acionável e não geram um manifesto. Corrija o item indicado e rode novamente.

## Interpretação da paridade

WC é sempre a linha de base visual. React e Angular recebem o mesmo conjunto serializável de
`meta.args + story.args`; cada screenshot desses wrappers é comparado à célula WC com a mesma brand,
story, viewport e theme.

- `mismatch: 0` significa paridade de pixels na região comparada.
- `mismatch > 0` indica divergência visual naquele wrapper e naquela célula; abra o PNG em `diff/` e
  a galeria para localizar o sinal.
- Uma divergência apenas em React ou Angular deve aparecer somente no comparativo desse wrapper.
- Se React ou Angular forem solicitados sem `wc`, o Anemoi inclui WC automaticamente para produzir a
  comparação.

Paridade zero comprova igualdade dos pixels capturados para a matriz executada; não substitui testes
de comportamento, acessibilidade ou estados que não foram selecionados.

### Limite de stories com render customizado

Os harnesses React e Angular reproduzem stories que podem ser descritas por `meta.args + story.args`
serializáveis. Um `render` CSF customizado que cria wrappers, conteúdo de light DOM ou slots não é
traduzido automaticamente para os outros frameworks. Nesses casos, a divergência pode representar uma
limitação do método, e não do componente. Até existir um contrato explícito para esse conteúdo, selecione
somente stories baseadas em args com `--stories` ao exigir paridade entre frameworks.
