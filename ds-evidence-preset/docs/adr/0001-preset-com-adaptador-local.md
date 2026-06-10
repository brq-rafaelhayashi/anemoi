# ADR 0001: DS Evidence Preset com adaptador local

## Status

Accepted

## Context

O fluxo DS Evidence nasceu no `GOL_APP_Mobile` para renderizar componentes Tangerina isolados, capturar evidencias Antes/Depois e montar um bundle para dev e QA.
Outros times precisam reutilizar a mesma mecanica, mas cada app tem scheme, build nativo, env, devices, rotas, props e cenarios reais diferentes.

Empacotar toda a configuracao Detox e a Gallery como uma instalacao fechada criaria acoplamento fragil aos paths e flavors do primeiro app.
Copiar scripts entre repos resolveria o curto prazo, mas faria os fluxos divergirem.

## Decision

Criar o pacote privado `@gol-smiles/ds-evidence-preset` como motor reutilizavel:

- CLI unico `ds-evidence`.
- Factory de configuracao Detox.
- Preset Metro para `TANGERINA_MODE=source`.
- Teste Detox comum para deep link, screenshot, recorte e XML.
- Geracao opcional de HTML.

Cada app host mantem um adaptador local:

- `ds-evidence.config.js`.
- Registry de componentes/cenarios/source paths.
- DS Evidence Gallery e rota `automation/ds/:component/:scenario`.
- Comandos nativos de build/install.

## Consequences

- O pacote padroniza o comportamento operacional sem assumir os detalhes de cada app.
- O modo de evidencia usa `source+stash`, evitando drift entre package e source.
- O modo interativo abre o componente no simulador/emulador sem capturar prints ou gerar HTML.
- A Gallery deve ser protegida por `__DEV__` e `E2E=true`.
