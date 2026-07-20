# Agrupamento do relatório HTML por estado

## Contexto

O relatório HTML v2 apresenta evidências visuais, resultados comportamentais e tentativas em tabelas globais contínuas. No run real do `tgr-button`, isso produz 156 linhas visuais, 156 resultados comportamentais e 156 grupos de tentativas para 13 estados de cena.

O conteúdo deve continuar completo e offline, mas a leitura inicial precisa priorizar o estado do componente e revelar detalhes progressivamente.

## Objetivo

Transformar cada estado de cena em uma unidade recolhível que reúna suas evidências visuais, comportamentais, de acessibilidade e estabilidade.

A página inicial deve mostrar o resumo global e um cabeçalho por estado, em vez de todas as linhas de evidência expandidas. Nenhuma evidência será removida.

## Fora de escopo

- Alterar o schema ou o conteúdo do `manifest.json`.
- Alterar a captura, o gate ou os critérios de aprovação.
- Adicionar biblioteca de interface.
- Reestruturar `summary.md`.
- Agrupar dimensões exclusivamente globais, como cobertura do contrato, por estado.

## Estrutura do relatório

O topo continuará exibindo o status global do gate, as dimensões de confiança e um resumo Axe agregado.

Abaixo do resumo, o relatório terá um `<details>` por estado de cena. A identidade será `scene.id`; o título visível será `scene.name`. Cada cabeçalho exibirá:

- status consolidado do estado;
- quantidade de combinações;
- contagens de falhas ou indisponibilidades de Axe, comportamento, paridade e estabilidade;
- browsers, temas e viewports envolvidos.

Estados com falha ou evidência indisponível aparecerão primeiro e abertos. Estados aprovados aparecerão depois e fechados.

Cada estado reunirá, nesta ordem:

1. diagnóstico local;
2. evidências visuais;
3. comportamento;
4. tentativas e artefatos.

## Projeção de dados

O `manifest.json` permanecerá inalterado. Antes da renderização, uma função pura criará uma projeção de apresentação agrupada por estado.

Essa projeção associará ao mesmo `scene.id`:

- `groups` de evidência visual, paridade e Axe;
- `behavior.results` e seus roteiros;
- `attempts`, resultados atômicos e attachments.

A projeção calculará o status local sem modificar o gate global. Um estado será marcado:

- `failed` quando qualquer evidência local tiver falha;
- `unavailable` quando não houver falha, mas existir evidência local indisponível ou impossível de associar completamente;
- `passed` quando todas as evidências locais aplicáveis estiverem aprovadas.

Falhas terão precedência sobre indisponibilidades. Dimensões que só existem globalmente não participarão do status local.

Estados serão ordenados por severidade (`failed`, `unavailable`, `passed`) e, dentro da mesma severidade, pela ordem original das cenas. Combinações dentro de um estado seguirão o mesmo princípio: falhas primeiro e, em seguida, a ordem estável original de browser, tema e viewport.

Qualquer resultado que não possa ser associado de forma segura a um `scene.id` aparecerá em um grupo aberto chamado “Evidências sem estado”, com status `unavailable`. Dados órfãos nunca serão descartados silenciosamente.

## Interação e apresentação progressiva

O accordion de estados usará `<details>` e `<summary>` nativos. Isso preserva funcionamento offline e interação por teclado sem dependência de UI.

Mesmo quando um estado estiver aberto, apenas o diagnóstico compacto ficará imediatamente visível. As áreas internas serão progressivas:

- **Axe:** contagens e regra dominante visíveis; regras, nós e artefatos completos recolhidos;
- **Visual:** recolhido inicialmente e agrupado por browser; cada combinação mostra WC, React e Angular lado a lado;
- **Comportamento:** aberto quando houver falha e fechado quando aprovado; falhas aparecem antes dos resultados aprovados;
- **Tentativas:** recolhidas inicialmente, preservando links para `result.json` e attachments.

O topo terá dois controles:

- “Abrir estados com falha”;
- “Fechar todos”.

O filtro existente por browser continuará aplicável às evidências dentro dos estados. A filtragem altera apenas a visibilidade, nunca o status ou as contagens.

Tabelas internas poderão rolar horizontalmente em telas estreitas sem ampliar o documento inteiro.

## Segurança e tolerância a dados incompletos

As proteções atuais de escape de HTML e validação de caminhos relativos continuarão sendo aplicadas a toda saída dinâmica.

Um grupo parcialmente inválido não deve impedir a leitura das demais evidências. Quando não for possível classificá-lo com segurança, ele será exposto como indisponível em “Evidências sem estado”. Erros estruturais globais continuarão visíveis no diagnóstico global.

## Componentes internos

A mudança ficará dividida em unidades pequenas:

1. **Projetor de estados:** recebe o manifesto e devolve grupos ordenados com status e contagens locais.
2. **Renderizador do cabeçalho de estado:** mostra identidade, status, eixos e contagens.
3. **Renderizadores de evidência:** produzem Axe, visual, comportamento e tentativas para um único estado.
4. **Controles globais:** abrem estados falhos, fecham todos e aplicam o filtro de browser.

O projetor não produzirá HTML. Os renderizadores não decidirão associação ou severidade. Essa separação mantém as regras testáveis sem depender de comparação integral de uma string HTML extensa.

## Testes

### Projeção de estados

- associa `groups`, comportamento e tentativas ao mesmo `scene.id`;
- não mistura estados com nomes semelhantes;
- calcula `failed`, `unavailable` e `passed` com a precedência definida;
- preserva ordem determinística;
- coloca combinações falhas antes das aprovadas;
- conserva dados órfãos em “Evidências sem estado”.

### HTML

- um manifesto com 13 cenas gera 13 accordions de estado;
- estados falhos e indisponíveis começam abertos;
- estados aprovados começam fechados;
- subseções seguem os estados iniciais definidos;
- controles globais e filtro de browser atuam apenas nos elementos esperados;
- conteúdo dinâmico permanece escapado;
- links absolutos, externos, traversal e artefatos fora da tentativa continuam bloqueados;
- a galeria permanece autocontida e sem dependências externas.

### Execução real

Executar o Anemoi novamente para `tgr-button` e verificar:

- abertura offline do `index.html`;
- resumo global seguido pelos 13 estados;
- estados com falha abertos e aprovados fechados;
- detalhes Axe locais coerentes com o resumo global;
- filtros, controles e navegação por teclado;
- imagens WC, React e Angular e links de diagnóstico acessíveis;
- ausência de regressão no `manifest.json` e no `summary.md`.

## Critérios de sucesso

- A leitura inicial do run real deixa de apresentar 156 linhas visuais contínuas e passa a apresentar o resumo global e 13 cabeçalhos de estado.
- Toda evidência existente continua acessível dentro do respectivo estado ou em “Evidências sem estado”.
- Falhas ficam visíveis antes de aprovações, tanto entre estados quanto dentro deles.
- O relatório continua offline, seguro, responsivo e navegável por teclado.
- O schema do manifesto e o resultado do gate não mudam.
