// src/server.ts
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dynamicsService } from './services/dynamicsService.js';
import { nlQueryService } from './services/nlQueryService.js';
import { shortCommandService } from './services/shortCommandService.js';
import { queryAssistantService } from './services/queryAssistantService.js';
import { metadataExplorerService } from './services/metadataExplorerService.js';
import logger from "./logger.js";

// Interface para declarar os métodos do dynamicsService que são usados neste arquivo
interface DynamicsServiceInterface {
  // Métodos de metadados
  getEntityMetadata(entityName: string, options?: any): Promise<any>;
  
  // Métodos de consulta
  queryEntities(entityName: string, options?: any): Promise<any>;
  executeAction(actionName: string, parameters?: any): Promise<any>;
  
  // Métodos de manipulação de entidades
  createEntity(entityName: string, data: Record<string, any>): Promise<any>;
  updateEntity(entityName: string, entityId: string, data: Record<string, any>): Promise<any>;
  
  // Métodos específicos para contatos
  createContact(data: Record<string, any>): Promise<any>;
  updateContact(contactId: string, data: Record<string, any>): Promise<any>;
  searchContacts(filters: Record<string, any>, options?: any): Promise<any>;
  
  // Métodos específicos para contas
  createAccount(data: Record<string, any>): Promise<any>;
  updateAccount(accountId: string, data: Record<string, any>): Promise<any>;
  getAccountHierarchy(accountId: string): Promise<any>;
  
  // Métodos específicos para casos
  assignCase(caseId: string, assigneeId: string, assigneeType: 'systemuser' | 'team'): Promise<any>;
  escalateCase(caseId: string, newPriority: number, escalationNotes: string, assigneeId?: string): Promise<any>;
  bulkUpdateCases(caseIds: string[], updateData: Record<string, any>): Promise<any>;
  getCaseActivities(caseId: string, activityTypes?: string[], options?: any): Promise<any>;
  
  // Métodos de workflow
  triggerWorkflow(workflowId: string, entityName: string, entityId: string): Promise<any>;
  getWorkflowStatus(workflowInstanceId: string): Promise<any>;
}

// Cast do dynamicsService para a interface
const typedDynamicsService = dynamicsService as unknown as DynamicsServiceInterface;

logger.info("Inicializando a definição do servidor MCP para Dynamics 365...");

// Verificar se as variáveis de ambiente necessárias estão definidas
const requiredEnvVars = [
  'DYNAMICS_URL',
  'DYNAMICS_CLIENT_ID',
  'DYNAMICS_CLIENT_SECRET',
  'DYNAMICS_TENANT_ID'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  logger.warn(`As seguintes variáveis de ambiente não estão definidas: ${missingEnvVars.join(', ')}`);
  logger.warn('A funcionalidade completa pode não estar disponível sem estas variáveis.');
}

// Configuração do ambiente Dynamics 365
const dynamicsConfig = {
  url: process.env.DYNAMICS_URL || 'https://exemplo.crm.dynamics.com',
  clientId: process.env.DYNAMICS_CLIENT_ID || '',
  clientSecret: process.env.DYNAMICS_CLIENT_SECRET || '',
  tenantId: process.env.DYNAMICS_TENANT_ID || ''
};

// 1. Cria a instância do Servidor MCP
const server = new McpServer({
  name: "Dynamics 365 MCP Server",
  version: "1.0.0",
});

// Armazena as informações do servidor para fácil acesso
const serverInfo = {
  name: "Dynamics 365 MCP Server",
  version: "1.0.0"
};

logger.info(`Servidor "${serverInfo.name}" v${serverInfo.version} criado.`);

// 2. Recursos (Resources) do Dynamics 365
// 2.1 Recurso: Buscar Detalhes de um Caso
server.resource(
  "cases",
  new ResourceTemplate("d365://cases/{caseId}", { list: undefined }),
  async (uri, { caseId }) => {
    logger.debug(`[Resource:cases] Acessado com URI: ${uri.href}, caseId=${caseId}`);
    
    try {
      // Usar o serviço do Dynamics para buscar o caso
      const caseData = await dynamicsService.queryEntities('incidents', {
        filter: `incidentid eq ${caseId}`,
        expand: ['customerid_account']
      });
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(caseData[0] || {}, null, 2)
        }]
      };
    } catch (error: any) {
      logger.error(`[Resource:cases] Erro ao buscar caso ${caseId}:`, error);
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({ error: "Erro ao buscar caso", message: error.message }, null, 2)
        }]
      };
    }
  }
);
logger.info("Recurso 'cases' registrado.");

// 2.2 Recurso: Listar Casos Ativos de um Cliente
server.resource(
  "activeCases",
  new ResourceTemplate("d365://accounts/{accountId}/activecases", { list: undefined }),
  async (uri, { accountId }) => {
    logger.debug(`[Resource:activeCases] Acessado com URI: ${uri.href}, accountId=${accountId}`);
    
    try {
      // Usar o serviço do Dynamics para buscar casos ativos do cliente
      const casesData = await typedDynamicsService.queryEntities('incidents', {
        filter: `_customerid_value eq ${accountId} and statuscode eq 1`,
        orderBy: 'createdon desc'
      });
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(casesData, null, 2)
        }]
      };
    } catch (error: any) {
      logger.error(`[Resource:activeCases] Erro ao buscar casos ativos para conta ${accountId}:`, error);
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({ error: "Erro ao buscar casos ativos", message: error.message }, null, 2)
        }]
      };
    }
  }
);
logger.info("Recurso 'activeCases' registrado.");

// 2.3 Recurso: Pesquisar Artigos da Base de Conhecimento
server.resource(
  "knowledgebase",
  new ResourceTemplate("d365://knowledgebase/search?query={query}", { list: undefined }),
  async (uri, { query }) => {
    logger.debug(`[Resource:knowledgebase] Acessado com URI: ${uri.href}, query=${query}`);
    
    try {
      // Usar o serviço do Dynamics para buscar artigos da KB
      const kbArticles = await typedDynamicsService.queryEntities('knowledgearticles', {
        filter: `contains(title, '${query as string}') or contains(content, '${query as string}')`,
        select: ['title', 'articlepublicnumber', 'description'],
        top: 5
      });
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(kbArticles, null, 2)
        }]
      };
    } catch (error: any) {
      console.error(`[Resource:knowledgebase] Erro ao buscar artigos da KB com query ${query}:`, error);
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({ error: "Erro ao buscar artigos da KB", message: error.message }, null, 2)
        }]
      };
    }
  }
);
logger.info("Recurso 'knowledgebase' registrado.");

// 2.4 Recurso: Obter Detalhes do Cliente (Conta)
server.resource(
  "accounts",
  new ResourceTemplate("d365://accounts/{accountId}", { list: undefined }),
  async (uri, { accountId }) => {
    logger.debug(`[Resource:accounts] Acessado com URI: ${uri.href}, accountId=${accountId}`);
    
    try {
      // Usar o serviço do Dynamics para buscar detalhes da conta
      const accountData = await typedDynamicsService.queryEntities('accounts', {
        filter: `accountid eq ${accountId}`,
        select: ['name', 'emailaddress1', 'telephone1', 'address1_composite']
      });
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(accountData[0] || {}, null, 2)
        }]
      };
    } catch (error: any) {
      console.error(`[Resource:accounts] Erro ao buscar conta ${accountId}:`, error);
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({ error: "Erro ao buscar conta", message: error.message }, null, 2)
        }]
      };
    }
  }
);
logger.info("Recurso 'accounts' registrado.");

// 3. Ferramentas (Tools) do Dynamics 365
// 3.1 Ferramenta: Criar Novo Caso
server.tool(
  "createCase",
  { 
    customerId: z.string().describe("ID da Conta/Contato do cliente"), 
    subject: z.string().describe("Assunto do caso"), 
    description: z.string().describe("Descrição detalhada do caso")
  },
  async ({ customerId, subject, description }) => {
    logger.debug(`[Tool:createCase] Recebido: customerId=${customerId}, subject=${subject}`);
    
    try {
      // Usar o serviço do Dynamics para criar um novo caso
      const newCase = await typedDynamicsService.createEntity('incidents', { 
        "customerid_account@odata.bind": `/accounts(${customerId})`,
        "title": subject,
        "description": description
      });
      
      return {
        content: [{ 
          type: "text", 
          text: `Caso criado com sucesso! ID: ${newCase.id}\nAssunto: ${subject}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:createCase] Erro ao criar caso:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao criar caso: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'createCase' registrada.");

// 3.2 Ferramenta: Adicionar Anotação a um Caso
server.tool(
  "addNoteToCase",
  { 
    caseId: z.string().describe("ID do caso ao qual adicionar a nota"), 
    noteText: z.string().describe("Texto da nota a ser adicionada")
  },
  async ({ caseId, noteText }) => {
    logger.debug(`[Tool:addNoteToCase] Recebido: caseId=${caseId}, noteText=${noteText.substring(0, 50)}...`);
    
    try {
      // Usar o serviço do Dynamics para adicionar uma anotação
      const newNote = await typedDynamicsService.createEntity('annotations', { 
        "objectid_incident@odata.bind": `/incidents(${caseId})`,
        "subject": "Nota adicionada via MCP",
        "notetext": noteText
      });
      
      return {
        content: [{ 
          type: "text", 
          text: `Nota adicionada com sucesso ao caso ${caseId}!`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:addNoteToCase] Erro ao adicionar nota ao caso ${caseId}:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao adicionar nota: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'addNoteToCase' registrada.");

// 3.3 Ferramenta: Atualizar Status do Caso
server.tool(
  "updateCaseStatus",
  { 
    caseId: z.string().describe("ID do caso a ser atualizado"), 
    newStatus: z.string().describe("Novo status do caso (ex: 'Resolvido', 'Em Andamento')"),
    resolutionDetails: z.string().optional().describe("Detalhes da resolução (opcional, apenas para casos resolvidos)")
  },
  async ({ caseId, newStatus, resolutionDetails }) => {
    logger.debug(`[Tool:updateCaseStatus] Recebido: caseId=${caseId}, newStatus=${newStatus}`);
    
    try {
      // Em uma implementação real, você converteria o status em texto para o valor numérico
      // que o Dynamics 365 espera (statuscode)
      const statusMapping: Record<string, number> = {
        "Ativo": 1,
        "Em Andamento": 2,
        "Resolvido": 5,
        "Cancelado": 6
      };
      
      const statusCode = statusMapping[newStatus] || 1;
      
      const updateData: Record<string, any> = { 
        "statuscode": statusCode
      };
      
      if (newStatus === "Resolvido" && resolutionDetails) {
        updateData["resolution"] = resolutionDetails;
      }
      
      // Usar o serviço do Dynamics para atualizar o status do caso
      await typedDynamicsService.updateEntity('incidents', caseId, updateData);
      
      return {
        content: [{ 
          type: "text", 
          text: `Status do caso ${caseId} atualizado para "${newStatus}" com sucesso!`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:updateCaseStatus] Erro ao atualizar status do caso ${caseId}:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao atualizar status: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'updateCaseStatus' registrada.");

// 3.4 Ferramenta: Agendar Tarefa de Acompanhamento
server.tool(
  "scheduleFollowUpTask",
  { 
    caseId: z.string().describe("ID do caso associado à tarefa"), 
    subject: z.string().describe("Assunto da tarefa"),
    dueDate: z.string().describe("Data de vencimento da tarefa (formato ISO: YYYY-MM-DD)")
  },
  async ({ caseId, subject, dueDate }) => {
    logger.debug(`[Tool:scheduleFollowUpTask] Recebido: caseId=${caseId}, subject=${subject}, dueDate=${dueDate}`);
    
    try {
      // Usar o serviço do Dynamics para criar uma tarefa
      const newTask = await typedDynamicsService.createEntity('tasks', { 
        "regardingobjectid_incident@odata.bind": `/incidents(${caseId})`,
        "subject": subject,
        "scheduledend": new Date(dueDate).toISOString()
      });
      
      return {
        content: [{ 
          type: "text", 
          text: `Tarefa de acompanhamento agendada para ${dueDate}!\nAssunto: ${subject}\nCaso: ${caseId}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:scheduleFollowUpTask] Erro ao agendar tarefa para caso ${caseId}:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao agendar tarefa: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'scheduleFollowUpTask' registrada.");

// 4. Prompts para o Dynamics 365
// 4.1 Prompt: Resumir Caso para Agente
server.prompt(
  "summarizeCaseForAgent",
  { caseId: z.string().describe("ID do caso a ser resumido") },
  ({ caseId }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `
Você é um assistente especializado em suporte ao cliente.
Por favor, analise os dados do caso a seguir e crie um resumo conciso e útil para um agente que acabou de ser designado para atendê-lo.
Destaque os pontos mais importantes, como:
- Problema principal
- Histórico de interações
- Informações do cliente
- Próximos passos recomendados

Use o recurso d365://cases/${caseId} para obter os detalhes do caso.
`
      }
    }]
  })
);
logger.info("Prompt 'summarizeCaseForAgent' registrado.");

// 4.2 Prompt: Sugerir Artigo da KB para Resolução de Caso
server.prompt(
  "suggestKBArticle",
  { caseId: z.string().describe("ID do caso para o qual sugerir artigos") },
  ({ caseId }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `
Você é um especialista em suporte técnico.
Por favor, analise o caso a seguir e sugira artigos da base de conhecimento que possam ajudar a resolvê-lo.

1. Primeiro, use o recurso d365://cases/${caseId} para obter os detalhes do caso.
2. Identifique as palavras-chave mais relevantes do problema descrito.
3. Use o recurso d365://knowledgebase/search?query={palavras-chave} para buscar artigos relacionados.
4. Apresente os artigos mais relevantes, com uma breve explicação de por que cada um pode ser útil para este caso específico.
`
      }
    }]
  })
);
logger.info("Prompt 'suggestKBArticle' registrado.");

// 4.3 Prompt: Rascunhar Email de Resolução para Cliente
server.prompt(
  "draftResolutionEmail",
  { 
    caseId: z.string().describe("ID do caso resolvido"), 
    resolutionSummary: z.string().describe("Resumo da resolução aplicada")
  },
  ({ caseId, resolutionSummary }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `
Você é um especialista em comunicação com clientes.
Por favor, redija um email profissional e amigável para informar o cliente sobre a resolução do seu caso de suporte.

1. Use o recurso d365://cases/${caseId} para obter os detalhes do caso.
2. Use o ID do cliente no caso para buscar suas informações através do recurso d365://accounts/{customerId}.
3. Crie um email que:
   - Cumprimente o cliente pelo nome
   - Faça referência ao número do caso e ao assunto
   - Explique a resolução de forma clara e concisa, baseando-se no resumo: "${resolutionSummary}"
   - Pergunte se há mais alguma coisa em que possamos ajudar
   - Inclua uma solicitação educada para que o cliente responda a uma pesquisa de satisfação
   - Termine com uma assinatura profissional

O tom deve ser profissional mas caloroso, e o email deve ser formatado adequadamente.
`
      }
    }]
  })
);
logger.info("Prompt 'draftResolutionEmail' registrado.");

// Ferramenta de diagnóstico: whoami
server.tool(
  "whoami",
  {},
  async () => {
    try {
      // Usar o serviço do Dynamics para executar a ação WhoAmI
      const whoAmIResult = await typedDynamicsService.executeAction('WhoAmI');
      
      const envInfo = {
        dynamicsUrl: dynamicsConfig.url,
        clientIdPresent: !!dynamicsConfig.clientId,
        clientSecretPresent: !!dynamicsConfig.clientSecret,
        tenantIdPresent: !!dynamicsConfig.tenantId,
        serverName: serverInfo.name,
        serverVersion: serverInfo.version,
        nodeEnv: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        dynamicsInfo: whoAmIResult
      };
      
      return {
        content: [{ 
          type: "text", 
          text: `Informações do servidor MCP:\n${JSON.stringify(envInfo, null, 2)}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:whoami] Erro ao executar consulta de identidade:`, error);
      
      const envInfo = {
        dynamicsUrl: dynamicsConfig.url,
        clientIdPresent: !!dynamicsConfig.clientId,
        clientSecretPresent: !!dynamicsConfig.clientSecret,
        tenantIdPresent: !!dynamicsConfig.tenantId,
        serverName: serverInfo.name,
        serverVersion: serverInfo.version,
        nodeEnv: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        error: error.message
      };
      
      return {
        content: [{ 
          type: "text", 
          text: `Informações do servidor MCP:\n${JSON.stringify(envInfo, null, 2)}`
        }]
      };
    }
  }
);
logger.info("Ferramenta de diagnóstico 'whoami' registrada.");

// Ferramenta de consulta: query-accounts
server.tool(
  "query-accounts",
  { 
    searchTerm: z.string().optional().describe("Termo para filtrar contas (opcional)")
  },
  async ({ searchTerm }) => {
    logger.debug(`[Tool:query-accounts] Recebido: searchTerm=${searchTerm || 'nenhum'}`);
    
    try {
      // Construir o filtro com base no termo de busca
      let filter = '';
      if (searchTerm) {
        filter = `contains(name, '${searchTerm}') or contains(emailaddress1, '${searchTerm}') or contains(telephone1, '${searchTerm}')`;
      }
      
      // Usar o serviço do Dynamics para consultar contas
      const accounts = await typedDynamicsService.queryEntities('accounts', {
        filter,
        select: ['accountid', 'name', 'industry', 'revenue'],
        top: 10,
        orderBy: 'name asc'
      });
      
      return {
        content: [{ 
          type: "text", 
          text: `Contas encontradas (${accounts.length}):\n${JSON.stringify(accounts, null, 2)}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:query-accounts] Erro ao consultar contas:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao consultar contas: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'query-accounts' registrada.");

// Nova ferramenta: query-dynamics - Consulta flexível ao Dynamics 365
server.tool(
  "query-dynamics",
  {
    query: z.string().describe("Consulta no formato 'get [campos] from [entidade] where [condição]'"),
    parameters: z.record(z.any()).optional().describe("Parâmetros adicionais para a consulta")
  },
  async ({ query, parameters = {} }) => {
    logger.debug(`[Tool:query-dynamics] Executando consulta: ${query}`);
    logger.debug(`[Tool:query-dynamics] Parâmetros: ${JSON.stringify(parameters, null, 2)}`);
    
    try {
      // Analisar a consulta MCP
      // Formato: get [campos] from [entidade] where [condição]
      const queryRegex = /get\s+(.*?)\s+from\s+(\w+)(?:\s+where\s+(.+))?/i;
      const match = query.match(queryRegex);
      
      if (!match) {
        throw new Error('Formato de consulta inválido. Esperado: get [campos] from [entidade] where [condição]');
      }
      
      const [, fields, entity, whereClause] = match;
      
      // Preparar as opções para a consulta OData
      const options: Record<string, any> = { ...parameters };
      
      // Adicionar campos de seleção
      if (fields && fields.trim() !== '*') {
        options.select = fields.split(',').map((f: string) => f.trim());
      }
      
      // Adicionar filtro se a cláusula where estiver presente
      if (whereClause && !options.filter) {
        // Converter a cláusula where MCP para filtro OData
        options.filter = whereClause.trim();
      }
      
      logger.debug(`[Tool:query-dynamics] Entidade: ${entity.trim()}`);
      logger.debug(`[Tool:query-dynamics] Opções: ${JSON.stringify(options, null, 2)}`);
      
      // Executar a consulta usando o dynamicsService
      const result = await typedDynamicsService.queryEntities(entity.trim(), options);
      
      return {
        content: [{ 
          type: "text", 
          text: `Resultados da consulta (${result.length}):\n${JSON.stringify(result, null, 2)}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:query-dynamics] Erro ao executar consulta:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao executar consulta: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'query-dynamics' registrada.");

// Ferramenta específica para buscar um caso pelo ID
server.tool(
  "get-case",
  {
    caseId: z.string().describe("ID do caso a ser buscado")
  },
  async ({ caseId }) => {
    logger.debug(`[Tool:get-case] Buscando caso com ID: ${caseId}`);
    
    try {
      // Usar o serviço do Dynamics para buscar o caso
      const caseData = await dynamicsService.queryEntities('incidents', {
        filter: `incidentid eq ${caseId}`,
        expand: ['customerid_account']
      });
      
      if (caseData.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: `Caso com ID ${caseId} não encontrado.`
          }]
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Detalhes do caso ${caseId}:\n${JSON.stringify(caseData[0], null, 2)}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:get-case] Erro ao buscar caso ${caseId}:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao buscar caso: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'get-case' registrada.");

// Ferramenta para recuperar registros de qualquer entidade
server.tool(
  "retrieve-entity",
  {
    entityName: z.string().describe("Nome da entidade no Dynamics 365 (ex: accounts, contacts, incidents)"),
    filter: z.string().optional().describe("Filtro OData para a consulta (opcional)"),
    select: z.array(z.string()).optional().describe("Campos a serem retornados (opcional)"),
    top: z.number().optional().describe("Número máximo de registros a serem retornados (opcional, padrão: 10)"),
    orderBy: z.string().optional().describe("Campo para ordenação (opcional)"),
    expand: z.array(z.string()).optional().describe("Relacionamentos a serem expandidos (opcional)")
  },
  async ({ entityName, filter, select, top = 10, orderBy, expand }) => {
    logger.debug(`[Tool:retrieve-entity] Consultando entidade: ${entityName}`);
    logger.debug(`[Tool:retrieve-entity] Filtro: ${filter || 'nenhum'}`);
    
    try {
      // Preparar as opções para a consulta
      const options: Record<string, any> = {};
      
      if (filter) options.filter = filter;
      if (select) options.select = select;
      if (top) options.top = Math.min(top, 50); // Limitar a 50 registros no máximo
      if (orderBy) options.orderBy = orderBy;
      if (expand) options.expand = expand;
      
      // Executar a consulta usando o dynamicsService
      const results = await typedDynamicsService.queryEntities(entityName, options);
      
      return {
        content: [{ 
          type: "text", 
          text: `Registros de ${entityName} (${results.length}):\n${JSON.stringify(results, null, 2)}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:retrieve-entity] Erro ao consultar entidade ${entityName}:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao consultar entidade ${entityName}: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'retrieve-entity' registrada.");

// Interface para o tipo de resposta formatada dos metadados
interface EntityMetadataResponse {
  entityName: string;
  displayName: string;
  schemaName: string;
  primaryIdAttribute?: string;
  primaryNameAttribute?: string;
  attributes?: Array<{
    name: string;
    displayName: string;
    type: string;
    required: boolean;
    maxLength?: number;
    format?: string;
    options?: Array<{
      value: number;
      label: string;
    }>;
    targets?: string[];
    minValue?: number;
    maxValue?: number;
    precision?: number;
  }>;
}

// // Ferramenta para consultas em linguagem natural ao Dynamics 365
// server.tool(
//   "dynamics-query",
//   {
//     query: z.string().describe("Consulta em linguagem natural, ex: 'mostrar contatos ativos', 'listar contas em São Paulo', 'buscar caso com título contendo suporte'")
//   },
//   async ({ query }) => {
//     logger.debug(`[Tool:dynamics-query] Processando consulta: ${query}`);
    
//     try {
//       // Processar comandos simplificados
//       if (query.toLowerCase().startsWith('get metadata')) {
//         // Extrair o nome da entidade
//         const parts = query.split(' ');
//         if (parts.length < 3) {
//           return {
//             content: [{ 
//               type: "text", 
//               text: `Comando incompleto. Use 'get metadata [entidade]', por exemplo: 'get metadata contacts'`
//             }]
//           };
//         }
        
//         const entityName = parts[2].toLowerCase();
        
//         // Chamar diretamente o serviço Dynamics em vez de usar callTool
//         logger.debug(`[Tool:dynamics-query] Consultando metadados da entidade: ${entityName}`);
        
//         try {
//           // Preparar as opções para a consulta de metadados
//           const options = {
//             includeAttributes: true,
//             attributeTypes: true,
//             optionSets: true
//           };
          
//           // Executar a consulta usando o typedDynamicsService
//           const metadata = await typedDynamicsService.getEntityMetadata(entityName, options);
          
//           // Formatar a resposta para entidade completa
//           let formattedResponse: EntityMetadataResponse = {
//             entityName: metadata.LogicalName,
//             displayName: metadata.DisplayName?.UserLocalizedLabel?.Label || metadata.SchemaName,
//             schemaName: metadata.SchemaName,
//             primaryIdAttribute: metadata.PrimaryIdAttribute,
//             primaryNameAttribute: metadata.PrimaryNameAttribute
//           };
          
//           // Adicionar atributos
//           if (metadata.Attributes) {
//             formattedResponse = {
//               ...formattedResponse,
//               attributes: metadata.Attributes.map((attr: any) => {
//                 const attribute = {
//                   name: attr.LogicalName,
//                   displayName: attr.DisplayName?.UserLocalizedLabel?.Label || attr.SchemaName,
//                   type: attr.AttributeType,
//                   required: attr.RequiredLevel?.Value === 'Required'
//                 };
                
//                 // Adicionar informações específicas por tipo
//                 if (attr.AttributeType === 'String' || attr.AttributeType === 'Memo') {
//                   Object.assign(attribute, { maxLength: attr.MaxLength });
//                 }
                
//                 if (attr.Format) {
//                   Object.assign(attribute, { format: attr.Format });
//                 }
                
//                 // Adicionar informações de OptionSet
//                 if ((attr.AttributeType === 'Picklist' || attr.AttributeType === 'Status' || attr.AttributeType === 'State') && 
//                     attr.OptionSet) {
//                   Object.assign(attribute, { 
//                     options: attr.OptionSet.Options.map((opt: any) => ({
//                       value: opt.Value,
//                       label: opt.Label?.UserLocalizedLabel?.Label || `Option ${opt.Value}`
//                     }))
//                   });
//                 }
                
//                 // Adicionar informações de lookup
//                 if (attr.AttributeType === 'Lookup' && attr.Targets) {
//                   Object.assign(attribute, { targets: attr.Targets });
//                 }
                
//                 return attribute;
//               })
//             };
//           }
          
//           return {
//             content: [{ 
//               type: "text", 
//               text: `Metadados da entidade ${entityName}:\n${JSON.stringify(formattedResponse, null, 2)}`
//             }]
//           };
//         } catch (error: any) {
//           logger.error(`[Tool:dynamics-query] Erro ao consultar metadados da entidade ${entityName}:`, error);
//           return {
//             content: [{ 
//               type: "text", 
//               text: `Erro ao consultar metadados da entidade ${entityName}: ${error.message}`
//             }]
//           };
//         }
//       }
      
//       // Adicionar mais comandos simplificados aqui
      
//       // Resposta padrão se nenhum comando for reconhecido
//       return {
//         content: [{ 
//           type: "text", 
//           text: `Comando não reconhecido: ${query}. Tente comandos como 'get metadata [entidade]'.`
//         }]
//       };
//     } catch (error: any) {
//       logger.error(`[Tool:dynamics-query] Erro ao processar consulta: ${query}`, error);
//       return {
//         content: [{ 
//           type: "text", 
//           text: `Erro ao processar consulta: ${error.message}`
//         }]
//       };
//     }
//   }
// );
// logger.info("Ferramenta 'dynamics-query' registrada.");

// Ferramenta para obter metadados de uma entidade (tabela) do Dynamics 365
server.tool(
  "get-entity-metadata",
  {
    entityName: z.string().describe("Nome lógico da entidade/tabela no Dynamics 365 (ex: account, contact, incident)"),
    attributeName: z.string().optional().describe("Nome lógico do atributo específico a ser consultado (ex: name, emailaddress1, prioritycode)"),
    includeAttributes: z.boolean().optional().describe("Se deve incluir detalhes dos atributos/campos (padrão: true)"),
    includeOptionSets: z.boolean().optional().describe("Se deve incluir detalhes dos conjuntos de opções (OptionSets) dos campos (padrão: true)")
  },
  async ({ entityName, attributeName, includeAttributes = true, includeOptionSets = true }) => {
    logger.debug(`[Tool:get-entity-metadata] Consultando metadados da entidade: ${entityName}${attributeName ? `, atributo: ${attributeName}` : ''}`);
    
    try {
      // Preparar as opções para a consulta de metadados
      const options = {
        includeAttributes,
        includeAttributeTypes: true, // Corrected from attributeTypes
        includeOptionSets: includeOptionSets, // Corrected from optionSets (ensuring key is includeOptionSets)
        attributeName
      };
      
      // Executar a consulta usando o typedDynamicsService
      const metadata = await typedDynamicsService.getEntityMetadata(entityName, options);
      
      // Se estamos consultando um atributo específico, o formato da resposta é diferente
      if (attributeName) {
        // Formatar a resposta para um atributo específico
        const formattedAttribute = {
          name: metadata.LogicalName,
          displayName: metadata.DisplayName?.UserLocalizedLabel?.Label || metadata.SchemaName,
          type: metadata.AttributeType,
          required: metadata.RequiredLevel?.Value === 'Required',
          description: metadata.Description?.UserLocalizedLabel?.Label || ''
        };
        
        // Adicionar informações específicas por tipo
        if (metadata.AttributeType === 'String' || metadata.AttributeType === 'Memo') {
          Object.assign(formattedAttribute, { maxLength: metadata.MaxLength });
        }
        
        if (metadata.Format) {
          Object.assign(formattedAttribute, { format: metadata.Format });
        }
        
        // Adicionar informações de OptionSet se disponível e solicitado
        if (includeOptionSets && 
            (metadata.AttributeType === 'Picklist' || metadata.AttributeType === 'Status' || metadata.AttributeType === 'State') && 
            metadata.OptionSet) {
          Object.assign(formattedAttribute, { 
            options: metadata.OptionSet.Options.map((opt: any) => ({
              value: opt.Value,
              label: opt.Label?.UserLocalizedLabel?.Label || `Option ${opt.Value}`
            }))
          });
        }
        
        // Adicionar informações de lookup se for um campo de referência
        if (metadata.AttributeType === 'Lookup' && metadata.Targets) {
          Object.assign(formattedAttribute, { targets: metadata.Targets });
        }
        
        // Para campos numéricos, adicionar min/max
        if (['Integer', 'Decimal', 'Money', 'Double'].includes(metadata.AttributeType)) {
          if (metadata.MinValue !== undefined) Object.assign(formattedAttribute, { minValue: metadata.MinValue });
          if (metadata.MaxValue !== undefined) Object.assign(formattedAttribute, { maxValue: metadata.MaxValue });
          if (metadata.Precision !== undefined) Object.assign(formattedAttribute, { precision: metadata.Precision });
        }
        
        return {
          content: [{ 
            type: "text", 
            text: `Metadados do atributo ${attributeName} da entidade ${entityName}:\n${JSON.stringify(formattedAttribute, null, 2)}` // Corrigido aqui
          }]
        };
      } else {
        // Formatar a resposta para entidade completa
        let formattedResponse: EntityMetadataResponse = {
          entityName: metadata.LogicalName,
          displayName: metadata.DisplayName?.UserLocalizedLabel?.Label || metadata.SchemaName,
          schemaName: metadata.SchemaName,
          primaryIdAttribute: metadata.PrimaryIdAttribute,
          primaryNameAttribute: metadata.PrimaryNameAttribute
        };
        
        // Adicionar atributos se solicitado
        if (includeAttributes && metadata.Attributes) {
          formattedResponse = {
            ...formattedResponse,
            attributes: metadata.Attributes.map((attr: any) => {
              const attribute = {
                name: attr.LogicalName,
                displayName: attr.DisplayName?.UserLocalizedLabel?.Label || attr.SchemaName,
                type: attr.AttributeType,
                required: attr.RequiredLevel?.Value === 'Required'
              };
              
              // Adicionar informações específicas por tipo
              if (attr.AttributeType === 'String' || attr.AttributeType === 'Memo') {
                Object.assign(attribute, { maxLength: attr.MaxLength });
              }
              
              if (attr.Format) {
                Object.assign(attribute, { format: attr.Format });
              }
              
              // Adicionar informações de OptionSet se disponível e solicitado
              if (includeOptionSets && 
                  (attr.AttributeType === 'Picklist' || attr.AttributeType === 'Status' || attr.AttributeType === 'State') && 
                  attr.OptionSet) {
                Object.assign(attribute, { 
                  options: attr.OptionSet.Options.map((opt: any) => ({
                    value: opt.Value,
                    label: opt.Label?.UserLocalizedLabel?.Label || `Option ${opt.Value}`
                  }))
                });
              }
              
              // Adicionar informações de lookup se for um campo de referência
              if (attr.AttributeType === 'Lookup' && attr.Targets) {
                Object.assign(attribute, { targets: attr.Targets });
              }
              
              return attribute;
            })
          };
        }
        
        return {
          content: [{ 
            type: "text", 
            text: `Metadados da entidade ${entityName}:\n${JSON.stringify(formattedResponse, null, 2)}`
          }]
        };
      }
    } catch (error: any) {
      logger.error(`[Tool:get-entity-metadata] Erro ao consultar metadados da entidade ${entityName}${attributeName ? `, atributo: ${attributeName}` : ''}:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao consultar metadados da entidade ${entityName}${attributeName ? `, atributo: ${attributeName}` : ''}: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'get-entity-metadata' registrada.");

// Novas ferramentas para Contact Management
server.tool(
  "createContact",
  {
    firstName: z.string().describe("Nome do contato"),
    lastName: z.string().describe("Sobrenome do contato"),
    email: z.string().optional().describe("Email do contato (opcional)"),
    phone: z.string().optional().describe("Telefone do contato (opcional)"),
    accountId: z.string().optional().describe("ID da conta associada ao contato (opcional)")
  },
  async ({ firstName, lastName, email, phone, accountId }) => {
    logger.debug(`[Tool:createContact] Criando contato: ${firstName} ${lastName}`);
    
    try {
      // Preparar os dados do contato
      const contactData: Record<string, any> = {
        firstname: firstName,
        lastname: lastName
      };
      
      // Adicionar campos opcionais se fornecidos
      if (email) contactData.emailaddress1 = email;
      if (phone) contactData.telephone1 = phone;
      if (accountId) contactData["parentcustomerid_account@odata.bind"] = `/accounts(${accountId})`;
      
      // Criar o contato usando o typedDynamicsService
      const result = await typedDynamicsService.createContact(contactData);
      
      return {
        content: [{ 
          type: "text", 
          text: `Contato criado com sucesso:\n${JSON.stringify(result, null, 2)}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:createContact] Erro ao criar contato:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao criar contato: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'createContact' registrada.");

server.tool(
  "updateContact",
  {
    contactId: z.string().describe("ID do contato a ser atualizado"),
    firstName: z.string().optional().describe("Novo nome do contato (opcional)"),
    lastName: z.string().optional().describe("Novo sobrenome do contato (opcional)"),
    email: z.string().optional().describe("Novo email do contato (opcional)"),
    phone: z.string().optional().describe("Novo telefone do contato (opcional)")
  },
  async ({ contactId, firstName, lastName, email, phone }) => {
    logger.debug(`[Tool:updateContact] Atualizando contato: ${contactId}`);
    
    try {
      // Verificar se pelo menos um campo para atualização foi fornecido
      if (!firstName && !lastName && !email && !phone) {
        return {
          content: [{ 
            type: "text", 
            text: "Nenhum campo para atualização foi fornecido."
          }]
        };
      }
      
      // Preparar os dados do contato
      const contactData: Record<string, any> = {};
      
      // Adicionar campos opcionais se fornecidos
      if (firstName) contactData.firstname = firstName;
      if (lastName) contactData.lastname = lastName;
      if (email) contactData.emailaddress1 = email;
      if (phone) contactData.telephone1 = phone;
      
      // Atualizar o contato usando o typedDynamicsService
      await typedDynamicsService.updateContact(contactId, contactData);
      
      return {
        content: [{ 
          type: "text", 
          text: `Contato ${contactId} atualizado com sucesso.`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:updateContact] Erro ao atualizar contato:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao atualizar contato: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'updateContact' registrada.");

server.tool(
  "searchContacts",
  {
    name: z.string().optional().describe("Nome ou parte do nome para busca (opcional)"),
    email: z.string().optional().describe("Email ou parte do email para busca (opcional)"),
    phone: z.string().optional().describe("Telefone ou parte do telefone para busca (opcional)"),
    accountId: z.string().optional().describe("ID da conta para filtrar contatos (opcional)"),
    maxResults: z.number().optional().describe("Número máximo de resultados (opcional, padrão: 10)")
  },
  async ({ name, email, phone, accountId, maxResults = 10 }) => {
    logger.debug(`[Tool:searchContacts] Buscando contatos`);
    
    try {
      // Verificar se pelo menos um critério de busca foi fornecido
      if (!name && !email && !phone && !accountId) {
        return {
          content: [{ 
            type: "text", 
            text: "Pelo menos um critério de busca deve ser fornecido (nome, email, telefone ou conta)."
          }]
        };
      }
      
      // Preparar os filtros
      const filters: Record<string, any> = {};
      
      if (name) filters.fullname = name;
      if (email) filters.emailaddress1 = email;
      if (phone) filters.telephone1 = phone;
      if (accountId) filters._parentcustomerid_value = accountId;
      
      // Buscar contatos usando o typedDynamicsService
      const results = await typedDynamicsService.searchContacts(filters, {
        top: Math.min(maxResults, 50), // Limitar a 50 resultados no máximo
        orderBy: 'createdon desc'
      });
      
      return {
        content: [{ 
          type: "text", 
          text: `Contatos encontrados (${results.length}):\n${JSON.stringify(results, null, 2)}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:searchContacts] Erro ao buscar contatos:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao buscar contatos: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'searchContacts' registrada.");

// Novas ferramentas para Account Management
server.tool(
  "createAccount",
  {
    name: z.string().describe("Nome da conta"),
    phone: z.string().optional().describe("Telefone da conta (opcional)"),
    email: z.string().optional().describe("Email da conta (opcional)"),
    website: z.string().optional().describe("Website da conta (opcional)"),
    parentAccountId: z.string().optional().describe("ID da conta pai (opcional)")
  },
  async ({ name, phone, email, website, parentAccountId }) => {
    logger.debug(`[Tool:createAccount] Criando conta: ${name}`);
    
    try {
      // Preparar os dados da conta
      const accountData: Record<string, any> = {
        name: name
      };
      
      // Adicionar campos opcionais se fornecidos
      if (phone) accountData.telephone1 = phone;
      if (email) accountData.emailaddress1 = email;
      if (website) accountData.websiteurl = website;
      if (parentAccountId) accountData["parentaccountid@odata.bind"] = `/accounts(${parentAccountId})`;
      
      // Criar a conta usando o typedDynamicsService
      const result = await typedDynamicsService.createAccount(accountData);
      
      return {
        content: [{ 
          type: "text", 
          text: `Conta criada com sucesso:\n${JSON.stringify(result, null, 2)}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:createAccount] Erro ao criar conta:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao criar conta: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'createAccount' registrada.");

server.tool(
  "updateAccount",
  {
    accountId: z.string().describe("ID da conta a ser atualizada"),
    name: z.string().optional().describe("Novo nome da conta (opcional)"),
    phone: z.string().optional().describe("Novo telefone da conta (opcional)"),
    email: z.string().optional().describe("Novo email da conta (opcional)"),
    website: z.string().optional().describe("Novo website da conta (opcional)")
  },
  async ({ accountId, name, phone, email, website }) => {
    logger.debug(`[Tool:updateAccount] Atualizando conta: ${accountId}`);
    
    try {
      // Verificar se pelo menos um campo para atualização foi fornecido
      if (!name && !phone && !email && !website) {
        return {
          content: [{ 
            type: "text", 
            text: "Nenhum campo para atualização foi fornecido."
          }]
        };
      }
      
      // Preparar os dados da conta
      const accountData: Record<string, any> = {};
      
      // Adicionar campos opcionais se fornecidos
      if (name) accountData.name = name;
      if (phone) accountData.telephone1 = phone;
      if (email) accountData.emailaddress1 = email;
      if (website) accountData.websiteurl = website;
      
      // Atualizar a conta usando o typedDynamicsService
      await typedDynamicsService.updateAccount(accountId, accountData);
      
      return {
        content: [{ 
          type: "text", 
          text: `Conta ${accountId} atualizada com sucesso.`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:updateAccount] Erro ao atualizar conta:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao atualizar conta: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'updateAccount' registrada.");

server.tool(
  "getAccountHierarchy",
  {
    accountId: z.string().describe("ID da conta para obter a hierarquia")
  },
  async ({ accountId }) => {
    logger.debug(`[Tool:getAccountHierarchy] Obtendo hierarquia da conta: ${accountId}`);
    
    try {
      // Obter a hierarquia da conta usando o typedDynamicsService
      const hierarchy = await typedDynamicsService.getAccountHierarchy(accountId);
      
      return {
        content: [{ 
          type: "text", 
          text: `Hierarquia da conta ${accountId}:\n${JSON.stringify(hierarchy, null, 2)}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:getAccountHierarchy] Erro ao obter hierarquia da conta:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao obter hierarquia da conta: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'getAccountHierarchy' registrada.");

// Novas ferramentas para Enhanced Case Operations
server.tool(
  "assignCase",
  {
    caseId: z.string().describe("ID do caso a ser atribuído"),
    assigneeId: z.string().describe("ID do usuário ou equipe para atribuição"),
    assigneeType: z.enum(["systemuser", "team"]).optional().describe("Tipo do destinatário ('systemuser' ou 'team', padrão: 'systemuser')")
  },
  async ({ caseId, assigneeId, assigneeType = "systemuser" }) => {
    logger.debug(`[Tool:assignCase] Atribuindo caso ${caseId} para ${assigneeType} ${assigneeId}`);
    
    try {
      // Atribuir o caso usando o typedDynamicsService
      const result = await typedDynamicsService.assignCase(caseId, assigneeId, assigneeType as 'systemuser' | 'team');
      
      return {
        content: [{ 
          type: "text", 
          text: `Caso atribuído com sucesso:\n${JSON.stringify(result, null, 2)}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:assignCase] Erro ao atribuir caso:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao atribuir caso: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'assignCase' registrada.");

server.tool(
  "escalateCase",
  {
    caseId: z.string().describe("ID do caso a ser escalado"),
    newPriority: z.number().describe("Nova prioridade do caso (1-3, onde 1 é alta)"),
    escalationNotes: z.string().describe("Notas sobre a escalação"),
    assigneeId: z.string().optional().describe("ID do novo responsável (opcional)")
  },
  async ({ caseId, newPriority, escalationNotes, assigneeId }) => {
    logger.debug(`[Tool:escalateCase] Escalando caso ${caseId} para prioridade ${newPriority}`);
    
    try {
      // Validar a prioridade
      if (newPriority < 1 || newPriority > 3) {
        return {
          content: [{ 
            type: "text", 
            text: "A prioridade deve ser um número entre 1 e 3, onde 1 é alta."
          }]
        };
      }
      
      // Escalar o caso usando o typedDynamicsService
      const result = await typedDynamicsService.escalateCase(caseId, newPriority, escalationNotes, assigneeId);
      
      return {
        content: [{ 
          type: "text", 
          text: `Caso escalado com sucesso:\n${JSON.stringify(result, null, 2)}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:escalateCase] Erro ao escalar caso:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao escalar caso: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'escalateCase' registrada.");

server.tool(
  "bulkUpdateCases",
  {
    caseIds: z.array(z.string()).describe("IDs dos casos a serem atualizados"),
    status: z.number().optional().describe("Novo status dos casos (opcional)"),
    priority: z.number().optional().describe("Nova prioridade dos casos (opcional)"),
    owner: z.string().optional().describe("ID do novo proprietário dos casos (opcional)")
  },
  async ({ caseIds, status, priority, owner }) => {
    logger.debug(`[Tool:bulkUpdateCases] Atualizando em massa ${caseIds.length} casos`);
    
    try {
      // Verificar se pelo menos um campo para atualização foi fornecido
      if (!status && !priority && !owner) {
        return {
          content: [{ 
            type: "text", 
            text: "Pelo menos um campo para atualização deve ser fornecido (status, prioridade ou proprietário)."
          }]
        };
      }
      
      // Preparar os dados para atualização
      const updateData: Record<string, any> = {};
      
      if (status) updateData.statuscode = status;
      if (priority) updateData.prioritycode = priority;
      if (owner) updateData["ownerid@odata.bind"] = `/systemusers(${owner})`;
      
      // Atualizar os casos em massa usando o typedDynamicsService
      const result = await typedDynamicsService.bulkUpdateCases(caseIds, updateData);
      
      return {
        content: [{ 
          type: "text", 
          text: `Casos atualizados em massa:\n${JSON.stringify(result, null, 2)}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:bulkUpdateCases] Erro ao atualizar casos em massa:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao atualizar casos em massa: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'bulkUpdateCases' registrada.");

server.tool(
  "getCaseActivities",
  {
    caseId: z.string().describe("ID do caso para obter atividades"),
    activityTypes: z.array(z.string()).optional().describe("Tipos de atividades a serem incluídos (opcional, padrão: todos)"),
    maxResults: z.number().optional().describe("Número máximo de resultados (opcional, padrão: 20)")
  },
  async ({ caseId, activityTypes, maxResults = 20 }) => {
    logger.debug(`[Tool:getCaseActivities] Obtendo atividades do caso ${caseId}`);
    
    try {
      // Obter as atividades do caso usando o typedDynamicsService
      const result = await typedDynamicsService.getCaseActivities(
        caseId, 
        activityTypes, 
        { top: Math.min(maxResults, 50), orderBy: 'createdon desc' }
      );
      
      return {
        content: [{ 
          type: "text", 
          text: `Atividades do caso ${caseId}:\n${JSON.stringify(result, null, 2)}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:getCaseActivities] Erro ao obter atividades do caso:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao obter atividades do caso: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'getCaseActivities' registrada.");

// Ferramentas de Workflow Integration (já implementadas no DynamicsService)
server.tool(
  "triggerWorkflow",
  {
    workflowId: z.string().describe("ID do workflow a ser executado"),
    entityName: z.string().describe("Nome da entidade associada ao workflow"),
    entityId: z.string().describe("ID do registro da entidade")
  },
  async ({ workflowId, entityName, entityId }) => {
    logger.debug(`[Tool:triggerWorkflow] Executando workflow ${workflowId} para ${entityName}(${entityId})`);
    
    try {
      // Executar o workflow usando o typedDynamicsService
      const result = await typedDynamicsService.triggerWorkflow(workflowId, entityName, entityId);
      
      return {
        content: [{ 
          type: "text", 
          text: `Workflow executado com sucesso:\n${JSON.stringify(result, null, 2)}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:triggerWorkflow] Erro ao executar workflow:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao executar workflow: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'triggerWorkflow' registrada.");

server.tool(
  "getWorkflowStatus",
  {
    workflowInstanceId: z.string().describe("ID da instância do workflow")
  },
  async ({ workflowInstanceId }) => {
    logger.debug(`[Tool:getWorkflowStatus] Verificando status do workflow ${workflowInstanceId}`);
    
    try {
      // Verificar o status do workflow usando o typedDynamicsService
      const result = await typedDynamicsService.getWorkflowStatus(workflowInstanceId);
      
      return {
        content: [{ 
          type: "text", 
          text: `Status do workflow ${workflowInstanceId}:\n${JSON.stringify(result, null, 2)}`
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:getWorkflowStatus] Erro ao verificar status do workflow:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao verificar status do workflow: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'getWorkflowStatus' registrada.");

// Ferramenta de consulta em linguagem natural
server.tool(
  "dynamics-query",
  {
    query: z.string().describe("Consulta em linguagem natural, ex: 'mostrar contatos ativos', 'listar contas em São Paulo', 'buscar caso com título contendo suporte'")
  },
  async ({ query }) => {
    logger.debug(`[Tool:dynamics-query] Recebida consulta: "${query}"`);
    
    try {
      // Processar a consulta usando o serviço de linguagem natural
      const result = await nlQueryService.processQuery(query);
      
      if (!result.success) {
        return {
          content: [{ 
            type: "text", 
            text: `Não foi possível processar sua consulta: ${result.message}\n\nDicas de consulta:\n- Especifique a entidade (contas, contatos, casos, etc.)\n- Use verbos como "mostrar", "listar", "buscar" para indicar a ação\n- Para filtros, use formato "campo operador valor" (ex: "nome contém João")`
          }]
        };
      }
      
      // Formatar a resposta de acordo com o tipo de consulta
      let responseText = '';
      
      if (result.count !== undefined) {
        // Resultado de listagem
        responseText = `Encontrados ${result.count} registros de ${result.entity}:\n\n${JSON.stringify(result.results, null, 2)}`;
        
        // Se houver muitos resultados, adicionar uma nota
        if (result.count > 10) {
          responseText += `\n\nNota: A consulta retornou ${result.count} registros. Para limitar os resultados, adicione "limite X" à sua consulta.`;
        }
      } else if (result.result) {
        // Resultado de detalhamento
        responseText = `Detalhes do registro de ${result.entity}:\n\n${JSON.stringify(result.result, null, 2)}`;
      } else {
        // Outro tipo de resultado
        responseText = JSON.stringify(result, null, 2);
      }
      
      return {
        content: [{ 
          type: "text", 
          text: responseText
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:dynamics-query] Erro ao processar consulta:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao processar consulta: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'dynamics-query' registrada.");

// Ferramenta de comandos abreviados
server.tool(
  "d365",
  {
    command: z.string().describe("Comando no formato 'entidade:ação [parâmetros]', ex: 'contact:list', 'account:get 123', 'case:update 456 status=resolved'")
  },
  async ({ command }) => {
    logger.debug(`[Tool:d365] Recebido comando: "${command}"`);
    
    try {
      // Processar comandos especiais
      if (command.toLowerCase().startsWith('get metadata')) {
        // Extrair o nome da entidade
        const parts = command.split(' ');
        if (parts.length < 3) {
          return {
            content: [{ 
              type: "text", 
              text: `Comando incompleto. Use 'get metadata [entidade]', por exemplo: 'get metadata contacts'`
            }]
          };
        }
        
        const entityName = parts[2].toLowerCase();
        logger.debug(`[Tool:d365] Processando comando 'get metadata ${entityName}'`);
        
        try {
          // Usar o método público getEntityMetadata
          const metadata = await typedDynamicsService.getEntityMetadata(entityName, {
            includeAttributes: true,
            attributeTypes: true,
            optionSets: true
          });
          
          if (!metadata) {
            return {
              content: [{ 
                type: "text", 
                text: `Entidade '${entityName}' não encontrada ou não suportada.`
              }]
            };
          }
          
          // Formatar a resposta para entidade completa
          const formattedResponse = {
            entityName: metadata.LogicalName,
            displayName: metadata.DisplayName?.UserLocalizedLabel?.Label || metadata.SchemaName,
            schemaName: metadata.SchemaName,
            primaryIdAttribute: metadata.PrimaryIdAttribute || metadata.Attributes?.find((a: any) => a.IsPrimaryId)?.LogicalName,
            primaryNameAttribute: metadata.PrimaryNameAttribute || metadata.Attributes?.find((a: any) => a.IsPrimaryName)?.LogicalName,
            attributes: metadata.Attributes?.map((attr: any) => ({
              name: attr.LogicalName,
              displayName: attr.DisplayName?.UserLocalizedLabel?.Label || attr.SchemaName,
              type: attr.AttributeType,
              required: attr.RequiredLevel?.Value === 'Required',
              maxLength: attr.MaxLength,
              format: attr.Format,
              options: attr.OptionSet?.Options?.map((opt: any) => ({
                value: opt.Value,
                label: opt.Label?.UserLocalizedLabel?.Label || `Option ${opt.Value}`
              })),
              targets: attr.Targets
            }))
          };
          
          return {
            content: [{ 
              type: "text", 
              text: `Metadados da entidade ${entityName}:\n${JSON.stringify(formattedResponse, null, 2)}`
            }]
          };
        } catch (error: any) {
          logger.error(`[Tool:d365] Erro ao consultar metadados da entidade ${entityName}:`, error);
          return {
            content: [{ 
              type: "text", 
              text: `Erro ao consultar metadados da entidade ${entityName}: ${error.message}`
            }]
          };
        }
      }
      
      // Processar o comando usando o serviço de comandos abreviados
      const result = await shortCommandService.processCommand(command);
      
      if (!result.success) {
        return {
          content: [{ 
            type: "text", 
            text: `Erro ao processar comando: ${result.message}\n\nExemplos de comandos válidos:\n- contact:list\n- account:get 123\n- case:create subject=\"Problema técnico\" description=\"Cliente relatou falha no sistema\" customerId=456\n- contact:update 789 firstname=\"João\" lastname=\"Silva\"\n- account:count name=*Microsoft*`
          }]
        };
      }
      
      // Formatar a resposta de acordo com o tipo de comando
      let responseText = '';
      
      if (result.count !== undefined && result.results) {
        // Resultado de listagem
        responseText = `Encontrados ${result.count} registros de ${result.entity}:\n\n${JSON.stringify(result.results, null, 2)}`;
      } else if (result.result) {
        // Resultado de detalhamento
        responseText = `Detalhes do registro de ${result.entity}:\n\n${JSON.stringify(result.result, null, 2)}`;
      } else if (result.count !== undefined) {
        // Resultado de contagem
        responseText = `Total de registros de ${result.entity}: ${result.count}`;
        if (result.filter) {
          responseText += `\nFiltro aplicado: ${result.filter}`;
        }
      } else if (result.fields) {
        // Resultado de campos
        responseText = `Campos da entidade ${result.entity} (${result.entityDisplayName}):\n\n`;
        responseText += result.fields.map((field: any) => {
          let fieldInfo = `- ${field.name} (${field.type}): ${field.displayName}`;
          if (field.required) fieldInfo += ' [Obrigatório]';
          if (field.description) fieldInfo += `\n  Descrição: ${field.description}`;
          if (field.optionSet?.options) {
            fieldInfo += `\n  Opções: ${field.optionSet.options.map((opt: any) => `${opt.value}=${opt.label}`).join(', ')}`;
          }
          return fieldInfo;
        }).join('\n');
      } else {
        // Outro tipo de resultado
        responseText = result.message || JSON.stringify(result, null, 2);
      }
      
      return {
        content: [{ 
          type: "text", 
          text: responseText
        }]
      };
    } catch (error: any) {
      logger.error(`[Tool:d365] Erro ao processar comando:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Erro ao processar comando: ${error.message}`
        }]
      };
    }
  }
);
logger.info("Ferramenta 'd365' registrada.");

// Ferramenta de assistente de consulta interativo - iniciar sessão
server.tool(
  "query-assistant-start",
  {},
  async () => {
    logger.debug(`[Tool:query-assistant-start] Iniciando nova sessão de assistente de consulta`);
    
    try {
      const { sessionId, message } = queryAssistantService.startSession();
      
      return {
        content: [{ 
          type: "text" as const, 
          text: message
        }],
        _meta: {
          sessionId
        }
      };
    } catch (error: any) {
      logger.error(`[Tool:query-assistant-start] Erro ao iniciar sessão:`, error);
      return {
        content: [{ 
          type: "text" as const, 
          text: `Erro ao iniciar o assistente de consulta: ${error.message}`
        }],
        isError: true
      };
    }
  }
);
logger.info("Ferramenta 'query-assistant-start' registrada.");

// Ferramenta de assistente de consulta interativo - processar entrada
server.tool(
  "query-assistant-input",
  {
    sessionId: z.string().describe("ID da sessão do assistente de consulta"),
    input: z.string().describe("Entrada do usuário para o assistente")
  },
  async ({ sessionId, input }, extra) => {
    logger.debug(`[Tool:query-assistant-input] Processando entrada para sessão ${sessionId}: "${input}"`);
    
    try {
      const response = await queryAssistantService.processInput(sessionId, input);
      
      // Construir resposta
      const responseContent = [];
      
      // Adicionar mensagem do assistente
      responseContent.push({
        type: "text" as const,
        text: response.message
      });
      
      // Se a consulta foi concluída com sucesso, adicionar o resultado
      if (response.completed && response.result) {
        let resultText = '';
        
        // Formatar o resultado de acordo com o tipo
        if (Array.isArray(response.result)) {
          // Resultado de listagem
          resultText = `Resultados (${response.result.length}):\n\n${JSON.stringify(response.result, null, 2)}`;
        } else if (response.result.count !== undefined) {
          // Resultado de contagem
          resultText = `Total de registros: ${response.result.count}`;
          if (response.result.filter) {
            resultText += `\nFiltro aplicado: ${response.result.filter}`;
          }
        } else {
          // Resultado de detalhamento ou outro
          resultText = `Detalhes do registro:\n\n${JSON.stringify(response.result, null, 2)}`;
        }
        
        responseContent.push({
          type: "text" as const,
          text: resultText
        });
      }
      
      return {
        content: responseContent,
        _meta: {
          sessionId,
          completed: response.completed
        }
      };
    } catch (error: any) {
      logger.error(`[Tool:query-assistant-input] Erro ao processar entrada:`, error);
      return {
        content: [{ 
          type: "text" as const, 
          text: `Erro ao processar sua entrada: ${error.message}`
        }],
        _meta: {
          sessionId,
          error: true
        },
        isError: true
      };
    }
  }
);
logger.info("Ferramenta 'query-assistant-input' registrada.");

// Ferramenta de assistente de consulta interativo - encerrar sessão
server.tool(
  "query-assistant-end",
  {
    sessionId: z.string().describe("ID da sessão do assistente de consulta a ser encerrada")
  },
  async ({ sessionId }, extra) => {
    logger.debug(`[Tool:query-assistant-end] Encerrando sessão ${sessionId}`);
    
    try {
      const success = queryAssistantService.endSession(sessionId);
      
      return {
        content: [{ 
          type: "text" as const, 
          text: success ? 
            `Sessão de consulta encerrada com sucesso.` : 
            `Sessão não encontrada ou já encerrada.`
        }],
        _meta: {
          success
        }
      };
    } catch (error: any) {
      logger.error(`[Tool:query-assistant-end] Erro ao encerrar sessão:`, error);
      return {
        content: [{ 
          type: "text" as const, 
          text: `Erro ao encerrar a sessão: ${error.message}`
        }],
        _meta: {
          error: true
        },
        isError: true
      };
    }
  }
);
logger.info("Ferramenta 'query-assistant-end' registrada.");

// Ferramenta de exploração de metadados do Dynamics 365
server.tool(
  "metadata-explorer",
  {
    action: z.enum(["list-entities", "entity-details", "entity-attributes", "attribute-details", "entity-relationships", "search-entities", "search-attributes", "data-model"]).describe("Ação a ser executada"),
    entityLogicalName: z.string().optional().describe("Nome lógico da entidade (ex: account, contact)"),
    attributeLogicalName: z.string().optional().describe("Nome lógico do atributo (ex: name, emailaddress1)"),
    searchText: z.string().optional().describe("Texto para pesquisa"),
    refresh: z.boolean().optional().describe("Se deve atualizar o cache de metadados"),
    entityNames: z.array(z.string()).optional().describe("Lista de nomes de entidades para gerar modelo de dados"),
    // Novos parâmetros para granularidade em entity-details e attribute-details
    includeAttributes: z.boolean().optional().default(true).describe("Incluir detalhes dos atributos da entidade (para entity-details)"),
    includeOptionSets: z.boolean().optional().default(true).describe("Incluir detalhes dos OptionSets (para entity-details com atributos, ou attribute-details)"),
    includeAttributeTypes: z.boolean().optional().default(true).describe("Incluir os tipos dos atributos (para entity-details com atributos)"),
    selectEntityProperties: z.array(z.string()).optional().describe("Lista de propriedades da entidade a serem retornadas (para entity-details)"),
    selectAttributeProperties: z.array(z.string()).optional().describe("Lista de propriedades dos atributos a serem retornadas (para entity-details com atributos, ou attribute-details)")
  },
  async ({ 
    action, 
    entityLogicalName, 
    attributeLogicalName, 
    searchText, 
    refresh, 
    entityNames,
    includeAttributes,
    includeOptionSets,
    includeAttributeTypes,
    selectEntityProperties,
    selectAttributeProperties
  }: {
    action: "list-entities" | "entity-details" | "entity-attributes" | "attribute-details" | "entity-relationships" | "search-entities" | "search-attributes" | "data-model",
    entityLogicalName?: string,
    attributeLogicalName?: string,
    searchText?: string,
    refresh?: boolean,
    entityNames?: string[],
    includeAttributes?: boolean,
    includeOptionSets?: boolean,
    includeAttributeTypes?: boolean,
    selectEntityProperties?: string[],
    selectAttributeProperties?: string[]
  }) => {
    try {
      logger.info(`[metadata-explorer] Executando ação ${action}`);
      
      let result;
      
      switch (action) {
        case "list-entities":
          result = await metadataExplorerService.listEntities(refresh);
          return {
            content: [{ 
              type: "text" as const, 
              text: `Encontradas ${result.length} entidades no Dynamics 365.`
            }, {
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }],
            _meta: { 
              count: result.length,
              type: "entities"
            }
          };
          
        case "entity-details":
          if (!entityLogicalName) {
            return {
              content: [{ 
                type: "text" as const, 
                text: "Nome lógico da entidade (entityLogicalName) é obrigatório para esta ação."
              }],
              isError: true
            };
          }
          
          result = await metadataExplorerService.getEntityDetails(entityLogicalName, {
            includeAttributes,
            includeOptionSets,
            includeAttributeTypes,
            selectEntityProperties,
            selectAttributeProperties,
            refresh
          });
          return {
            content: [{ 
              type: "text" as const, 
              text: `Detalhes da entidade '${entityLogicalName}' obtidos com sucesso.`
            }, {
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }],
            _meta: { 
              entityLogicalName,
              type: "entity_details"
            }
          };
          
        case "entity-attributes": // Corrected label
          if (!entityLogicalName) {
            return {
              content: [{ 
                type: "text" as const, 
                text: "Nome lógico da entidade (entityLogicalName) é obrigatório para esta ação."
              }],
              isError: true
            };
          }
          
          result = await metadataExplorerService.getEntityAttributes(entityLogicalName, refresh); // Corrected call
          return {
            content: [{ 
              type: "text" as const, 
              text: `Encontrados ${result.length} atributos para a entidade '${entityLogicalName}'.`
            }, {
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }],
            _meta: { 
              entityLogicalName,
              count: result.length,
              type: "entity_attributes" // Corrected type
            }
          };
          
        case "attribute-details":
          if (!entityLogicalName || !attributeLogicalName) {
            return {
              content: [{ 
                type: "text" as const, 
                text: "Nome lógico da entidade (entityLogicalName) e nome lógico do atributo (attributeLogicalName) são obrigatórios para esta ação."
              }],
              isError: true
            };
          }
          result = await metadataExplorerService.getAttributeDetails(entityLogicalName, attributeLogicalName, { 
            includeOptionSets, 
            selectAttributeProperties, // Corrected: selectAttributeProperties
            refresh 
          });
          return { // Corrected return structure
            content: [{
              type: "text" as const,
              text: `Detalhes do atributo '${attributeLogicalName}' da entidade '${entityLogicalName}' obtidos com sucesso.`
            }, {
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }],
            _meta: {
              entityLogicalName,
              attributeLogicalName, // Added
              type: "attribute_details" // Added
            }
          };
          
        case "entity-relationships":
          if (!entityLogicalName) {
            return {
              content: [{ 
                type: "text" as const, 
                text: "Nome lógico da entidade (entityLogicalName) é obrigatório para esta ação."
              }],
              isError: true
            };
          }
          
          result = await metadataExplorerService.getEntityRelationships(entityLogicalName, refresh);
          return {
            content: [{ 
              type: "text" as const, 
              text: `Encontrados ${result.length} relacionamentos para a entidade '${entityLogicalName}'.`
            }, {
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }],
            _meta: { 
              entityLogicalName,
              count: result.length,
              type: "relationships"
            }
          };
          
        case "search-entities":
          if (!searchText) {
            return {
              content: [{ 
                type: "text" as const, 
                text: "Texto de pesquisa é obrigatório para esta ação."
              }],
              isError: true
            };
          }
          
          result = await metadataExplorerService.searchEntities(searchText);
          return {
            content: [{ 
              type: "text" as const, 
              text: `Encontradas ${result.length} entidades correspondentes à pesquisa '${searchText}'.`
            }, {
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }],
            _meta: { 
              searchText,
              count: result.length,
              type: "search_entities"
            }
          };
          
        case "search-attributes":
          if (!entityLogicalName || !searchText) {
            return {
              content: [{ 
                type: "text" as const, 
                text: "Nome da entidade e texto de pesquisa são obrigatórios para esta ação."
              }],
              isError: true
            };
          }
          
          result = await metadataExplorerService.searchAttributes(entityLogicalName!, searchText!);
          return {
            content: [{ 
              type: "text" as const, 
              text: `Encontrados ${result.length} atributos correspondentes à pesquisa '${searchText}' na entidade '${entityLogicalName}'.`
            }, {
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }],
            _meta: { 
              entityLogicalName,
              searchText,
              count: result.length,
              type: "search_attributes"
            }
          };
          
        case "data-model":
          result = await metadataExplorerService.generateDataModel(entityNames);
          return {
            content: [{ 
              type: "text" as const, 
              text: `Modelo de dados gerado com ${result.entities.length} entidades.`
            }, {
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }],
            _meta: { 
              entityCount: result.entities.length,
              type: "data_model"
            }
          };
          
        default:
          return {
            content: [{ 
              type: "text" as const, 
              text: `Ação '${action}' não reconhecida.`
            }],
            isError: true
          };
      }
    } catch (error: any) {
      logger.error(`[metadata-explorer] Erro:`, error);
      return {
        content: [{ 
          type: "text" as const, 
          text: `Erro ao explorar metadados: ${error.message}`
        }],
        isError: true
      };
    }
  }
);
logger.info("Ferramenta 'metadata-explorer' registrada.");

logger.info("Definição do servidor MCP para Dynamics 365 concluída.");

// Exporta a instância do servidor para ser usada pelos transportes
export { server };