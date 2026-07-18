# Design — Playwright Test e confiabilidade comportamental no Anemoi Web

Data: 2026-07-18
Status: aprovado em brainstorming, aguardando plano de implementação

## Contexto

O Anemoi Web já produz evidências visuais, dimensionais e de acessibilidade para o mesmo
componente Tangerina em Web Components, React e Angular. A execução de navegador, porém, é
orquestrada diretamente sobre a biblioteca `playwright`: o Anemoi controla lifecycle,
isolamento, repetição, paralelismo e consolidação. Esse modelo funciona para captura, mas
obriga o projeto a construir progressivamente recursos que um test runner maduro já possui.

Também existe uma lacuna de confiança: equivalência de pixels e semântica não demonstra que
clique, foco, estado e eventos públicos continuam corretos e equivalentes entre wrappers.
Este design adiciona conformidade e paridade comportamental e migra toda a execução Web para
`@playwright/test`, mantendo o Anemoi como dono do domínio, das evidências e do gate.

## Objetivos

- Provar comportamento público esperado em WC, React e Angular.
- Provar que os resultados observáveis são equivalentes entre os três frameworks.
- Executar todas as dimensões de confiança nos browsers obrigatórios do Tangerina.
- Delegar infraestrutura de execução ao Playwright Test sem transformar o Anemoi numa fina
  coleção de specs sem domínio próprio.
- Preservar a CLI e o bundle público durante a migração.
- Tornar falhas reproduzíveis, diagnosticáveis e resistentes a falso positivo por retry.

## Fora de escopo

- Koba e `packages/service` como condicionantes da nova arquitetura.
- Mobile, Detox, `anemoi-preset` e `gol-adapter-detox`.
- Migração geral dos módulos CommonJS ou dos testes unitários `node:test`.
- Comparação de pixels entre engines diferentes.
- DSL própria de interação.
- Vídeo em todas as execuções.
- Regressão temporal e promoção de baseline, que permanecem uma evolução independente.

## Alternativas consideradas

### Manter o runner artesanal

Rejeitada. Requer continuar implementando isolamento, fixtures, retry, traces, projetos de
browser, paralelismo e reporters no Anemoi. A manutenção cresce sem agregar conhecimento de
domínio do Tangerina.

### Adicionar Playwright Test somente para comportamento

Rejeitada. Criaria dois motores Web, dois lifecycles e duas representações de falha e
evidência. A duplicação tenderia a se tornar permanente.

### Migrar todo o pipeline Web para Playwright Test

Escolhida. Playwright Test fica responsável pela execução; Anemoi continua responsável por
Cenas, contratos, comparabilidade, normalização, manifesto, galeria e Gate de Confiabilidade.

As ferramentas pesquisadas reforçam partes específicas, mas não substituem esse desenho:

- Storybook Interaction Tests oferecem `play` functions, mas acoplariam os contratos ao
  Tangerina e hoje não há catálogo comportamental canônico para reaproveitar.
- Chromatic, Percy e Applitools são fortes em regressão visual e baseline, não na combinação
  local de conformidade e paridade WC × React × Angular.
- BackstopJS cobre cenários visuais, mas não fornece o modelo multidimensional nem a
  infraestrutura comportamental desejada.
- Custom Elements Manifest é adequado para detectar drift da superfície pública do WC;
  declarações dos wrappers complementam o fingerprint React/Angular.
- API Extractor inspira revisão de superfície pública, mas é orientado a APIs TypeScript e
  não substitui o CEM para Custom Elements.

## Arquitetura resultante

```text
CLI pública existente
  -> preflight Anemoi
  -> run-plan.json imutável
  -> Playwright Test
       -> projects Chromium, Firefox e WebKit
       -> behaviors.spec.ts do componente
       -> fixtures Anemoi
       -> WC, React e Angular como steps da mesma unidade lógica
  -> Resultados Atômicos por tentativa
  -> finalizador Anemoi
  -> manifest v2 + summary + galeria + exit code
```

### Fronteira de responsabilidades

O Playwright Test possui:

- criação e encerramento de browsers e contexts;
- isolamento, timeout e lifecycle;
- projects por browser;
- paralelismo e workers;
- um retry no CI;
- traces e attachments nativos.

O Anemoi possui:

- resolução do consumidor e preparação dos harnesses;
- Cenas, Roteiros e Contratos Comportamentais;
- Matriz de Suporte resolvida do Tangerina;
- fingerprint e cobertura do contrato;
- execução equivalente nos três frameworks;
- observações normalizadas e comparadores;
- vereditos por Dimensão de Confiança;
- Resultado Atômico, manifesto, resumo, galeria e gate.

Os reporters do Playwright podem adaptar eventos e attachments, mas não são a fonte da
verdade do bundle. Um finalizador explícito do Anemoi é o único publicador.

## Preflight e plano imutável

Antes de iniciar o Playwright Test, o preflight:

1. Resolve alias, checkout consumidor, componente, card e filtros existentes.
2. Prepara e valida os builds WC, React e Angular.
3. Lê a Matriz de Suporte versionada do Tangerina.
4. Carrega contrato, Cenas e cobertura obrigatória do componente.
5. Calcula a superfície pública atual pelo CEM e pelas declarações dos wrappers.
6. Compara essa superfície com o fingerprint revisado.
7. Expande a matriz completa e grava `run-plan.json`.

O plano contém IDs estáveis e todas as unidades esperadas. Ele não contém funções e não gera
arquivos `.spec.ts`. Durante a execução é somente leitura. O finalizador usa o mesmo plano
para provar que nenhum resultado desapareceu silenciosamente.

Fingerprint divergente marca o Contrato Comportamental como desatualizado. A dimensão
comportamental fica indisponível e reprova o gate, mas visual, dimensões, Axe e ARIA continuam
sendo coletados. Um comando dedicado de revisão mostra diff legível de props, eventos, slots
e wrappers, pede confirmação e grava o novo fingerprint para commit. Runs nunca o atualizam.

## Organização dos contratos

Todos os contratos e testes pertencem ao Anemoi:

```text
packages/web/contracts/
└── <consumer>/
    └── <component>/
        ├── contract.ts
        ├── fingerprint.json
        ├── scenes.ts
        └── behaviors.spec.ts
```

- `contract.ts` declara IDs de comportamentos públicos obrigatórios e metadados de cobertura.
- `fingerprint.json` preserva a superfície pública aprovada do componente e wrappers.
- `scenes.ts` declara props, atributos, slots e ambiente inicial, sem ações.
- `behaviors.spec.ts` é um spec Playwright nativo e usa fixtures tipadas do Anemoi.

Runner, fixtures, contratos e specs novos usam TypeScript e passam por `tsc --noEmit`. Os
módulos existentes permanecem CommonJS até que exista uma razão local para migrá-los.

Cada spec declara testes a partir das Cenas do próprio componente. Não existe fábrica central
de specs nem geração de código. A unidade lógica é uma Cena em um ambiente e browser; WC,
React e Angular são steps internos dessa mesma unidade para manter comparação, attachments e
trace juntos.

## Modelo comportamental

O estado inicial é declarativo. Ações e assertions são código Playwright Test real, apoiado
por fixtures do Anemoi. Roteiros usam locators voltados ao usuário — papel, nome acessível,
label e texto — dentro da raiz da Cena. Seletores CSS internos não fazem parte do contrato;
um hook técnico exige exceção explícita quando não existe superfície semântica viável.

Antes de cada Roteiro, a fixture remonta a Cena para cada framework. Roteiros não compartilham
estado mutável e não podem depender da ordem de execução.

Cada Roteiro:

1. Declara os IDs do Contrato Comportamental que comprova.
2. Executa ações equivalentes sobre WC, React e Angular.
3. Avalia expectativas absolutas de conformidade.
4. Retorna uma Observação Comportamental explícita e serializável por framework.

Forma conceitual da observação:

```ts
type BehaviorObservation<State> = {
  focus: unknown;
  events: Array<{
    name: string;
    detail?: unknown;
  }>;
  visibility: Record<string, boolean>;
  state: State;
};
```

O envelope comum mantém foco, eventos e visibilidade comparáveis; `state` é tipado pelo
componente. Dados voláteis são removidos no momento da observação. Depois de normalizadas,
as observações usam igualdade profunda exata, incluindo ordem e quantidade de eventos. O
comparador não oferece tolerâncias ou matchers especiais.

## Vereditos e tratamento de falhas

Execução, conformidade e paridade são vereditos distintos:

| Situação | Execução | Conformidade | Paridade |
|---|---|---|---|
| Resultado esperado e igual | `passed` | `passed` | `passed` |
| Resultado inesperado, mas igual | `passed` | `failed` | `passed` |
| Resultados executados, mas diferentes | `passed` | por framework | `failed` |
| Framework não montou ou não executou | `error` | `not-run` | `not-comparable` |

Falhar um framework ou Roteiro não encerra imediatamente a unidade lógica. O executor coleta
os demais resultados, preserva os erros por framework e somente então reprova o teste. Uma
evidência indisponível nunca é convertida em reprovação comportamental nem em aprovação; ela
continua bloqueante para o gate.

Todos os comportamentos públicos obrigatórios precisam estar cobertos. Ausência de roteiro ou
fingerprint desatualizado torna a cobertura inválida e reprova o gate.

## Cross-browser

A Matriz de Suporte é uma política versionada do Tangerina e resolvida por um adaptador do
Anemoi. Seu caminho físico pode ser configurado pelo consumidor; a política não fica
hardcoded no core.

A primeira matriz obrigatória contém Chromium, Firefox e WebKit, sem fase report-only. Em
cada engine são executadas paridade visual, dimensões, Axe, ARIA, conformidade comportamental
e paridade comportamental. WC é a referência de React e Angular dentro da mesma engine.
Pixels de engines diferentes nunca são comparados entre si.

Flags diagnósticas podem reduzir a matriz durante desenvolvimento local, mas um run incompleto
não pode publicar aprovação confiável do gate.

## Resultados, tentativas e diagnóstico

Cada tentativa grava seu Resultado Atômico em caminho exclusivo, sem estado compartilhado:

```text
<run>/results/<logical-test-id>/attempt-<n>/result.json
<run>/results/<logical-test-id>/attempt-<n>/attachments/...
```

O resultado contém identidade completa, vereditos, observações e referências relativas aos
attachments. Escrita usa arquivo temporário no mesmo diretório seguido de rename, impedindo
que o finalizador aceite JSON parcial.

No CI existe no máximo um retry, exclusivamente para classificar instabilidade e obter trace.
Todas as tentativas ficam preservadas e formam um único resultado lógico:

- resultados consistentes: `stable`;
- resultados divergentes: `flaky`;
- `flaky` reprova o Gate de Confiabilidade mesmo quando a tentativa final passa.

Observações JSON são mantidas em todos os resultados. Em falha comportamental, o pacote
diagnóstico inclui diff estruturado, screenshot, erros de console e de página e trace do
retry. Vídeo não entra na primeira versão.

## Finalização, manifesto v2 e gate

Depois do encerramento dos workers, o finalizador:

1. Lê o `run-plan.json` e todos os Resultados Atômicos.
2. Valida unicidade, schema, integridade dos caminhos e completude da matriz.
3. Consolida tentativas em resultados lógicos e deriva estabilidade.
4. Calcula vereditos por Dimensão de Confiança e o gate final.
5. Publica `manifest.json`, `summary.md`, galeria e códigos de saída.

O motor novo emite `manifest.json` com `schemaVersion: 2`. Leitores tratam manifestos sem
versão como v1. Campos, nomes e caminhos públicos são preservados quando sua semântica não
mudou. O v2 acrescenta tentativas, estabilidade, comportamento, disponibilidade e vereditos
multidimensionais. O `status` agregado continua disponível para consumidores simples, mas é
derivado do bloco detalhado do gate.

O gate aprova apenas quando todas as Dimensões de Confiança obrigatórias possuem evidência
completa, estável e aprovada. Dimensões continuam separadas para que o diagnóstico não seja
reduzido a um único booleano.

## Compatibilidade operacional

Permanecem públicos:

- `npm run web -- ...`;
- aliases de consumidor;
- `--doctor`, filtros e seleção de componente/card;
- preparação dos builds e harnesses;
- diretório do bundle, manifesto, resumo e galeria;
- semântica documentada dos códigos de saída.

O Koba pode ser adaptado posteriormente ao schema v2, mas não participa do critério de corte
e não limita fixtures, contratos ou a unidade de execução.

## Estratégia de migração

A implementação ocorre em novo worktree isolado. O `tgr-button` é o tracer bullet completo:

1. Contrato, fingerprint, Cenas e Roteiros.
2. Preflight e `run-plan.json`.
3. Playwright Test nos três browsers.
4. Todas as dimensões atuais e as duas dimensões comportamentais.
5. Resultados Atômicos, finalizador, manifesto v2, galeria e gate.

Durante o tracer, os motores antigo e novo coexistem somente para validação. Ambos executam a
mesma matriz Chromium do `tgr-button`, e uma verificação automatizada compara células,
disponibilidade das evidências e vereditos. As dimensões novas são validadas adicionalmente
nos três browsers.

Uma Contraprova Controlada, implementada num harness de teste do Anemoi, altera de forma
determinística o comportamento de um framework. Ela deve percorrer navegador, observação,
consolidação e gate e resultar em reprovação esperada, sem modificar o Tangerina.

O executor antigo só é removido depois da equivalência e da contraprova. A expansão para
outros componentes começa após sua remoção; não haverá dois motores permanentes.

## Estratégia de testes

### Unitários com `node:test`

- expansão e validação do run plan;
- fingerprint e diff da superfície pública;
- cálculo de cobertura comportamental;
- normalização e igualdade das observações;
- tabelas de veredito e Gate de Confiabilidade;
- escrita atômica e consolidação de resultados;
- leitura de manifesto v1 e produção v2.

### Playwright Test sobre fixtures locais

- isolamento e remontagem entre Roteiros;
- coleta de WC, React e Angular apesar de falha intermediária;
- eventos, foco, visibilidade e estado normalizados;
- attachments e traces por tentativa;
- projetos Chromium, Firefox e WebKit;
- Contraprova Controlada end-to-end.

### Validação real do tracer

- `doctor` e execução focada no `tgr-button` real;
- equivalência automatizada antigo × novo em Chromium;
- comportamento aprovado nos três browsers;
- falha provocada detectada pelo gate;
- bundle v2 navegável e autocontido;
- suíte completa `npm test` e `git diff --check`.

## Riscos e mitigação

- **Explosão da matriz:** usar projects e workers do Playwright; manter Resultados Atômicos e
  paralelismo configurável sem reduzir a matriz do gate.
- **Flakiness mascarada:** retry apenas diagnóstico e `flaky` sempre bloqueante.
- **Acoplamento a detalhes internos:** locators semânticos e exceções técnicas explícitas.
- **Contratos esquecidos:** fingerprint e cobertura obrigatória validados no preflight.
- **Corrida na consolidação:** workers escrevem arquivos exclusivos; somente o finalizador
  publica o bundle.
- **Migração interminável:** tracer único, equivalência automatizada e remoção obrigatória do
  executor antigo antes da expansão.
- **Quebra de consumidores do bundle:** schema v2 explícito e leitor retrocompatível com v1.

## Critérios de aceite do design

- A CLI existente inicia o motor Playwright Test sem exigir novo fluxo do consumidor.
- Uma Cena real do `tgr-button` produz evidências completas em WC, React e Angular nos três
  browsers obrigatórios.
- Conformidade e paridade comportamental têm vereditos separados e bloqueantes.
- Cada Roteiro começa a partir de montagem limpa.
- Falhas preservam evidências dos demais frameworks e Roteiros.
- Retry divergente é publicado como `flaky` e reprova o gate.
- O finalizador rejeita bundle incompleto ou Resultado Atômico inválido.
- Manifesto v2 é produzido e manifestos v1 continuam legíveis.
- Fingerprint divergente bloqueia comportamento sem impedir outras coletas.
- A Contraprova Controlada falha pelo motivo esperado.
- A equivalência do `tgr-button` autoriza a remoção do executor antigo.

## Referências pesquisadas

- [Playwright Test fixtures](https://playwright.dev/docs/test-fixtures)
- [Playwright projects](https://playwright.dev/docs/test-projects)
- [Playwright retries](https://playwright.dev/docs/test-retries)
- [Playwright reporters](https://playwright.dev/docs/test-reporters)
- [Storybook interaction testing](https://storybook.js.org/docs/writing-tests/interaction-testing)
- [Chromatic](https://www.chromatic.com/)
- [Percy](https://percy.io/)
- [Applitools](https://applitools.com/)
- [BackstopJS](https://github.com/garris/BackstopJS)
- [Custom Elements Manifest](https://custom-elements-manifest.open-wc.org/)
- [API Extractor](https://api-extractor.com/)
