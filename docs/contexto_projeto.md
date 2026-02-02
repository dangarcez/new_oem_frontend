# Contexto do projeto

## Visao geral
Aplicacao web para construir arquivos de configuracao (YAML) usados pelo OEM_ingest. O usuario visualiza targets do Oracle Enterprise Manager, seleciona, aplica tags e salva o YAML.

## Estrutura do repositorio
- `backend/`: API FastAPI, cache SQLite e logica de mapeamento de targets
- `frontend/`: Vite + React (JavaScript)
- `backend/conf/targets.yaml`: configuracao atual de targets
- `backend/conf/metrics.yaml`: configuracao atual de metricas
- `backend/conf/enterprise_manager_urls`: lista de endpoints OEM e credenciais
- `docs/oem_rest_api_doc.md`: documentacao resumida da API OEM

## Backend (FastAPI)
- Entrada principal: `backend/app/main.py`
- Cache SQLite: `backend/app/cache.py` (tabela `targets` + `meta`)
- Cliente OEM: `backend/app/oem_client.py`
- Mapeamento automatico: `backend/app/mapping.py`
- Utilitarios: `backend/app/utils.py`
- Persistencia YAML: `backend/app/storage.py`

### Arquivos de configuracao
`backend/conf/enterprise_manager_urls` (YAML):
```
- site: <apelido_do_site>
  endpoint: http://host:8080
  name: <nome_curto>
  user: <usuario>
  password: <senha>
  verify_ssl: false
```

`backend/conf/targets.yaml` (lista de sites com targets):
```
- site: <apelido_do_site>
  endpoint: http://host:8080
  name: <nome_curto>
  targets:
    - id: <id>
      name: <nome>
      typeName: <type>
      tags: { ... }
      # opcionais para oracle_database
      dg_role: <Primary|Physical Standby|...>
      machine_name: <host>
      listener_name: <listener>
```

### Endpoints principais
- `GET /api/enterprise-managers`
- `POST /api/targets/refresh`
- `GET /api/targets/search`
- `POST /api/targets/auto-map`
- `POST /api/targets/prepare`
- `GET /api/config/targets`
- `POST /api/config/targets`
- `GET /api/config/metrics`
- `POST /api/config/metrics`
- `GET /api/metrics/metric-groups`
- `GET /api/metrics/latest-data`
- `GET /api/metrics/metric-group`
- `POST /api/metrics/availability`

### Fluxo de dados (alto nivel)
1) Usuario escolhe o endpoint OEM.
2) Backend pode atualizar o cache via `/api/targets/refresh` (SQLite).
3) Frontend faz busca em cache via `/api/targets/search`.
4) Targets escolhidos entram na area "Targets selecionados".
5) Ao adicionar, backend enriquece e normaliza tags via `/api/targets/prepare`.
6) Salvar grava no `backend/conf/targets.yaml` via `/api/config/targets`.

## Frontend (Vite + React)
- UI principal: `frontend/frontend/src/App.jsx`
- Estilos: `frontend/frontend/src/App.css`, `frontend/frontend/src/index.css`

### Pagina de targets
- Selecao de endpoint OEM
- Busca livre (autocomplete, um target por vez)
- Busca por sistema (rac_database/oracle_pdb)
- Area de “Targets selecionados” com edicao de tags e botao de adicionar
- Configuracao atual agrupada por tipo, com cards colapsados por padrao
- Secao "new" no topo para novos targets (destacada)
- Targets modificados ficam destacados ate salvar

### Regras de UI e selecao
- Pesquisa livre e pesquisa de sistema adicionam na mesma lista de "Targets selecionados".
- Nao permite selecionar o mesmo target duas vezes (mensagem temporaria).
- Nao permite adicionar na configuracao um target ja existente (mensagem temporaria).
- Botao "Adicionar" individual por target selecionado + botao "Adicionar todos".
- Botao "Baixar YAML" gera o arquivo de configuracao antes de salvar.

## Regras importantes
- Tags obrigatorias sempre: `target_name` e `target_type`.
- Cada target recebe uma tag com o proprio `typeName`.
- Tags de hierarquia usam `typeName` do target (ex.: `oracle_dbsys`, `rac_database`, `oracle_pdb`).
- Para `oracle_database`: `machine_name` e `listener_name` vem das properties do OEM (MachineName/Listener).
- Para `host` e `oracle_listener`, `target_name` usa o formato curto (host sem dominio, listener com `_lstnr`).

### Mapeamento automatico (resumo)
- Usa o nome do rac para identificar o sistema completo (primario e standby).
- Padrao standby geralmente troca `p` por `s` no prefixo.
- Para `oracle_pdb` standby, a parte apos "_" referencia o nome do primario em maiusculo.
- Regex usada para oracle_database (primario):
  `^{primary}(?:_\d+)?_{primary}\d*$`

### Cache e performance
- Cache SQLite evita chamadas repetidas ao OEM.
- `/api/targets/refresh` reconstroi o cache do endpoint.
- `/api/targets/search` faz busca local com filtro de nome e tipo.

### Metricas
- Pagina de metricas com 3 secoes: Disponibilidade, Dados do grupo e Pesquisa.
- Disponibilidade usa metricas configuradas para checar status por target (disponivel/sem dados/indisponivel).
- Dados do grupo exibem informacoes do payload e lista de itens formatada (chave/valor).
- Keys do grupo sao consultadas via `/api/metrics/metric-group` e destacadas na lista.
- Botao "Ver JSON" abre modal com o payload completo.
- Configuracao de metricas agrupada por tipo, com frequencia editavel e destaques para novos/alterados.
- Botao "Baixar YAML" gera `metrics.yaml` com as alteracoes antes de salvar.

## Como executar
Backend:
```
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:
```
cd frontend/frontend
npm install
VITE_API_BASE=http://localhost:8000 npm run dev
```

## Observacoes
- Por padrao, conexoes OEM usam `verify_ssl=false`.
