# Guia Completo das Ferramentas MCP para Dynamics 365

Este guia contém informações detalhadas sobre todas as ferramentas disponíveis no servidor MCP para Dynamics 365, incluindo parâmetros, exemplos de uso e casos de uso comuns.

## Índice

1. [Introdução](#introdução)
2. [Configuração e Execução](#configuração-e-execução)
3. [Ferramentas de Consulta](#ferramentas-de-consulta)
   - [retrieve-entity](#retrieve-entity)
   - [query-dynamics](#query-dynamics)
   - [d365 (Comandos Abreviados)](#d365-comandos-abreviados)
4. [Ferramentas de Metadados](#ferramentas-de-metadados)
   - [get-entity-metadata](#get-entity-metadata)
   - [metadata-explorer](#metadata-explorer)
5. [Assistente de Consulta Interativo](#assistente-de-consulta-interativo)
   - [query-assistant-start](#query-assistant-start)
   - [query-assistant-step](#query-assistant-step)
   - [query-assistant-end](#query-assistant-end)
6. [Casos de Uso Comuns](#casos-de-uso-comuns)
7. [Solução de Problemas](#solução-de-problemas)
8. [Referência de Formato JSON](#referência-de-formato-json)

---

## Introdução

O servidor MCP (Model Context Protocol) para Dynamics 365 fornece uma interface padronizada para interagir com o Dynamics 365 através de ferramentas (tools) que podem ser chamadas por clientes como o Claude AI, VSCode, ou qualquer cliente compatível com o protocolo MCP.

Este projeto implementa várias ferramentas para consulta de dados, exploração de metadados e assistência interativa, todas projetadas para funcionar com qualquer entidade do Dynamics 365.

---

## Configuração e Execução

### Variáveis de Ambiente

O servidor MCP requer as seguintes variáveis de ambiente:

```
DYNAMICS_URL=https://seuambiente.crm.dynamics.com
DYNAMICS_CLIENT_ID=seu-client-id
DYNAMICS_CLIENT_SECRET=seu-client-secret
DYNAMICS_TENANT_ID=seu-tenant-id
```

Estas variáveis podem ser definidas em um arquivo `.env` na raiz do projeto.

### Execução do Servidor

Para iniciar o servidor MCP:

```bash
npm run start
```

Para iniciar o servidor com transporte stdio (para integração com Claude AI):

```bash
npm run start:stdio
```

### Clientes MCP

Você pode interagir com o servidor MCP usando:

1. **MCP Inspector**: `npx @modelcontextprotocol/inspector`
2. **VSCode com extensão REST Client**
3. **Claude AI** (via transporte stdio)
4. **CLI personalizado** (incluído no projeto)

---

## Ferramentas de Consulta

### retrieve-entity

**Descrição:** Ferramenta genérica para recuperar registros de qualquer entidade do Dynamics 365.

**Parâmetros:**
- `entityName` (obrigatório): Nome da entidade a ser consultada (ex: account, contact, incident)
- `filter` (opcional): Filtro OData para a consulta (ex: "name eq 'Contoso'")
- `select` (opcional): Lista de campos a serem retornados
- `orderBy` (opcional): Campo para ordenação dos resultados
- `top` (opcional): Número máximo de registros a serem retornados
- `expand` (opcional): Relacionamentos a serem expandidos

**Exemplo de uso:**
```json
{
  "name": "retrieve-entity",
  "parameters": {
    "entityName": "account",
    "filter": "statecode eq 0",
    "select": ["accountid", "name", "telephone1"],
    "top": 10
  }
}
```

**Resposta:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Registros de account (10):"
    },
    {
      "type": "text",
      "text": "[{\"accountid\":\"...\",\"name\":\"...\",\"telephone1\":\"...\"}]"
    }
  ]
}
```

### query-dynamics

**Descrição:** Permite consultas em linguagem natural simplificada.

**Parâmetros:**
- `query` (obrigatório): Consulta em formato "get [campos] from [entidade] where [condição]"

**Exemplo de uso:**
```json
{
  "name": "query-dynamics",
  "parameters": {
    "query": "get name, emailaddress1 from contacts where statecode = 0"
  }
}
```

**Sintaxe da consulta:**
```
get [campos] from [entidade] where [condição] order by [campo] limit [número]
```

**Exemplos de consultas válidas:**
- `get name, revenue from accounts where statecode = 0`
- `get title, prioritycode from incidents where createdon > 2023-01-01 order by createdon desc limit 5`
- `get * from contacts where emailaddress1 like '%contoso.com'`

### d365 (Comandos Abreviados)

**Descrição:** Permite usar uma sintaxe abreviada para operações comuns.

**Parâmetros:**
- `command` (obrigatório): Comando no formato "entidade:ação [parâmetros]"

**Exemplo de uso:**
```json
{
  "name": "d365",
  "parameters": {
    "command": "account:list statecode=0 top=5"
  }
}
```

**Ações disponíveis:**
- `list`: Lista registros (ex: `account:list`)
- `get`: Obtém um registro específico por ID (ex: `contact:get 12345`)
- `count`: Conta registros (ex: `opportunity:count statecode=0`)
- `search`: Pesquisa registros (ex: `account:search name=Contoso`)

**Parâmetros comuns:**
- `top=N`: Limita o número de resultados
- `select=campo1,campo2`: Seleciona campos específicos
- `order=campo asc|desc`: Ordena os resultados
- `expand=relacionamento`: Expande relacionamentos

---

## Ferramentas de Metadados

### get-entity-metadata

**Descrição:** Obtém metadados detalhados de uma entidade específica.

**Parâmetros:**
- `entityName` (obrigatório): Nome lógico da entidade (ex: account, contact, incident)
- `includeAttributes` (opcional): Se deve incluir detalhes dos atributos/campos (padrão: true)
- `includeOptionSets` (opcional): Se deve incluir detalhes dos conjuntos de opções (padrão: true)

**Exemplo de uso:**
```json
{
  "name": "get-entity-metadata",
  "parameters": {
    "entityName": "incident",
    "includeAttributes": true,
    "includeOptionSets": true
  }
}
```

**Resposta:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Metadados da entidade incident:"
    },
    {
      "type": "text",
      "text": "{\"entityName\":\"incident\",\"displayName\":\"Case\",\"schemaName\":\"Incident\",\"attributes\":[...]}"
    }
  ]
}
```

### metadata-explorer

**Descrição:** Ferramenta avançada para exploração de metadados do Dynamics 365.

**Parâmetros:**
- `action` (obrigatório): Ação a ser executada, uma das seguintes:
  - `list-entities`: Lista todas as entidades
  - `entity-details`: Obtém detalhes de uma entidade específica
  - `entity-attributes`: Lista atributos de uma entidade
  - `attribute-details`: Obtém detalhes de um atributo específico
  - `entity-relationships`: Lista relacionamentos de uma entidade
  - `search-entities`: Pesquisa entidades por texto
  - `search-attributes`: Pesquisa atributos dentro de uma entidade
  - `data-model`: Gera um modelo de dados resumido para entidades específicas
- `entityLogicalName` (opcional/obrigatório para algumas ações): Nome lógico da entidade a ser consultada (ex: `account`, `contact`). Usado por `entity-details`, `entity-attributes`, `attribute-details`, `entity-relationships`, `search-attributes`.
- `attributeLogicalName` (opcional/obrigatório para algumas ações): Nome lógico do atributo a ser consultado (ex: `name`, `emailaddress1`). Usado por `attribute-details`.
- `searchText` (opcional/obrigatório para pesquisas): Texto para pesquisa. Usado por `search-entities`, `search-attributes`.
- `refresh` (opcional): Se `true`, força a atualização do cache de metadados. Padrão: `false`.
- `entityNames` (opcional): Lista de nomes de entidades para gerar modelo de dados. Usado por `data-model`.
- `includeAttributes` (opcional): Para `entity-details`. Se `true`, inclui a lista de atributos da entidade. Padrão: `true`.
- `includeOptionSets` (opcional): Para `entity-details` e `attribute-details`. Se `true`, inclui os detalhes dos conjuntos de opções para os atributos. Padrão: `true`.
- `includeAttributeTypes` (opcional): Para `entity-details`. Se `true`, inclui os tipos dos atributos. Padrão: `true`.
- `selectEntityProperties` (opcional, array de strings): Para `entity-details`. Lista de propriedades da entidade a serem retornadas (ex: `DisplayName`, `SchemaName`, `PrimaryIdAttribute`). Se não fornecido, retorna todas as propriedades padrão.
- `selectAttributeProperties` (opcional, array de strings): Para `entity-details` (para os atributos dentro da entidade) e `attribute-details`. Lista de propriedades do atributo a serem retornadas (ex: `DisplayName`, `AttributeType`, `IsCustomAttribute`, `OptionSet`). Se não fornecido, retorna todas as propriedades padrão.

**Exemplo de uso:**
```json
{
  "name": "metadata-explorer",
  "parameters": {
    "action": "entity-attributes",
    "entityName": "incident",
    "refresh": true
  }
}
```

**Detalhes das ações:**

1.  **list-entities**
    -   Lista todas as entidades disponíveis no Dynamics 365.
    -   Parâmetros: `refresh` (opcional).

2.  **entity-details**
    -   Obtém detalhes completos de uma entidade específica.
    -   Parâmetros: `entityLogicalName` (obrigatório).
    -   Parâmetros opcionais: `refresh`, `includeAttributes`, `includeOptionSets`, `includeAttributeTypes`, `selectEntityProperties`, `selectAttributeProperties`.
    -   Exemplo:
        ```json
        {
          "name": "metadata-explorer",
          "parameters": {
            "action": "entity-details",
            "entityLogicalName": "account",
            "includeOptionSets": true,
            "selectEntityProperties": ["DisplayName", "PrimaryIdAttribute"],
            "selectAttributeProperties": ["DisplayName", "AttributeType"]
          }
        }
        ```

3.  **entity-attributes**
    -   Lista todos os atributos (campos) de uma entidade (geralmente nomes lógicos e de exibição).
    -   Parâmetros: `entityLogicalName` (obrigatório).
    -   Parâmetros opcionais: `refresh`.
    -   Nota: Para detalhes completos de um atributo específico, use `attribute-details`.

4.  **attribute-details**
    -   Obtém detalhes completos de um atributo específico de uma entidade.
    -   Parâmetros: `entityLogicalName` (obrigatório), `attributeLogicalName` (obrigatório).
    -   Parâmetros opcionais: `refresh`, `includeOptionSets`, `selectAttributeProperties`.
    -   Exemplo:
        ```json
        {
          "name": "metadata-explorer",
          "parameters": {
            "action": "attribute-details",
            "entityLogicalName": "account",
            "attributeLogicalName": "industrycode",
            "includeOptionSets": true,
            "selectAttributeProperties": ["DisplayName", "AttributeType", "OptionSet"]
          }
        }
        ```

5.  **entity-relationships**
    -   Lista todos os relacionamentos de uma entidade.
    -   Parâmetros: `entityLogicalName` (obrigatório).
    -   Parâmetros opcionais: `refresh`.

6.  **search-entities**
    -   Pesquisa entidades por texto no nome lógico, nome de exibição ou nome de esquema.
    -   Parâmetros: `searchText` (obrigatório).

7.  **search-attributes**
    -   Pesquisa atributos dentro de uma entidade por texto no nome lógico, nome de exibição ou nome de esquema.
    -   Parâmetros: `entityLogicalName` (obrigatório), `searchText` (obrigatório).

8.  **data-model**
    -   Gera um modelo de dados resumido (nomes lógicos e de exibição de entidades e seus atributos) para entidades específicas.
    -   Parâmetros: `entityNames` (opcional, array de nomes de entidades). Se não fornecido, pode tentar gerar para entidades comuns ou nenhuma.

---

## Assistente de Consulta Interativo

### query-assistant-start

**Descrição:** Inicia um assistente interativo para construção de consultas.

**Parâmetros:** Nenhum

**Exemplo de uso:**
```json
{
  "name": "query-assistant-start",
  "parameters": {}
}
```

**Resposta:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Assistente de consulta iniciado. Por favor, selecione a entidade que deseja consultar:"
    },
    {
      "type": "text",
      "text": "[Lista de entidades disponíveis]"
    }
  ],
  "_meta": {
    "sessionId": "12345",
    "step": "entity"
  }
}
```

### query-assistant-step

**Descrição:** Avança para o próximo passo no assistente de consulta.

**Parâmetros:**
- `value` (obrigatório): Valor para o passo atual
- `sessionId` (obrigatório): ID da sessão do assistente

**Exemplo de uso:**
```json
{
  "name": "query-assistant-step",
  "parameters": {
    "value": "account",
    "sessionId": "12345"
  }
}
```

### query-assistant-end

**Descrição:** Finaliza o assistente de consulta e executa a consulta.

**Parâmetros:**
- `sessionId` (obrigatório): ID da sessão do assistente

**Exemplo de uso:**
```json
{
  "name": "query-assistant-end",
  "parameters": {
    "sessionId": "12345"
  }
}
```

---

## Casos de Uso Comuns

### 1. Listar Casos Ativos

**Usando retrieve-entity:**
```json
{
  "name": "retrieve-entity",
  "parameters": {
    "entityName": "incidents",
    "filter": "statecode eq 0",
    "select": ["incidentid", "title", "createdon", "prioritycode", "statuscode"],
    "top": 10
  }
}
```

**Usando query-dynamics:**
```json
{
  "name": "query-dynamics",
  "parameters": {
    "query": "get incidentid, title, createdon, prioritycode, statuscode from incidents where statecode = 0 limit 10"
  }
}
```

**Usando d365:**
```json
{
  "name": "d365",
  "parameters": {
    "command": "incident:list statecode=0 top=10 select=incidentid,title,createdon,prioritycode,statuscode"
  }
}
```

### 2. Obter Detalhes de uma Conta

**Usando retrieve-entity:**
```json
{
  "name": "retrieve-entity",
  "parameters": {
    "entityName": "accounts",
    "filter": "accountid eq '12345'",
    "expand": ["primarycontactid"]
  }
}
```

**Usando d365:**
```json
{
  "name": "d365",
  "parameters": {
    "command": "account:get 12345 expand=primarycontactid"
  }
}
```

### 3. Encontrar Campos Booleanos em uma Entidade

**Usando metadata-explorer:**
```json
{
  "name": "metadata-explorer",
  "parameters": {
    "action": "entity-attributes",
    "entityName": "account"
  }
}
```

E depois filtrar os resultados para AttributeType = "Boolean".

**Usando get-entity-metadata:**
```json
{
  "name": "get-entity-metadata",
  "parameters": {
    "entityName": "account",
    "includeAttributes": true
  }
}
```

### 4. Gerar Modelo de Dados para Múltiplas Entidades

```json
{
  "name": "metadata-explorer",
  "parameters": {
    "action": "data-model",
    "entityNames": ["account", "contact", "opportunity"]
  }
}
```

---

## Solução de Problemas

### Erros Comuns

1. **400 Bad Request**
   - Verifique se o nome da entidade está correto
   - Confirme que os parâmetros estão no formato correto
   - Verifique se o filtro OData está correto

2. **401 Unauthorized**
   - Verifique as credenciais do Dynamics 365
   - Confirme que o token de acesso está sendo gerado corretamente

3. **Erros de Parsing JSON**
   - Certifique-se de que não há logs sendo enviados para stdout
   - Verifique se objetos complexos estão sendo serializados corretamente

### Logs

Os logs do servidor MCP são enviados para stderr para evitar interferência com a comunicação JSON. Para visualizar os logs:

```bash
npm run start 2> logs.txt
```

---

## Referência de Formato JSON

### Formato de Requisição MCP

```json
{
  "name": "nome-da-ferramenta",
  "parameters": {
    "parametro1": "valor1",
    "parametro2": "valor2"
  }
}
```

### Formato de Resposta MCP

```json
{
  "content": [
    {
      "type": "text",
      "text": "Mensagem de texto"
    },
    {
      "type": "text",
      "text": "Dados em formato JSON"
    }
  ],
  "_meta": {
    "chave1": "valor1",
    "chave2": "valor2"
  },
  "isError": false
}
```

---

## Informações sobre Schemas de Campos

Para obter informações detalhadas sobre o schema de um campo em uma entidade, você pode usar a ferramenta `get-entity-metadata` ou `metadata-explorer` com a ação `entity-attributes`.

### Exemplo para obter o schema de um campo:

```json
{
  "name": "get-entity-metadata",
  "parameters": {
    "entityName": "account",
    "includeAttributes": true
  }
}
```

Na resposta, cada atributo terá as seguintes informações:

- `name`: Nome lógico do campo (usado em consultas)
- `displayName`: Nome de exibição do campo na interface
- `schemaName`: Nome do schema do campo (o que você está procurando)
- `type`: Tipo do atributo (Boolean, String, Lookup, etc.)
- `required`: Se o campo é obrigatório
- `maxLength`: Para campos de texto, o tamanho máximo
- `precision`: Para campos numéricos, a precisão
- `format`: Formato específico do campo
- `options`: Para campos de opção, os valores possíveis
- `targets`: Para campos de lookup, as entidades alvo

### Detalhes específicos por tipo de campo:

#### Campos Booleanos
- `type`: "Boolean"
- `defaultValue`: Valor padrão (true/false)

#### Campos de Texto
- `type`: "String" ou "Memo"
- `maxLength`: Tamanho máximo
- `format`: Formato (Text, Email, Phone, etc.)

#### Campos Numéricos
- `type`: "Integer", "Decimal", "Money", etc.
- `precision`: Precisão
- `minValue`: Valor mínimo
- `maxValue`: Valor máximo

#### Campos de Data/Hora
- `type`: "DateTime"
- `format`: Formato (DateOnly, DateAndTime)
- `behavior`: Comportamento (UserLocal, DateOnly, TimeZoneIndependent)

#### Campos de Opção
- `type`: "Picklist", "Status", "State"
- `options`: Lista de opções com valores e rótulos

#### Campos de Lookup
- `type`: "Lookup", "Customer", "Owner"
- `targets`: Entidades alvo do lookup
