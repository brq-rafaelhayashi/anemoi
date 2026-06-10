# ADR 0002: Fluxos de Evidencia no registry

## Status

Accepted

## Context

O registry usava `harness[].scenarioId` para representar ao mesmo tempo variacoes tecnicas de props, fixtures isoladas e caminhos reais de produto. Isso deixava a UX do CLI ambigua: ao escolher um "scenario", o dev na pratica queria escolher um fluxo como "Home > Preferencias - PreferencesScreen.tsx".

## Decision

O registry passa a tratar a unidade selecionavel como **Fluxo de Evidencia** (`flows[].flowId`), identificado por um label legivel. Cada fluxo tem `category: "appScreen" | "testState"` para separar telas reais do app de estados montados para teste. O CLI deve aceitar um parametro de fluxo, perguntar quais fluxos renderizar quando o parametro nao for informado em terminal interativo, oferecer `all` como escolha explicita, e manter leitura temporaria de `harness`/`scenarioId` apenas como compatibilidade.

## Consequences

- A Gallery pode renderizar varios fluxos na mesma pagina, identificando cada pagina antes do componente correspondente.
- O Bundle de Evidencia preserva recortes e metadados por fluxo, mesmo quando a experiencia interativa mostra todos na mesma rota.
- A rota principal da Gallery usa o componente no path e a selecao de fluxos em query string, como `automation/ds/CountryFlag?flows=preferences-currency,currency-drawer-open`; a rota antiga com `:scenario` fica apenas como compatibilidade.
- Cada fluxo renderizado tem um testID previsivel derivado de `flowId`, como `ds-evidence-flow-preferences-currency`; `targetTestID` continua existindo para recorte fino do componente quando necessario.
- A geracao HTML deve aceitar `--html-output single|per-flow`: `single` para um HTML unico com todos os fluxos selecionados (`<card>-<component>.html`), e `per-flow` para um HTML por fluxo (`<card>-<component>-<flowId>.html`). O default e `single`; o modo interativo sempre mostra os fluxos selecionados na mesma tela rolavel.
- O seletor agrupa os fluxos por categoria: "Telas do app" para `appScreen` e "Estados de teste" para `testState`.
- O modo interativo deixa de limitar a abertura a um unico item; varios fluxos selecionados aparecem empilhados na mesma tela rolavel.
- Quando faltar informacao ou houver valor invalido no fluxo, o CLI deve guiar a correcao com valores aceitos, sugestao do fluxo mais parecido quando possivel, exemplo minimo e proximo comando sugerido; a falha nao deve ser apenas tecnica.
- O CLI deve oferecer descoberta sem captura via `--list-flows`, exibindo `flowId`, rotulo e categoria agrupados para que o usuario saiba quais valores passar em `--flows`.
- O comando explicito `--add-flow` pode gravar o fluxo no registry local do app, mas inicialmente nao edita a Gallery automaticamente; ele deve emitir um stub orientado e o ponto de registro esperado para revisao manual.
- O `GOL_APP_Mobile`, como consumidor de referencia, deve migrar seu registry atual para `flows`; `harness` fica legado apenas para compatibilidade do preset com consumidores ainda nao migrados.
- `realScreens` deixa de ser a lista principal: itens renderizaveis viram `flows`, e usos reais ainda nao renderizaveis ficam em `references` apenas como informacao para QA/dev.
- Quando listar ou perguntar fluxos, a CLI pode mostrar `references` em uma secao separada e nao selecionavel, indicando `--add-flow <Component>` como caminho para transformar a referencia em fluxo renderizavel.
