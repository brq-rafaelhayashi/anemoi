# Guia do Anemoi Web

Execute todos os comandos deste guia na raiz do Anemoi. O checkout consumidor do
`tangerina-web-core` é somente o alvo configurado.

## Preparação

Use Node.js 24.13.1, npm com workspaces e pnpm 9 ou superior no `PATH`. Instale as dependências, os
três browsers da versão fixada do Playwright e configure o consumidor:

```bash
npm install
npx playwright install chromium firefox webkit
npm run web:configure -- --alias tangerina --repo /absolute/path/to/tangerina-web-core
npm run web -- --repo tangerina --doctor
```

O doctor valida a identidade do checkout, pnpm efetivo, scripts e artefatos do consumidor, a Matriz
de Suporte e Chromium, Firefox e WebKit. A configuração fica em `.anemoi.local.json`, arquivo local
ignorado pelo Git. O primeiro alias vira o padrão; para trocá-lo explicitamente:

```bash
npm run web:configure -- \
  --alias tangerina-local \
  --repo /absolute/path/to/another-tangerina-web-core \
  --default
```

## Execução confiável

O comando completo padrão executa todas as Cenas do contrato, nos eixos canônicos e nos três
browsers obrigatórios:

```bash
npm run web -- --repo tangerina --component tgr-button --card CDCOM-123
```

Antes de aceitar uma mudança deliberada na superfície pública, revise o fingerprint:

```bash
npm run web -- --repo tangerina --component tgr-button --review-contract
```

Esse comando mostra o diff canônico e exige confirmação explícita. Cenas, Roteiros, observações e o
fingerprint ficam em `packages/web/contracts/<consumidor>/<componente>/`; a Matriz de Suporte fica no
Tangerina em `packages/components/browser-support.json`.

### Flags públicas

| Flag | Comportamento |
| --- | --- |
| `--repo <alias-ou-caminho>` | Seleciona o checkout consumidor; sem a flag, usa o alias padrão. |
| `--component <nome>` | Componente obrigatório, por exemplo `tgr-button`. |
| `--card <identificador>` | Segmento do output; o padrão é `sem-card`. |
| `--stories <lista>` | Filtra Cenas pelo ID ou nome exato. Produz run diagnóstico. |
| `--themes <lista>` | Filtra temas; padrão confiável `light,dark`. Reduzir o eixo produz run diagnóstico. |
| `--viewports <lista>` | Filtra viewports; padrão confiável `sm,lg`. Valores conhecidos: `xs`, `sm`, `md`, `lg`, `xl`. |
| `--brands <lista>` | Filtra marcas; padrão confiável `gol`. |
| `--browsers <lista>` | Seleciona engines da Matriz de Suporte. Omitir browser obrigatório produz run diagnóstico. |
| `--doctor` | Diagnostica consumidor e browsers sem capturar. |
| `--list-stories` | Faz o preflight e lista as Cenas selecionadas sem executar a spec. |
| `--skip-build` | Reutiliza builds do consumidor; preflight, validações e builds dos harnesses continuam. |
| `--no-a11y` | Desliga Axe/ARIA e força run diagnóstico; não pode emitir gate confiável. |
| `--review-contract` | Revisa e, após confirmação, atualiza o fingerprint da superfície pública. |

`--frameworks`, `--fail-on-diff`, `--fail-on-a11y` e `--engine` pertenciam ao executor anterior e não
controlam o Gate de Confiabilidade. `--engine` é rejeitado explicitamente. O executor canônico sempre
avalia WC, React e Angular, e toda dimensão obrigatória participa do gate fail-closed.

Para investigar rapidamente uma engine sem confundir a execução com aprovação:

```bash
npm run web -- \
  --repo tangerina \
  --component tgr-button \
  --card DIAGNOSTICO-FIREFOX \
  --browsers firefox
```

O manifesto desse run terá `gate.status: "not-approved"` e `gate.trusted: false`, mesmo que todas as
dimensões executadas passem.

## Pipeline automático

O fluxo público é:

```text
preflight -> run-plan.json -> Playwright Test -> Resultados Atômicos -> finalizador
          -> manifest.json v2 + summary.md + index.html
```

1. O preflight valida a Matriz de Suporte, contrato, cobertura, fingerprint e superfície pública.
2. No consumidor, executa `build:tokens`, `build:assets`, `build:fonts`, `build:assets-react`,
   `build:assets-angular`, `build:components`, `build:react` e `build:angular`, salvo `--skip-build`.
3. Constrói os harnesses isolados de WC, React e Angular e publica `run-plan.json` uma única vez.
4. Playwright Test expande os projetos Chromium, Firefox e WebKit. Cada teste lógico representa uma
   Cena, ambiente e viewport em um browser; WC, React e Angular são steps internos.
5. Cada tentativa publica seu próprio Resultado Atômico de forma atômica e exclusiva em
   `results/<teste-logico>/attempt-<n>/result.json`. Evidências, traces e screenshots diagnósticos
   ficam escopados à mesma tentativa; workers não atualizam o manifesto.
6. O finalizador valida a completude exata contra o plano, consolida retries e publica o manifesto
   por último. Um run finalizado é imutável.

No CI existe um retry diagnóstico. `stable` significa que as tentativas concordam no resultado
substantivo; `flaky` significa que elas divergem e reprova a dimensão de estabilidade, mesmo que a
última tentativa passe. Uma falha determinística pode ser `stable` e ainda reprovar o gate pela prova
afetada e pelo status final da execução.

## Manifesto v2 e gate

`manifest.json` usa `schemaVersion: 2` e mantém separadas estas dimensões obrigatórias:

- `browserCoverage`: cobertura exata dos browsers obrigatórios do Tangerina;
- `visualParity`: pixels de React/Angular contra WC na mesma engine;
- `dimensions`: largura e altura contra WC na mesma engine;
- `axe`: violações WCAG coletadas em cada framework e browser;
- `ariaParity`: árvore ARIA de React/Angular contra WC na mesma engine;
- `behavioralConformance`: cada framework contra as expectativas do Contrato Comportamental;
- `behavioralParity`: igualdade das observações normalizadas de React/Angular contra WC;
- `contractCoverage`: todos os comportamentos obrigatórios cobertos pelos Roteiros;
- `stability`: execução completa, sem interrupções, lacunas de tentativas ou resultados flaky.

Uma dimensão obrigatória `failed` ou `unavailable` torna o gate `failed` e `trusted: false`. Um plano
filtrado ou sem a11y é diagnóstico: seu gate é `not-approved` e `trusted: false`. Apenas uma matriz
completa, contrato atual, todas as dimensões aprovadas e resultados estáveis produz:

```json
{
  "schemaVersion": 2,
  "status": "passed",
  "gate": {"status": "passed", "trusted": true}
}
```

Conformidade e paridade comportamental respondem perguntas diferentes. Se WC, React e Angular
produzem exatamente a mesma observação, mas ela contradiz o contrato, a paridade passa e a
conformidade falha. Não se deve relaxar o contrato ou o gate para converter essa evidência em sucesso.

## Estrutura do output

Cada run cria um diretório próprio:

```text
<tangerina-web-core>/outputs/anemoi-web/<card>/<componente>/<timestamp>-<id>/
├── run-plan.json
├── builds.json
├── manifest.json
├── summary.md
├── index.html
├── logs/
├── build/
│   ├── wc/
│   ├── react/
│   └── angular/
└── results/
    └── <teste-logico>/
        └── attempt-<n>/
            ├── result.json
            ├── evidence/
            └── attachments/
```

`axes.browsers` registra a cobertura efetiva. `behavior.results` separa Roteiros, conformidade e
paridade. `attempts` expõe cada tentativa, seu `resultPath`, attachments e `stable`/`flaky`.
`index.html` usa somente caminhos relativos e abre offline; além da evidência visual por browser,
mostra dimensões, comportamento e links diagnósticos.

## Códigos de saída e falhas

| Código | Significado |
| --- | --- |
| `0` | Gate confiável aprovado ou run diagnóstico concluído. Consulte o manifesto para distinguir os casos. |
| `1` | Gate de Confiabilidade reprovado; o bundle e o manifesto v2 são preservados. |
| `2` | Erro de execução no preflight, Playwright Test ou finalização. |

O exit code do Playwright Test não é o veredito público isoladamente: o Anemoi aceita a conclusão de
testes aprovados ou reprovados, lê todos os Resultados Atômicos e deixa o finalizador calcular o gate.
Erro de infraestrutura, matriz incompleta ou Resultado Atômico inválido falha fechado.

## Interpretação das evidências

WC é a referência de React e Angular somente dentro da mesma engine. O Anemoi não compara pixels
entre Chromium, Firefox e WebKit. `mismatch: 0` e `sizeMatch: true` comprovam paridade visual para a
célula capturada; qualquer diferença fica no artefato de diff daquela tentativa.

Axe e ARIA são provas independentes da visual. Falha de coleta não significa acessibilidade e deixa
a dimensão indisponível. `--no-a11y` serve apenas para diagnóstico e nunca produz confiança.

Os Roteiros remontam a Cena antes de cada comportamento. Eventos preservam ordem e quantidade;
observações são normalizadas e comparadas por igualdade profunda exata. Uma falha localizada em um
wrapper deve aparecer em conformidade e/ou paridade sem apagar os resultados dos outros frameworks.

O pipeline legado `capturePipeline` continua exportado somente para compatibilidade com
`packages/service`/Koba. Ele não é o executor da CLI Web e não publica o Gate de Confiabilidade novo.
