# Oracle Enterprise Manager Cloud Control 24.1 – REST API (Somente: Metrics e Target)

Fonte principal (lista de endpoints): documentação “All REST Endpoints”.   
Observação: este arquivo **omite exemplos de erro (400/401/etc.)** para ficar menor.

---

## 0) Convenções (como montar a URL)

- Base (métricas): `https://<EM_HOST>:<EM_CONSOLE_HTTPS_PORT>/em/api/`   
- Base (targets): `https://<EM_HOST>:8080/em/api/`   
  (na doc, a seção de *Target* aparece com `:8080`.)

### Autenticação (resumo)
- HTTPS + CA do OMS.
- Usuário/senha do OEM (Basic Auth no exemplo).
- Exemplo de cliente Python (helper):

```python
import requests

BASE_METRICS = "https://EM_HOST:EM_CONSOLE_HTTPS_PORT/em/api/"
BASE_TARGETS = "https://EM_HOST:8080/em/api/"
AUTH = ("USERNAME", "PASSWORD")
CA_BUNDLE = "/path/to/ca.pem"  # CA do OMS

def get(url, **kwargs):
    return requests.get(url, auth=AUTH, verify=CA_BUNDLE, timeout=60, **kwargs)

def post(url, **kwargs):
    return requests.post(url, auth=AUTH, verify=CA_BUNDLE, timeout=60, **kwargs)

def patch(url, **kwargs):
    return requests.patch(url, auth=AUTH, verify=CA_BUNDLE, timeout=60, **kwargs)

def delete(url, **kwargs):
    return requests.delete(url, auth=AUTH, verify=CA_BUNDLE, timeout=60, **kwargs)
```

---

# 1) Metrics

A documentação lista **4 endpoints** em *Metrics*. 

## 1.1 GET /metricTimeSeries
**Path**
- `GET http(s)://EM_HOST:EM_CONSOLE_HTTPS_PORT/em/api/metricTimeSeries` 

**Objetivo**
- Obter **pontos de dados ao longo do tempo** para uma métrica numérica (com ou sem chaves). 

**Query params (principais, simplificado)**
- `metricGroupName` (string): nome do grupo de métricas.
- `metricName` (string): nome da métrica.
- `timeCollectedGreaterThanOrEqualTo` (datetime UTC): início do intervalo.
- `timeCollectedLessThan` (datetime UTC): fim do intervalo.
- Identificação do target:
  - `targetId` (string) **ou**
  - `targetName` (string) + `targetTypeName` (string)

**Exemplo (Python)**
```python
url = BASE_METRICS + "metricTimeSeries"
params = {
    "metricGroupName": "CPU",
    "metricName": "usage",
    "timeCollectedGreaterThanOrEqualTo": "2026-01-20T00:00:00Z",
    "timeCollectedLessThan": "2026-01-20T02:00:00Z",
    "targetId": "CF99A10F233254B78ED96ED1B5C15140",
}
r = get(url, params=params)
data = r.json()
```

**Exemplo de resposta (formato típico)**
```json
{
  "items": [
    {
      "targetId": "CF99A10F233254B78ED96ED1B5C15140",
      "targetName": "db01",
      "targetTypeName": "oracle_database",
      "metricGroupName": "CPU",
      "metricName": "usage",
      "displayName": "CPU Usage",
      "datapoints": [
        ["2026-01-20T00:00:00Z", 12.5],
        ["2026-01-20T00:05:00Z", 18.2]
      ]
    }
  ]
}
```

---

## 1.2 GET /targets/{targetId}/metricGroups
**Path**
- `GET http(s)://EM_HOST:EM_CONSOLE_HTTPS_PORT/em/api/targets/{targetId}/metricGroups` 

**Objetivo**
- Listar grupos de métricas disponíveis para um target (ordenado por nome). 

**Path params**
- `targetId` (string): GUID/ID do target.

**Query params (principais)**
- `include` (string opcional): quando `include=metrics`, inclui detalhes das métricas de cada grupo. 

**Exemplo (Python)**
```python
target_id = "CF99A10F233254B78ED96ED1B5C15140"
url = BASE_METRICS + f"targets/{target_id}/metricGroups"
r = get(url, params={"include": "metrics"})
groups = r.json()
```

**Exemplo de resposta**
```json
{
  "count": 1,
  "items": [
    {
      "id": "34E542C4F1CF2743327ED2F8563D1E4B",
      "name": "CPU",
      "displayName": "CPU",
      "metrics": [
        {
          "id": "A1B2C3D4",
          "name": "usage",
          "displayName": "CPU Usage",
          "dataType": "NUMBER",
          "unitDisplayName": "%"
        }
      ]
    }
  ],
  "links": { "self": { "href": "/em/api/targets/CF.../metricGroups?include=metrics" } }
}
```

---

## 1.3 GET /targets/{targetId}/metricGroups/{metricGroupName}
**Path**
- `GET http(s)://EM_HOST:EM_CONSOLE_HTTPS_PORT/em/api/targets/{targetId}/metricGroups/{metricGroupName}` 

**Objetivo**
- Retornar detalhes do **grupo de métricas** e das métricas contidas nele para um target. 

**Path params**
- `targetId` (string): GUID/ID do target.
- `metricGroupName` (string): nome do grupo (ex.: `Filesystems`, `CPU`). 

**Exemplo (Python)**
```python
target_id = "CF99A10F233254B78ED96ED1B5C15140"
metric_group = "Filesystems"
url = BASE_METRICS + f"targets/{target_id}/metricGroups/{metric_group}"
r = get(url)
group = r.json()
```

**Exemplo de resposta (campos típicos)**
```json
{
  "id": "34E542C4F1CF2743327ED2F8563D1E4B",
  "name": "Filesystems",
  "displayName": "File Systems",
  "isMetricExtension": false,
  "keys": [
    { "name": "MountPoint", "displayName": "Mount Point" }
  ],
  "metrics": [
    {
      "id": "9F8E7D6C",
      "name": "SpaceUsedPct",
      "displayName": "Space Used (%)",
      "dataType": "NUMBER",
      "unitDisplayName": "%"
    }
  ]
}
```

---

## 1.4 GET /targets/{targetId}/metricGroups/{metricGroupName}/latestData
**Path**
- `GET http(s)://EM_HOST:EM_CONSOLE_HTTPS_PORT/em/api/targets/{targetId}/metricGroups/{metricGroupName}/latestData` 

**Objetivo**
- Obter os **últimos valores coletados** para todas as métricas do grupo (pode retornar 1 linha para grupos sem chaves, ou várias linhas para grupos com chaves). 

**Path params**
- `targetId` (string)
- `metricGroupName` (string)

**Exemplo (Python)**
```python
target_id = "CF99A10F233254B78ED96ED1B5C15140"
metric_group = "CPU"
url = BASE_METRICS + f"targets/{target_id}/metricGroups/{metric_group}/latestData"
r = get(url)
latest = r.json()
```

**Exemplo de resposta (estrutura baseada no schema “MetricGroupLatestData”)**
```json
{
  "targetName": "db01",
  "targetTypeName": "oracle_database",
  "targetId": "CF99A10F233254B78ED96ED1B5C15140",
  "metricGroupName": "CPU",
  "timeCollected": "2026-01-20T01:55:00Z",
  "count": 2,
  "items": [
    {
      "keyValues": [],
      "metricValues": [
        { "metricName": "usage", "value": 18.2, "unit": "%" },
        { "metricName": "userTime", "value": 10.1, "unit": "%" }
      ]
    },
    {
      "keyValues": [],
      "metricValues": [
        { "metricName": "usage", "value": 16.9, "unit": "%" },
        { "metricName": "userTime", "value": 9.4, "unit": "%" }
      ]
    }
  ],
  "links": {
    "self": { "href": "/em/api/targets/CF.../metricGroups/CPU/latestData" }
  }
}
```
Campos como `count`, `items`, `links`, `metricGroupName` são descritos no schema da operação. 

---

# 2) Target

A documentação lista **6 endpoints** em *Target*. 

## 2.1 GET /targets
**Path**
- `GET https://EM_HOST:8080/em/api/targets` 

**Objetivo**
- Listar targets (com filtros opcionais). 

**Query params (principais, simplificado)**
- `name` / `nameMatches`
- `displayName` / `displayNameMatches`
- `type` (depende do schema completo)
- `status`
- `limit` (1..2000)
- `page` (token de paginação)
- `sort` (ex.: `type:ASC,name:DESC`)
- `include` (ex.: `targetStatus,total`) 

**Exemplo (Python)**
```python
url = BASE_TARGETS + "targets"
r = get(url)  # usando helper acima
targets = r.json()
```

**Exemplo de resposta**
```json
{
  "count": 2,
  "items": [
    {
      "targetId": "ABC123",
      "name": "db01",
      "type": "oracle_database",
      "displayName": "db01",
      "typeDisplayName": "Oracle Database"
    },
    {
      "targetId": "DEF456",
      "name": "host01",
      "type": "host",
      "displayName": "host01",
      "typeDisplayName": "Host"
    }
  ],
  "links": { "self": { "href": "/em/api/targets" } }
}
```

---

## 2.2 GET /targets/{targetId}
**Path**
- `GET https://EM_HOST:8080/em/api/targets/{targetId}` 

**Objetivo**
- Retornar detalhes de um target pelo ID.

**Exemplo (Python)**
```python
target_id = "ABC123"
url = BASE_TARGETS + f"targets/{target_id}"
r = get(url)
target = r.json()
```

**Exemplo de resposta**
```json
{
  "targetId": "ABC123",
  "name": "db01",
  "type": "oracle_database",
  "displayName": "db01",
  "typeDisplayName": "Oracle Database",
  "owner": "SYSMAN"
}
```

---

## 2.3 GET /targets/{targetId}/properties
**Path**
- `GET https://EM_HOST:8080/em/api/targets/{targetId}/properties` 

**Objetivo**
- Retornar propriedades do target (pode filtrar por nomes/ids; “sem erro” quando propriedade não suportada, segundo a doc). 

**Exemplo (Python)**
```python
target_id = "ABC123"
url = BASE_TARGETS + f"targets/{target_id}/properties"
r = get(url)
props = r.json()
```

**Exemplo de resposta**
```json
{
  "count": 2,
  "items": [
    { "id": "orcl_gtp_os", "name": "Operating System", "displayName": "Operating System", "value": "Linux" },
    { "id": "orcl_gtp_platform", "name": "Platform", "displayName": "Platform", "value": "x86_64" }
  ]
}
```


---

## 3) Observações para implementação
- *Metrics* usam `EM_CONSOLE_HTTPS_PORT` e aparecem como `http://.../em/api/...` na lista (mesma rota, preferir HTTPS).   
- *Target* aparece sob `https://EM_HOST:8080/em/api/...` na lista de endpoints. 
