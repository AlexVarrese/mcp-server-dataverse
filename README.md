# MCP Dynamics 365

## Introdução

O MCP Dynamics é uma implementação do Model Context Protocol (MCP) para integração com o Microsoft Dynamics 365. Este projeto permite que agentes de IA interajam com o Dynamics 365 através de um conjunto de ferramentas e recursos padronizados, facilitando a automatização de processos e a integração com assistentes virtuais.

## Funcionalidades Principais

- **Gerenciamento de Casos**: Criação, atualização, atribuição e escalação de casos
- **Gerenciamento de Contatos**: Criação, atualização e busca avançada de contatos
- **Gerenciamento de Contas**: Criação, atualização e visualização da hierarquia de contas
- **Integração com Workflows**: Execução e monitoramento de workflows do Dynamics 365
- **Consultas Flexíveis**: Interface para consultas personalizadas a qualquer entidade do Dynamics 365
- **Recursos de IA**: Prompts para resumo de casos, sugestão de artigos e criação de emails

## Pré-requisitos

- Node.js 16.x ou superior
- NPM 8.x ou superior
- Acesso a uma instância do Dynamics 365
- Credenciais de API do Dynamics 365 (ClientID, ClientSecret, TenantID)

## Guia de Instalação

### 1. Clonar o Repositório

```bash
git clone https://seu-repositorio/mcp-dynamics.git
cd mcp-dynamics
```

### 2. Instalar Dependências

```bash
npm install
```

### 3. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```
DYNAMICS_URL=https://sua-instancia.crm.dynamics.com
DYNAMICS_CLIENT_ID=seu-client-id
DYNAMICS_CLIENT_SECRET=seu-client-secret
DYNAMICS_TENANT_ID=seu-tenant-id
DYNAMICS_API_VERSION=9.2
```

### 4. Compilar o Projeto

```bash
npm run build
```

### 5. Iniciar o Servidor MCP

```bash
npm run start:sse
```

O servidor MCP estará disponível em `http://localhost:3001/mcp/sse`.

## Guia de Uso com Visual Studio Code e GitHub Copilot

### Configuração do Visual Studio Code

1. **Instalar Extensões Recomendadas**:
   - ESLint
   - Prettier
   - TypeScript
   - GitHub Copilot
   - REST Client (para testar as APIs)

2. **Configurar GitHub Copilot**:
   - Certifique-se de ter uma assinatura ativa do GitHub Copilot
   - Faça login na sua conta GitHub no VS Code
   - Ative o GitHub Copilot nas configurações do VS Code

### Desenvolvimento com GitHub Copilot

#### 1. Explorando o Código com Copilot

O GitHub Copilot pode ajudar a entender o código existente. Experimente:

- **Gerar Comentários Explicativos**: Posicione o cursor acima de um método e digite `// Explique o que este método faz`

```typescript
// Explique o que este método faz
public async createCase(data: Record<string, any>): Promise<any> {
  // Copilot irá gerar uma explicação do método
}
```

- **Navegar pelo Código**: Use o comando `//#region` para criar seções dobráveis que o Copilot pode ajudar a organizar

#### 2. Implementando Novas Funcionalidades

Para implementar uma nova funcionalidade usando o Copilot:

1. **Descreva a Funcionalidade em Comentários**:

```typescript
// Implementar um método para buscar oportunidades relacionadas a uma conta
// O método deve aceitar o ID da conta e retornar todas as oportunidades ativas
// Deve incluir o nome, valor e fase da oportunidade
```

2. **Deixe o Copilot Sugerir a Implementação**:
   - Pressione `Tab` para aceitar as sugestões
   - Use `Alt+]` para ver a próxima sugestão
   - Use `Alt+[` para ver a sugestão anterior

3. **Refine o Código Gerado**:
   - Verifique se o código segue os padrões do projeto
   - Adicione tratamento de erros adequado
   - Documente o código com comentários JSDoc

#### 3. Criando Novas Ferramentas MCP

Para adicionar uma nova ferramenta ao servidor MCP:

1. **Implemente o Método no DynamicsService**:

```typescript
// Implementar um método para gerenciar oportunidades no Dynamics 365
public async createOpportunity(data: Record<string, any>): Promise<any> {
  // Deixe o Copilot sugerir a implementação
}
```

2. **Registre a Ferramenta no Servidor MCP**:

```typescript
// Registrar uma nova ferramenta para criar oportunidades
server.tool(
  "createOpportunity",
  {
    // Deixe o Copilot sugerir os parâmetros
  },
  async ({ /* parâmetros */ }) => {
    // Deixe o Copilot sugerir a implementação
  }
);
```

## Exemplos de Uso

### 1. Consultar Contas

```typescript
// Exemplo de uso da ferramenta query-accounts
const result = await mcp.invoke("query-accounts", { searchTerm: "Contoso" });
console.log(result);
```

### 2. Criar um Caso

```typescript
// Exemplo de uso da ferramenta createCase
const result = await mcp.invoke("createCase", { 
  customerId: "5a8b5e9c-3f9d-4b8c-a7d6-1e2f3a4b5c6d", 
  subject: "Problema com o produto XYZ", 
  description: "O cliente relatou que o produto XYZ não está funcionando corretamente." 
});
console.log(result);
```

### 3. Buscar Atividades de um Caso

```typescript
// Exemplo de uso da ferramenta getCaseActivities
const result = await mcp.invoke("getCaseActivities", { 
  caseId: "7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e",
  maxResults: 10
});
console.log(result);
```

## Ferramentas Disponíveis

### Gerenciamento de Casos
- `createCase` - Criar um novo caso
- `addNoteToCase` - Adicionar uma nota a um caso
- `updateCaseStatus` - Atualizar o status de um caso
- `scheduleFollowUpTask` - Agendar uma tarefa de acompanhamento
- `assignCase` - Atribuir um caso a um usuário ou equipe
- `escalateCase` - Escalar um caso com mudança de prioridade
- `bulkUpdateCases` - Atualizar múltiplos casos de uma vez
- `getCaseActivities` - Obter atividades de um caso

### Gerenciamento de Contatos
- `createContact` - Criar um novo contato
- `updateContact` - Atualizar um contato existente
- `searchContacts` - Buscar contatos com filtros avançados

### Gerenciamento de Contas
- `createAccount` - Criar uma nova conta
- `updateAccount` - Atualizar uma conta existente
- `getAccountHierarchy` - Obter a hierarquia de uma conta

### Integração com Workflows
- `triggerWorkflow` - Executar um workflow
- `getWorkflowStatus` - Verificar o status de um workflow

### Consultas Flexíveis
- `query-accounts` - Consultar contas
- `query-dynamics` - Realizar consultas personalizadas
- `retrieve-entity` - Recuperar registros de qualquer entidade
- `get-entity-metadata` - Obter metadados de uma entidade

## Suporte e Contribuição

Para relatar problemas ou contribuir com o projeto, abra uma issue no repositório do GitHub.

## Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo LICENSE para mais detalhes.