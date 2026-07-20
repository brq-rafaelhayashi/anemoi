---
status: accepted
---

# Tangerina possui a matriz de suporte de browsers

O Tangerina definirá uma matriz versionada de browsers obrigatórios e opcionais como parte do contrato do Design System. O Anemoi consumirá essa matriz, executará os projetos correspondentes no Playwright Test e registrará a cobertura efetiva; ele não hardcodará a política de compatibilidade nem permitirá que um run ad hoc reduza silenciosamente os browsers exigidos.

## Considered options

- Fixar Chromium, Firefox e WebKit no Anemoi: rejeitado porque faria a ferramenta definir uma política de produto do Tangerina.
- Escolher browsers apenas por flags de execução: rejeitado porque permitiria vereditos de confiança com coberturas diferentes e não comparáveis.
- Versionar a matriz no Tangerina e executá-la no Anemoi: escolhido para manter a responsabilidade pelo suporte junto ao Design System e a execução junto à plataforma de evidências.

## Consequences

- A matriz inicial exige Chromium, Firefox e WebKit desde a ativação do gate, sem período report-only.
- Cada browser obrigatório executa visual, dimensões, Axe, ARIA, conformidade e paridade comportamental; comparações entre frameworks usam o WC do mesmo browser como referência e não comparam pixels diretamente entre engines.
- A ausência de qualquer browser obrigatório torna a evidência indisponível e reprova o gate.
- Browsers opcionais aparecem no manifesto sem serem confundidos com cobertura obrigatória.
- Flags podem reduzir a matriz somente em execuções explicitamente diagnósticas, que não emitem aprovação do Gate de Confiabilidade.
