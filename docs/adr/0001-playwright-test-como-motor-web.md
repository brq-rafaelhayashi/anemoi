---
status: accepted
---

# Playwright Test como motor de execução do Anemoi Web

O Anemoi Web usará `@playwright/test` como infraestrutura de execução do pipeline de navegador. O Playwright Test será responsável por browsers, isolamento, fixtures, timeouts, paralelismo, retries, traces e lifecycle; o Anemoi continuará responsável pelos cenários do Tangerina, comparabilidade entre frameworks, dimensões de confiança, evidências, manifesto, galeria e gate final. O serviço Koba não condiciona esta decisão arquitetural.

## Considered options

- Manter o runner artesanal baseado na biblioteca `playwright`: rejeitado porque exigiria reimplementar progressivamente capacidades maduras de um test runner.
- Adicionar uma suíte `@playwright/test` somente para comportamento: rejeitado porque criaria dois pipelines e dois modelos de falha e evidência.
- Migrar a execução Web para `@playwright/test`, preservando o domínio no Anemoi: escolhido por reduzir infraestrutura proprietária e sustentar comportamento, cross-browser, flakiness, traces e paralelismo sobre uma única execução.

## Consequences

- Um preflight do Anemoi deve produzir um plano imutável do run antes da coleta dos testes.
- A CLI atual permanece a interface pública: aliases, doctor, filtros, builds, códigos de saída e bundle continuam disponíveis enquanto o motor interno migra para Playwright Test.
- A implementação ocorre em worktree isolado como tracer bullet completo do `tgr-button`; os motores antigo e novo coexistem apenas durante a validação, e o antigo é removido antes da expansão aos demais componentes.
- O corte para o motor novo exige equivalência automatizada no `tgr-button`: antigo e novo executam a mesma matriz e têm células, disponibilidade de evidências e vereditos comparados. Além do caminho feliz, uma divergência comportamental controlada deve demonstrar que o novo gate a detecta; aprovação apenas por testes internos ou revisão manual não é suficiente.
- A divergência usada no corte é uma **Contraprova Controlada** implementada em harness de teste do próprio Anemoi: ela altera deterministicamente o comportamento de um framework e percorre navegador, observação, consolidação e gate reais, sem aplicar patch ou gravar qualquer mudança no checkout do Tangerina.
- Cada teste representa uma **Cena** em um ambiente e browser; WC, React e Angular são steps da mesma execução para manter comparação, attachments e trace numa única unidade lógica.
- O estado inicial permanece declarativo e compartilhado; ações e assertions comportamentais são código Playwright Test executado por fixtures do Anemoi, sem uma DSL própria de interações e sem setup livre por framework.
- Antes de cada **Roteiro Comportamental**, a fixture remonta a **Cena** no estado declarado para cada framework; Roteiros não reutilizam estado mutado por outro Roteiro nem podem depender da ordem em que são executados.
- Cenas, Contratos Comportamentais e Roteiros Comportamentais pertencem ao Anemoi e são organizados por consumidor e componente; o Tangerina permanece o sistema sob teste e não precisa incorporar arquivos ou dependências do Anemoi.
- Os artefatos ficam sob `packages/web/contracts/<consumer>/<component>/`, separados em contrato, Cenas e Roteiros, evitando arquivos globais por conceito ou um único arquivo crescente por componente.
- Runner, fixtures e contratos novos são escritos em TypeScript e validados com `tsc --noEmit`; os módulos existentes permanecem CommonJS, sem uma migração geral do repositório.
- Cada componente possui um `behaviors.spec.ts` nativo; o preflight gera somente um `run-plan.json` imutável consumido pelas fixtures, sem fábrica central de testes nem geração temporária de código-fonte.
- O Anemoi declara comportamentos públicos obrigatórios por componente; cada Roteiro identifica quais comportamentos comprova, e qualquer lacuna de cobertura reprova o gate em vez de tratar ausência de testes como aprovação.
- Cada Contrato Comportamental referencia um fingerprint revisado da superfície pública do componente no Custom Elements Manifest e nos wrappers React/Angular; divergência detectada no preflight invalida a cobertura até revisão explícita, sem depender do hash de todo commit Tangerina.
- Divergência de fingerprint marca o contrato como desatualizado e a evidência comportamental como indisponível, mas não aborta o run: visual, dimensões, Axe e ARIA continuam sendo coletados, e o gate reprova após consolidar o diagnóstico.
- Um comando explícito de atualização gera diff legível de props, eventos, slots e wrappers, pede confirmação e somente então grava o novo fingerprint para commit e code review; runs nunca atualizam contratos automaticamente.
- A dimensão comportamental mantém vereditos separados para conformidade contra resultados esperados e paridade entre frameworks; ambos devem ser aprovados para o gate comportamental passar.
- Cada Roteiro Comportamental executa assertions de conformidade e produz uma observação explícita e normalizada; a paridade compara essas observações, não snapshots completos de DOM/ARIA nem apenas o status passou/falhou.
- A Observação Comportamental usa um envelope comum para foco, eventos e visibilidade, acompanhado de estado serializável específico do componente; não será um schema global fechado nem um objeto inteiramente livre.
- A Paridade Comportamental exige igualdade exata das observações após normalização, incluindo ordem e quantidade de eventos; dados voláteis devem ser excluídos explicitamente ao produzir a observação, sem tolerâncias ou matchers no comparador.
- Roteiros usam locators semânticos, como papel e nome acessível, dentro da raiz fornecida pela fixture; CSS interno não constitui contrato, e hooks técnicos exigem uma exceção explícita quando não houver superfície semântica utilizável.
- A execução de uma Cena coleta WC, React e Angular mesmo quando um framework falha; erros e observações são consolidados por framework, a paridade é calculada quando possível e o teste falha somente após preservar todas as evidências disponíveis.
- Falha de montagem ou execução mantém vereditos separados: execução `error`, conformidade `not-run` e paridade `not-comparable`; a evidência fica indisponível e o gate reprova sem rotular o comportamento do componente como incorreto.
- O CI executa no máximo um retry para classificar instabilidade e preservar o trace; resultado `flaky` permanece não confiável e reprova o gate mesmo quando a segunda tentativa passa.
- Cada tentativa preserva seu próprio **Resultado Atômico** e attachments; o finalizador reúne as tentativas em um único resultado lógico do teste, mantém o histórico completo e deriva a classificação `stable` ou `flaky`, sem sobrescrever a primeira tentativa nem criar células adicionais na matriz.
- Cada tentativa de teste grava um **Resultado Atômico** imutável em caminho exclusivo, com vereditos, observações e referências aos attachments; workers nunca atualizam um manifesto compartilhado.
- Observações normalizadas em JSON são preservadas em toda execução; quando há falha comportamental, o **Resultado Atômico** também referencia diff estruturado, screenshot, erros de console e de página, além do trace da tentativa de retry. Vídeo não é coletado inicialmente.
- Reporters podem adaptar resultados e attachments, mas somente um finalizador explícito do Anemoi consolida os **Resultados Atômicos**, valida completude contra o `run-plan.json` e publica manifesto, resumo e galeria.
- O motor novo publica `manifest.json` com `schemaVersion: 2`; leitores tratam manifestos sem versão como v1. Nomes e caminhos públicos permanecem compatíveis quando sua semântica não mudou, enquanto tentativas, comportamento e vereditos multidimensionais entram somente no schema v2.
- Os testes unitários puros podem continuar usando `node:test`; a decisão se aplica ao pipeline de navegador.
