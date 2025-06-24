// src/services/shortCommandService.ts
import { dynamicsService } from './dynamicsService.js';
import logger from '../logger.js';

/**
 * Serviço para processar comandos abreviados para operações comuns no Dynamics 365
 */
export class ShortCommandService {
  /**
   * Processa um comando abreviado para o Dynamics 365
   * @param command Comando no formato 'entidade:ação [parâmetros]'
   * @returns Resultado da execução do comando
   */
  public async processCommand(command: string): Promise<any> {
    logger.debug(`[ShortCommandService] Processando comando: "${command}"`);
    
    try {
      // Analisar o comando
      const { entity, action, params } = this.parseCommand(command);
      
      if (!entity || !action) {
        return {
          success: false,
          message: "Formato de comando inválido. Use 'entidade:ação [parâmetros]', ex: 'contact:list', 'account:get 123'",
          command
        };
      }
      
      logger.debug(`[ShortCommandService] Comando interpretado: Entidade=${entity}, Ação=${action}, Parâmetros=${JSON.stringify(params)}`);
      
      // Executar a ação apropriada
      switch (action.toLowerCase()) {
        case 'list':
        case 'ls':
          return await this.executeListCommand(entity, params);
        case 'get':
        case 'show':
        case 'view':
          return await this.executeGetCommand(entity, params);
        case 'create':
        case 'new':
        case 'add':
          return await this.executeCreateCommand(entity, params);
        case 'update':
        case 'edit':
        case 'mod':
          return await this.executeUpdateCommand(entity, params);
        case 'delete':
        case 'del':
        case 'rm':
          return await this.executeDeleteCommand(entity, params);
        case 'count':
          return await this.executeCountCommand(entity, params);
        case 'fields':
        case 'schema':
          return await this.executeFieldsCommand(entity);
        default:
          return {
            success: false,
            message: `Ação '${action}' não reconhecida. Ações disponíveis: list, get, create, update, delete, count, fields`,
            command
          };
      }
    } catch (error: any) {
      logger.error(`[ShortCommandService] Erro ao processar comando: ${error.message}`, error);
      return {
        success: false,
        message: `Erro ao processar comando: ${error.message}`,
        command
      };
    }
  }

  /**
   * Analisa um comando abreviado
   * @param command Comando no formato 'entidade:ação [parâmetros]'
   * @returns Componentes do comando (entidade, ação, parâmetros)
   */
  private parseCommand(command: string): { 
    entity: string | null; 
    action: string | null; 
    params: Record<string, any>;
  } {
    // Inicializar resultado
    const result = {
      entity: null as string | null,
      action: null as string | null,
      params: {} as Record<string, any>
    };
    
    // Verificar se o comando está vazio
    if (!command || command.trim() === '') {
      return result;
    }
    
    // Dividir o comando em partes
    const parts = command.trim().split(/\s+/);
    
    // A primeira parte deve ser 'entidade:ação'
    const entityAction = parts[0].split(':');
    if (entityAction.length !== 2) {
      return result;
    }
    
    result.entity = this.normalizeEntityName(entityAction[0]);
    result.action = entityAction[1];
    
    // Processar os parâmetros
    if (parts.length > 1) {
      // O primeiro parâmetro pode ser um ID
      if (parts[1].indexOf('=') === -1) {
        result.params.id = parts[1];
      }
      
      // Processar parâmetros no formato chave=valor
      for (let i = 1; i < parts.length; i++) {
        const param = parts[i];
        const keyValue = param.split('=');
        
        if (keyValue.length === 2) {
          const key = keyValue[0];
          let value: any = keyValue[1];
          
          // Tentar converter para número ou booleano se apropriado
          if (value === 'true') {
            value = true;
          } else if (value === 'false') {
            value = false;
          } else if (!isNaN(Number(value)) && value.trim() !== '') {
            value = Number(value);
          }
          
          result.params[key] = value;
        }
      }
    }
    
    return result;
  }

  /**
   * Normaliza o nome da entidade para o formato correto do Dynamics 365
   */
  private normalizeEntityName(entity: string): string {
    // Mapeamento de nomes comuns de entidades
    const entityMap: Record<string, string> = {
      'account': 'accounts',
      'conta': 'accounts',
      'contas': 'accounts',
      'contact': 'contacts',
      'contato': 'contacts',
      'contatos': 'contacts',
      'case': 'incidents',
      'caso': 'incidents',
      'casos': 'incidents',
      'incident': 'incidents',
      'opportunity': 'opportunities',
      'oportunidade': 'opportunities',
      'oportunidades': 'opportunities',
      'lead': 'leads',
      'task': 'tasks',
      'tarefa': 'tasks',
      'tarefas': 'tasks',
      'email': 'emails',
      'appointment': 'appointments',
      'reuniao': 'appointments',
      'reunião': 'appointments',
      'phonecall': 'phonecalls',
      'chamada': 'phonecalls'
    };
    
    return entityMap[entity.toLowerCase()] || entity;
  }

  /**
   * Executa um comando de listagem
   */
  private async executeListCommand(entity: string, params: Record<string, any>): Promise<any> {
    // Extrair parâmetros específicos para listagem
    const top = params.top || params.limit || 50;
    const orderBy = params.orderBy || params.order || 'createdon desc';
    
    // Construir filtro
    let filter = '';
    const filterParams: Record<string, any> = {};
    
    // Copiar todos os parâmetros que não são especiais para o filtro
    for (const [key, value] of Object.entries(params)) {
      if (!['top', 'limit', 'orderBy', 'order', 'select', 'fields', 'expand'].includes(key)) {
        filterParams[key] = value;
      }
    }
    
    // Construir filtro OData
    if (Object.keys(filterParams).length > 0) {
      const filterParts: string[] = [];
      
      for (const [key, value] of Object.entries(filterParams)) {
        if (key === 'id') {
          // Tratar ID especialmente
          const idField = `${entity.endsWith('s') ? entity.slice(0, -1) : entity}id`;
          filterParts.push(`${idField} eq ${value}`);
        } else if (typeof value === 'string') {
          // Para strings, usar contains se não for um operador específico
          if (value.includes('*')) {
            // Usar contains, startswith ou endswith com base na posição do *
            const cleanValue = value.replace(/\*/g, '');
            if (value.startsWith('*') && value.endsWith('*')) {
              filterParts.push(`contains(${key}, '${cleanValue}')`);
            } else if (value.startsWith('*')) {
              filterParts.push(`endswith(${key}, '${cleanValue}')`);
            } else if (value.endsWith('*')) {
              filterParts.push(`startswith(${key}, '${cleanValue}')`);
            }
          } else {
            filterParts.push(`${key} eq '${value}'`);
          }
        } else if (typeof value === 'number') {
          filterParts.push(`${key} eq ${value}`);
        } else if (typeof value === 'boolean') {
          filterParts.push(`${key} eq ${value}`);
        }
      }
      
      filter = filterParts.join(' and ');
    }
    
    // Campos a selecionar
    const select = params.select || params.fields ? 
      (params.select || params.fields).split(',').map((f: string) => f.trim()) : 
      undefined;
    
    // Relacionamentos a expandir
    const expand = params.expand ? 
      params.expand.split(',').map((e: string) => e.trim()) : 
      undefined;
    
    // Executar a consulta
    try {
      const results = await dynamicsService.queryEntities(entity, {
        filter: filter || undefined,
        select,
        expand,
        top,
        orderBy
      });
      
      return {
        success: true,
        entity,
        count: results.length,
        results,
        filter,
        select,
        expand,
        top,
        orderBy
      };
    } catch (error: any) {
      logger.error(`[ShortCommandService] Erro ao executar comando de listagem: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Executa um comando de obtenção de detalhes
   */
  private async executeGetCommand(entity: string, params: Record<string, any>): Promise<any> {
    // Verificar se temos um ID
    if (!params.id) {
      throw new Error(`Para obter detalhes de um registro, é necessário especificar um ID.`);
    }
    
    // Construir filtro para buscar pelo ID
    const idField = `${entity.endsWith('s') ? entity.slice(0, -1) : entity}id`;
    const filter = `${idField} eq ${params.id}`;
    
    // Campos a selecionar
    const select = params.select || params.fields ? 
      (params.select || params.fields).split(',').map((f: string) => f.trim()) : 
      undefined;
    
    // Relacionamentos a expandir
    const expand = params.expand ? 
      params.expand.split(',').map((e: string) => e.trim()) : 
      undefined;
    
    // Executar a consulta
    try {
      const results = await dynamicsService.queryEntities(entity, {
        filter,
        select,
        expand,
        top: 1
      });
      
      if (results.length === 0) {
        return {
          success: false,
          entity,
          message: `Nenhum registro encontrado com ID ${params.id}.`,
          filter
        };
      }
      
      return {
        success: true,
        entity,
        result: results[0],
        filter,
        select,
        expand
      };
    } catch (error: any) {
      logger.error(`[ShortCommandService] Erro ao executar comando de detalhamento: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Executa um comando de criação
   */
  private async executeCreateCommand(entity: string, params: Record<string, any>): Promise<any> {
    // Remover o parâmetro ID se presente
    const { id, ...data } = params;
    
    // Verificar se temos dados para criar
    if (Object.keys(data).length === 0) {
      throw new Error(`Para criar um registro, é necessário especificar pelo menos um campo.`);
    }
    
    // Executar a criação
    try {
      const result = await dynamicsService.createEntity(entity, data);
      
      return {
        success: true,
        entity,
        message: `Registro criado com sucesso.`,
        result,
        data
      };
    } catch (error: any) {
      logger.error(`[ShortCommandService] Erro ao executar comando de criação: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Executa um comando de atualização
   */
  private async executeUpdateCommand(entity: string, params: Record<string, any>): Promise<any> {
    // Verificar se temos um ID
    if (!params.id) {
      throw new Error(`Para atualizar um registro, é necessário especificar um ID.`);
    }
    
    // Remover o parâmetro ID dos dados
    const { id, ...data } = params;
    
    // Verificar se temos dados para atualizar
    if (Object.keys(data).length === 0) {
      throw new Error(`Para atualizar um registro, é necessário especificar pelo menos um campo.`);
    }
    
    // Executar a atualização
    try {
      await dynamicsService.updateEntity(entity, id, data);
      
      return {
        success: true,
        entity,
        message: `Registro com ID ${id} atualizado com sucesso.`,
        id,
        data
      };
    } catch (error: any) {
      logger.error(`[ShortCommandService] Erro ao executar comando de atualização: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Executa um comando de exclusão
   */
  private async executeDeleteCommand(entity: string, params: Record<string, any>): Promise<any> {
    // Verificar se temos um ID
    if (!params.id) {
      throw new Error(`Para excluir um registro, é necessário especificar um ID.`);
    }
    
    // Executar a exclusão
    try {
      // Usar o método deleteEntity do dynamicsService
      await dynamicsService.deleteEntity(entity, params.id);
      
      return {
        success: true,
        entity,
        message: `Registro com ID ${params.id} excluído com sucesso.`,
        id: params.id
      };
    } catch (error: any) {
      logger.error(`[ShortCommandService] Erro ao executar comando de exclusão: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Executa um comando de contagem
   */
  private async executeCountCommand(entity: string, params: Record<string, any>): Promise<any> {
    // Construir filtro
    let filter = '';
    const filterParams: Record<string, any> = {};
    
    // Copiar todos os parâmetros que não são especiais para o filtro
    for (const [key, value] of Object.entries(params)) {
      if (!['select', 'fields', 'expand'].includes(key)) {
        filterParams[key] = value;
      }
    }
    
    // Construir filtro OData
    if (Object.keys(filterParams).length > 0) {
      const filterParts: string[] = [];
      
      for (const [key, value] of Object.entries(filterParams)) {
        if (key === 'id') {
          // Tratar ID especialmente
          const idField = `${entity.endsWith('s') ? entity.slice(0, -1) : entity}id`;
          filterParts.push(`${idField} eq ${value}`);
        } else if (typeof value === 'string') {
          // Para strings, usar contains se não for um operador específico
          if (value.includes('*')) {
            // Usar contains, startswith ou endswith com base na posição do *
            const cleanValue = value.replace(/\*/g, '');
            if (value.startsWith('*') && value.endsWith('*')) {
              filterParts.push(`contains(${key}, '${cleanValue}')`);
            } else if (value.startsWith('*')) {
              filterParts.push(`endswith(${key}, '${cleanValue}')`);
            } else if (value.endsWith('*')) {
              filterParts.push(`startswith(${key}, '${cleanValue}')`);
            }
          } else {
            filterParts.push(`${key} eq '${value}'`);
          }
        } else if (typeof value === 'number') {
          filterParts.push(`${key} eq ${value}`);
        } else if (typeof value === 'boolean') {
          filterParts.push(`${key} eq ${value}`);
        }
      }
      
      filter = filterParts.join(' and ');
    }
    
    // Executar a consulta
    try {
      const results = await dynamicsService.queryEntities(entity, {
        filter: filter || undefined,
        select: ['createdon'], // Selecionar apenas um campo para minimizar dados transferidos
        top: 1000 // Limite para evitar sobrecarga
      });
      
      return {
        success: true,
        entity,
        count: results.length,
        filter
      };
    } catch (error: any) {
      logger.error(`[ShortCommandService] Erro ao executar comando de contagem: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Executa um comando para listar campos de uma entidade
   */
  private async executeFieldsCommand(entity: string): Promise<any> {
    try {
      // Obter metadados da entidade
      const metadata = await dynamicsService.getEntityMetadata(entity, {
        includeAttributes: true,
        includeAttributeTypes: true,
        includeOptionSets: true
      });
      
      // Extrair informações relevantes dos campos
      const fields = metadata.attributes.map((attr: any) => ({
        name: attr.LogicalName,
        displayName: attr.DisplayName?.UserLocalizedLabel?.Label || attr.LogicalName,
        type: attr.AttributeType,
        description: attr.Description?.UserLocalizedLabel?.Label || '',
        required: attr.RequiredLevel?.Value === 'Required',
        maxLength: attr.MaxLength,
        precision: attr.Precision,
        optionSet: attr.OptionSet ? {
          name: attr.OptionSet.Name,
          options: attr.OptionSet.Options?.map((opt: any) => ({
            value: opt.Value,
            label: opt.Label?.UserLocalizedLabel?.Label || `Option ${opt.Value}`
          }))
        } : null
      }));
      
      return {
        success: true,
        entity,
        entityDisplayName: metadata.DisplayName?.UserLocalizedLabel?.Label || entity,
        entityDescription: metadata.Description?.UserLocalizedLabel?.Label || '',
        primaryKey: metadata.PrimaryIdAttribute,
        primaryName: metadata.PrimaryNameAttribute,
        fields
      };
    } catch (error: any) {
      logger.error(`[ShortCommandService] Erro ao executar comando de campos: ${error.message}`, error);
      throw error;
    }
  }
}

// Exportar uma instância única do serviço
export const shortCommandService = new ShortCommandService();
