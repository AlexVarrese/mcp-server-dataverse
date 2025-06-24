// src/services/queryAssistantService.ts
import { dynamicsService } from './dynamicsService.js';
import logger from '../logger.js';

/**
 * Interface para representar o estado de uma sessão de consulta interativa
 */
export interface QuerySession {
  id: string;
  startTime: Date;
  lastActivity: Date;
  currentStep: string;
  entity?: string;
  action?: string;
  filter?: Record<string, any>;
  fields?: string[];
  orderBy?: string;
  limit?: number;
  expand?: string[];
  completed: boolean;
}

/**
 * Serviço para gerenciar o assistente de consulta interativo para o Dynamics 365
 */
export class QueryAssistantService {
  // Armazena as sessões de consulta ativas
  private sessions: Map<string, QuerySession> = new Map();
  
  // Tempo de expiração da sessão em minutos
  private sessionExpirationMinutes: number = 30;
  
  // Mapeamento de entidades comuns
  private entityMappings: Record<string, string> = {
    'conta': 'accounts',
    'contas': 'accounts',
    'account': 'accounts',
    'accounts': 'accounts',
    'contato': 'contacts',
    'contatos': 'contacts',
    'contact': 'contacts',
    'contacts': 'contacts',
    'caso': 'incidents',
    'casos': 'incidents',
    'case': 'incidents',
    'cases': 'incidents',
    'incidents': 'incidents',
    'oportunidade': 'opportunities',
    'oportunidades': 'opportunities',
    'opportunity': 'opportunities',
    'opportunities': 'opportunities',
    'lead': 'leads',
    'leads': 'leads',
    'atividade': 'activities',
    'atividades': 'activities',
    'activity': 'activities',
    'activities': 'activities'
  };
  
  constructor() {
    // Iniciar limpeza periódica de sessões expiradas
    setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000); // A cada 5 minutos
  }
  
  /**
   * Inicia uma nova sessão de consulta interativa
   * @returns ID da sessão e primeira mensagem
   */
  public startSession(): { sessionId: string; message: string } {
    const sessionId = `query-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    const session: QuerySession = {
      id: sessionId,
      startTime: new Date(),
      lastActivity: new Date(),
      currentStep: 'entity',
      completed: false
    };
    
    this.sessions.set(sessionId, session);
    
    logger.debug(`[QueryAssistantService] Nova sessão iniciada: ${sessionId}`);
    
    return {
      sessionId,
      message: `Bem-vindo ao assistente de consulta do Dynamics 365!\n\nVamos construir sua consulta passo a passo.\n\nPrimeiro, qual entidade você deseja consultar? (ex: contas, contatos, casos, oportunidades)`
    };
  }
  
  /**
   * Processa uma entrada do usuário para a sessão de consulta
   * @param sessionId ID da sessão
   * @param input Entrada do usuário
   * @returns Próxima mensagem e indicação se a consulta foi concluída
   */
  public async processInput(sessionId: string, input: string): Promise<{ message: string; completed: boolean; result?: any }> {
    // Verificar se a sessão existe
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        message: `Sessão não encontrada ou expirada. Por favor, inicie uma nova sessão.`,
        completed: false
      };
    }
    
    // Atualizar timestamp de última atividade
    session.lastActivity = new Date();
    
    // Processar a entrada com base no passo atual
    try {
      switch (session.currentStep) {
        case 'entity':
          return await this.processEntityStep(session, input);
        case 'action':
          return await this.processActionStep(session, input);
        case 'filter':
          return await this.processFilterStep(session, input);
        case 'fields':
          return await this.processFieldsStep(session, input);
        case 'orderBy':
          return await this.processOrderByStep(session, input);
        case 'limit':
          return await this.processLimitStep(session, input);
        case 'confirm':
          return await this.processConfirmStep(session, input);
        default:
          return {
            message: `Erro: passo desconhecido '${session.currentStep}'.`,
            completed: false
          };
      }
    } catch (error: any) {
      logger.error(`[QueryAssistantService] Erro ao processar entrada para sessão ${sessionId}:`, error);
      return {
        message: `Erro ao processar sua entrada: ${error.message}`,
        completed: false
      };
    }
  }
  
  /**
   * Processa o passo de seleção de entidade
   */
  private async processEntityStep(session: QuerySession, input: string): Promise<{ message: string; completed: boolean }> {
    const normalizedInput = input.trim().toLowerCase();
    
    // Verificar se a entidade é reconhecida
    let entity = this.entityMappings[normalizedInput] || normalizedInput;
    
    // Verificar se a entidade existe no Dynamics
    try {
      // Tentar obter metadados básicos da entidade para validar
      await dynamicsService.getEntityMetadata(entity, { includeAttributes: false });
      
      // Entidade válida, atualizar sessão
      session.entity = entity;
      session.currentStep = 'action';
      
      return {
        message: `Ótimo! Você selecionou a entidade "${entity}".\n\nAgora, qual ação você deseja realizar?\n1. Listar registros\n2. Obter detalhes de um registro específico\n3. Contar registros\n\nResponda com o número ou nome da ação.`,
        completed: false
      };
    } catch (error) {
      return {
        message: `A entidade "${entity}" não foi reconhecida ou não está disponível no Dynamics 365.\n\nPor favor, escolha uma entidade válida (ex: accounts, contacts, incidents, opportunities).`,
        completed: false
      };
    }
  }
  
  /**
   * Processa o passo de seleção de ação
   */
  private processActionStep(session: QuerySession, input: string): { message: string; completed: boolean } {
    const normalizedInput = input.trim().toLowerCase();
    
    // Mapear a entrada para uma ação
    let action: string;
    
    if (['1', 'listar', 'list', 'mostrar', 'exibir', 'buscar'].includes(normalizedInput)) {
      action = 'list';
    } else if (['2', 'obter', 'get', 'detalhar', 'detalhes', 'ver'].includes(normalizedInput)) {
      action = 'get';
    } else if (['3', 'contar', 'count', 'total'].includes(normalizedInput)) {
      action = 'count';
    } else {
      return {
        message: `Ação não reconhecida. Por favor, escolha uma das seguintes opções:\n1. Listar registros\n2. Obter detalhes de um registro específico\n3. Contar registros`,
        completed: false
      };
    }
    
    // Atualizar sessão
    session.action = action;
    
    // Próximo passo depende da ação
    if (action === 'get') {
      session.currentStep = 'filter';
      return {
        message: `Você escolheu obter detalhes de um registro específico.\n\nPor favor, informe o ID do registro que deseja consultar:`,
        completed: false
      };
    } else {
      session.currentStep = 'filter';
      return {
        message: `Você escolheu ${action === 'list' ? 'listar' : 'contar'} registros.\n\nDeseja aplicar algum filtro? (ex: "nome contém Microsoft" ou "criado após 2023-01-01")\n\nSe não quiser filtrar, responda "não" ou "sem filtro".`,
        completed: false
      };
    }
  }
  
  /**
   * Processa o passo de definição de filtro
   */
  private processFilterStep(session: QuerySession, input: string): { message: string; completed: boolean } {
    const normalizedInput = input.trim().toLowerCase();
    
    // Verificar se o usuário não quer filtro
    if (['não', 'nao', 'sem filtro', 'sem', 'n', 'no', 'none'].includes(normalizedInput)) {
      session.filter = {};
    } else if (session.action === 'get') {
      // Para ação 'get', o filtro é o ID
      session.filter = { id: input.trim() };
    } else {
      // Tentar processar o filtro
      try {
        session.filter = this.parseFilterInput(normalizedInput);
      } catch (error: any) {
        return {
          message: `Não foi possível interpretar o filtro: ${error.message}\n\nPor favor, tente novamente com um formato como "campo operador valor" (ex: "nome contém Microsoft") ou responda "sem filtro".`,
          completed: false
        };
      }
    }
    
    // Próximo passo
    session.currentStep = 'fields';
    
    return {
      message: `Filtro definido.\n\nQuais campos você deseja incluir nos resultados?\nInforme os nomes dos campos separados por vírgula (ex: "nome, email, telefone").\n\nSe quiser todos os campos, responda "todos".`,
      completed: false
    };
  }
  
  /**
   * Processa o passo de seleção de campos
   */
  private processFieldsStep(session: QuerySession, input: string): { message: string; completed: boolean } {
    const normalizedInput = input.trim().toLowerCase();
    
    // Verificar se o usuário quer todos os campos
    if (['todos', 'all', 'tudo', '*'].includes(normalizedInput)) {
      session.fields = undefined;
    } else {
      // Dividir a entrada em campos individuais
      session.fields = normalizedInput.split(',').map(field => field.trim()).filter(field => field);
    }
    
    // Próximo passo depende da ação
    if (session.action === 'get') {
      // Para 'get', não precisamos de ordenação ou limite
      session.currentStep = 'confirm';
      
      // Montar resumo da consulta
      const summary = this.buildQuerySummary(session);
      
      return {
        message: `Campos definidos.\n\nResumo da sua consulta:\n${summary}\n\nDeseja executar esta consulta? (sim/não)`,
        completed: false
      };
    } else if (session.action === 'count') {
      // Para 'count', não precisamos de campos, ordenação ou limite
      session.currentStep = 'confirm';
      
      // Montar resumo da consulta
      const summary = this.buildQuerySummary(session);
      
      return {
        message: `Campos definidos (note que para contagem, os campos são ignorados).\n\nResumo da sua consulta:\n${summary}\n\nDeseja executar esta consulta? (sim/não)`,
        completed: false
      };
    } else {
      // Para 'list', continuamos com ordenação
      session.currentStep = 'orderBy';
      
      return {
        message: `Campos definidos.\n\nComo você deseja ordenar os resultados?\nInforme o campo e a direção (ex: "nome asc" ou "data_criacao desc").\n\nSe não quiser ordenação específica, responda "padrão".`,
        completed: false
      };
    }
  }
  
  /**
   * Processa o passo de definição de ordenação
   */
  private processOrderByStep(session: QuerySession, input: string): { message: string; completed: boolean } {
    const normalizedInput = input.trim().toLowerCase();
    
    // Verificar se o usuário quer ordenação padrão
    if (['padrão', 'padrao', 'default', 'sem', 'não', 'nao'].includes(normalizedInput)) {
      session.orderBy = 'createdon desc';
    } else {
      // Tentar processar a ordenação
      try {
        session.orderBy = this.parseOrderByInput(normalizedInput);
      } catch (error: any) {
        return {
          message: `Não foi possível interpretar a ordenação: ${error.message}\n\nPor favor, tente novamente com um formato como "campo direção" (ex: "nome asc") ou responda "padrão".`,
          completed: false
        };
      }
    }
    
    // Próximo passo
    session.currentStep = 'limit';
    
    return {
      message: `Ordenação definida.\n\nQuantos registros você deseja retornar no máximo?\nInforme um número ou responda "padrão" para usar o limite padrão (50).`,
      completed: false
    };
  }
  
  /**
   * Processa o passo de definição de limite
   */
  private processLimitStep(session: QuerySession, input: string): { message: string; completed: boolean } {
    const normalizedInput = input.trim().toLowerCase();
    
    // Verificar se o usuário quer limite padrão
    if (['padrão', 'padrao', 'default', 'sem', 'não', 'nao'].includes(normalizedInput)) {
      session.limit = 50;
    } else {
      // Tentar converter para número
      const limit = parseInt(normalizedInput);
      if (isNaN(limit) || limit <= 0) {
        return {
          message: `Valor inválido. Por favor, informe um número positivo ou responda "padrão".`,
          completed: false
        };
      }
      
      session.limit = limit;
    }
    
    // Próximo passo
    session.currentStep = 'confirm';
    
    // Montar resumo da consulta
    const summary = this.buildQuerySummary(session);
    
    return {
      message: `Limite definido.\n\nResumo da sua consulta:\n${summary}\n\nDeseja executar esta consulta? (sim/não)`,
      completed: false
    };
  }
  
  /**
   * Processa o passo de confirmação
   */
  private async processConfirmStep(session: QuerySession, input: string): Promise<{ message: string; completed: boolean; result?: any }> {
    const normalizedInput = input.trim().toLowerCase();
    
    // Verificar se o usuário confirmou
    if (['sim', 'yes', 's', 'y', 'confirmar', 'executar', 'ok'].includes(normalizedInput)) {
      // Executar a consulta
      try {
        const result = await this.executeQuery(session);
        
        // Marcar a sessão como concluída
        session.completed = true;
        
        return {
          message: `Consulta executada com sucesso!`,
          completed: true,
          result
        };
      } catch (error: any) {
        logger.error(`[QueryAssistantService] Erro ao executar consulta:`, error);
        return {
          message: `Erro ao executar a consulta: ${error.message}\n\nDeseja modificar sua consulta? (sim/não)`,
          completed: false
        };
      }
    } else if (['não', 'nao', 'no', 'n', 'cancelar', 'cancel'].includes(normalizedInput)) {
      // Usuário cancelou, voltar para o início
      session.currentStep = 'entity';
      session.entity = undefined;
      session.action = undefined;
      session.filter = undefined;
      session.fields = undefined;
      session.orderBy = undefined;
      session.limit = undefined;
      
      return {
        message: `Consulta cancelada. Vamos começar novamente.\n\nQual entidade você deseja consultar? (ex: contas, contatos, casos, oportunidades)`,
        completed: false
      };
    } else {
      return {
        message: `Resposta não reconhecida. Por favor, responda "sim" para executar a consulta ou "não" para cancelar.`,
        completed: false
      };
    }
  }
  
  /**
   * Executa a consulta com base nos parâmetros da sessão
   */
  private async executeQuery(session: QuerySession): Promise<any> {
    if (!session.entity || !session.action) {
      throw new Error('Parâmetros de consulta incompletos');
    }
    
    // Converter filtro para formato OData
    const filter = this.buildODataFilter(session.entity, session.filter || {});
    
    switch (session.action) {
      case 'list':
        return await dynamicsService.queryEntities(session.entity, {
          filter: filter || undefined,
          select: session.fields,
          orderBy: session.orderBy,
          top: session.limit
        });
      
      case 'get':
        const results = await dynamicsService.queryEntities(session.entity, {
          filter: filter || undefined,
          select: session.fields,
          top: 1
        });
        
        if (results.length === 0) {
          throw new Error(`Nenhum registro encontrado com os filtros especificados.`);
        }
        
        return results[0];
      
      case 'count':
        const countResults = await dynamicsService.queryEntities(session.entity, {
          filter: filter || undefined,
          select: ['createdon'], // Selecionar apenas um campo para minimizar dados transferidos
          top: 1000 // Limite para evitar sobrecarga
        });
        
        return {
          count: countResults.length,
          entity: session.entity,
          filter
        };
      
      default:
        throw new Error(`Ação '${session.action}' não suportada.`);
    }
  }
  
  /**
   * Constrói um resumo da consulta para exibição
   */
  private buildQuerySummary(session: QuerySession): string {
    if (!session.entity || !session.action) {
      return 'Consulta incompleta';
    }
    
    let summary = `- Entidade: ${session.entity}\n- Ação: ${session.action}`;
    
    // Adicionar filtro
    if (session.filter && Object.keys(session.filter).length > 0) {
      summary += `\n- Filtro: ${JSON.stringify(session.filter)}`;
    }
    
    // Adicionar campos
    if (session.fields && session.fields.length > 0) {
      summary += `\n- Campos: ${session.fields.join(', ')}`;
    } else {
      summary += `\n- Campos: todos`;
    }
    
    // Adicionar ordenação e limite para ação 'list'
    if (session.action === 'list') {
      if (session.orderBy) {
        summary += `\n- Ordenação: ${session.orderBy}`;
      }
      
      if (session.limit) {
        summary += `\n- Limite: ${session.limit} registros`;
      }
    }
    
    return summary;
  }
  
  /**
   * Analisa a entrada de filtro e converte para um objeto de filtro
   */
  private parseFilterInput(input: string): Record<string, any> {
    // Padrões comuns de filtro
    const patterns = [
      // campo contém valor
      { regex: /(\w+)\s+cont[eé]m\s+(.+)/i, operator: 'contains' },
      // campo começa com valor
      { regex: /(\w+)\s+come[çc]a\s+com\s+(.+)/i, operator: 'startswith' },
      // campo termina com valor
      { regex: /(\w+)\s+termina\s+com\s+(.+)/i, operator: 'endswith' },
      // campo igual a valor
      { regex: /(\w+)\s+igual\s+a\s+(.+)/i, operator: 'eq' },
      // campo = valor
      { regex: /(\w+)\s*=\s*(.+)/i, operator: 'eq' },
      // campo maior que valor
      { regex: /(\w+)\s+maior\s+que\s+(.+)/i, operator: 'gt' },
      // campo > valor
      { regex: /(\w+)\s*>\s*(.+)/i, operator: 'gt' },
      // campo menor que valor
      { regex: /(\w+)\s+menor\s+que\s+(.+)/i, operator: 'lt' },
      // campo < valor
      { regex: /(\w+)\s*<\s*(.+)/i, operator: 'lt' },
      // campo maior ou igual a valor
      { regex: /(\w+)\s+maior\s+ou\s+igual\s+a\s+(.+)/i, operator: 'ge' },
      // campo >= valor
      { regex: /(\w+)\s*>=\s*(.+)/i, operator: 'ge' },
      // campo menor ou igual a valor
      { regex: /(\w+)\s+menor\s+ou\s+igual\s+a\s+(.+)/i, operator: 'le' },
      // campo <= valor
      { regex: /(\w+)\s*<=\s*(.+)/i, operator: 'le' },
      // campo diferente de valor
      { regex: /(\w+)\s+diferente\s+de\s+(.+)/i, operator: 'ne' },
      // campo != valor
      { regex: /(\w+)\s*!=\s*(.+)/i, operator: 'ne' },
      // campo após valor (para datas)
      { regex: /(\w+)\s+ap[óo]s\s+(.+)/i, operator: 'gt' },
      // campo antes de valor (para datas)
      { regex: /(\w+)\s+antes\s+de\s+(.+)/i, operator: 'lt' }
    ];
    
    // Tentar encontrar um padrão que corresponda à entrada
    for (const pattern of patterns) {
      const match = input.match(pattern.regex);
      if (match) {
        const field = match[1].trim();
        let value = match[2].trim();
        
        // Remover aspas se presentes
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.substring(1, value.length - 1);
        }
        
        return {
          [field]: {
            operator: pattern.operator,
            value
          }
        };
      }
    }
    
    throw new Error('Formato de filtro não reconhecido');
  }
  
  /**
   * Analisa a entrada de ordenação
   */
  private parseOrderByInput(input: string): string {
    // Padrões de ordenação
    const ascPattern = /(\w+)\s+(asc|ascendente|crescente)/i;
    const descPattern = /(\w+)\s+(desc|descendente|decrescente)/i;
    
    // Verificar padrão ascendente
    const ascMatch = input.match(ascPattern);
    if (ascMatch) {
      return `${ascMatch[1].trim()} asc`;
    }
    
    // Verificar padrão descendente
    const descMatch = input.match(descPattern);
    if (descMatch) {
      return `${descMatch[1].trim()} desc`;
    }
    
    // Se não especificou a direção, assumir que é apenas o nome do campo (ordem ascendente)
    const field = input.trim();
    if (field && /^\w+$/.test(field)) {
      return `${field} asc`;
    }
    
    throw new Error('Formato de ordenação não reconhecido');
  }
  
  /**
   * Constrói um filtro OData a partir do objeto de filtro
   */
  private buildODataFilter(entity: string, filters: Record<string, any>): string {
    if (!filters || Object.keys(filters).length === 0) {
      return '';
    }
    
    const filterParts: string[] = [];
    
    for (const [field, filterInfo] of Object.entries(filters)) {
      // Caso especial para ID
      if (field === 'id') {
        const idField = `${entity.endsWith('s') ? entity.slice(0, -1) : entity}id`;
        filterParts.push(`${idField} eq ${filterInfo}`);
        continue;
      }
      
      // Para outros campos
      const { operator, value } = filterInfo;
      
      // Construir a parte do filtro
      let filterPart = '';
      
      switch (operator) {
        case 'eq':
        case 'ne':
        case 'gt':
        case 'lt':
        case 'ge':
        case 'le':
          // Para operadores de comparação simples
          filterPart = `${field} ${operator} '${value}'`;
          break;
        case 'contains':
        case 'startswith':
        case 'endswith':
          // Para operadores de string
          filterPart = `${operator}(${field}, '${value}')`;
          break;
        default:
          // Operador não suportado
          logger.warn(`[QueryAssistantService] Operador não suportado: ${operator}`);
          continue;
      }
      
      filterParts.push(filterPart);
    }
    
    return filterParts.join(' and ');
  }
  
  /**
   * Remove sessões expiradas
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    let expiredCount = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      const lastActivityTime = session.lastActivity.getTime();
      const expirationTime = lastActivityTime + (this.sessionExpirationMinutes * 60 * 1000);
      
      if (now.getTime() > expirationTime) {
        this.sessions.delete(sessionId);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      logger.debug(`[QueryAssistantService] Removidas ${expiredCount} sessões expiradas`);
    }
  }
  
  /**
   * Obtém uma sessão pelo ID
   */
  public getSession(sessionId: string): QuerySession | undefined {
    return this.sessions.get(sessionId);
  }
  
  /**
   * Encerra uma sessão
   */
  public endSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }
}

// Exportar uma instância única do serviço
export const queryAssistantService = new QueryAssistantService();
