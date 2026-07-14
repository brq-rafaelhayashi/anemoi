# @gol-smiles/anemoi-service

Serviço HTTP local que verifica paridade React×Angular do estado vivo do
Koba (`/compare/<key>?state=…`), com diff de pixels e bundle padrão do Anemoi.

## Uso

    npm run service -- --doctor   # pré-flight: config, DS, Koba, porta
    npm run service               # sobe em http://127.0.0.1:9200

Config (opcional) na seção `service` do `.anemoi.local.json` da raiz:

    { "service": {"port": 9200, "kobaBaseUrl": "http://localhost:9000", "repo": "ds"} }

`repo` é um alias de `repositories` (mesmo mecanismo do anemoi-web); sem ele,
usa o `defaultRepository`.

## API

- `POST /runs` — body `{mode: "state", compareState: {componentKey, props, slots}, card?, axes?: {viewports?}}` → `202 {runId}` · `400` JSON inválido · `422` estado/axes inválidos · `503` Koba fora do ar.
- `GET /runs/:id` — `{status: queued|running|passed|failed|error, stage?, summary?, manifestUrl?, galleryUrl?, error?}`.
- `GET /runs/:id/gallery/` — galeria do bundle.

O bundle é gravado em `outputs/anemoi-web/<card>/<componente>/<ts>-<id>/`
no checkout do DS. O serviço nunca executa Git no consumidor.

## Smoke manual (com Koba vivo)

1. No repo `koba`: `pnpm dev` (shell em :9000, com o DS buildado).
2. Aqui: `npm run service -- --doctor` → 4 checks ✓; depois `npm run service`.
3. Disparar um run (ajuste o componentKey para um real do catálogo):

       curl -s -X POST http://127.0.0.1:9200/runs \
         -H 'content-type: application/json' \
         -d '{"mode":"state","compareState":{"componentKey":"tgr-button","props":{},"slots":{}}}'

4. Acompanhar: `curl -s http://127.0.0.1:9200/runs/<runId>` até `passed|failed`.
5. Abrir `http://127.0.0.1:9200/runs/<runId>/gallery/` no navegador.
