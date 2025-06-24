// src/services/nlQueryService.ts
import { dynamicsService } from './dynamicsService.js';
import logger from '../logger.js';

/**
 * Serviço para processar consultas em linguagem natural para o Dynamics 365
 */
export class NLQueryService {
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
    'activities': 'activities',
    'tarefa': 'tasks',
    'tarefas': 'tasks',
    'task': 'tasks',
    'tasks': 'tasks',
    'email': 'emails',
    'emails': 'emails',
    'reunião': 'appointments',
    'reuniões': 'appointments',
    'appointment': 'appointments',
    'appointments': 'appointments',
    'telefone': 'phonecalls',
    'chamada': 'phonecalls',
    'chamadas': 'phonecalls',
    'phonecall': 'phonecalls',
    'phonecalls': 'phonecalls'
  };

  // Mapeamento de ações comuns
  private actionMappings: Record<string, string> = {
    'mostrar': 'list',
    'listar': 'list',
    'exibir': 'list',
    'buscar': 'list',
    'encontrar': 'list',
    'pesquisar': 'list',
    'procurar': 'list',
    'obter': 'get',
    'pegar': 'get',
    'detalhar': 'get',
    'detalhes': 'get',
    'criar': 'create',
    'adicionar': 'create',
    'novo': 'create',
    'nova': 'create',
    'atualizar': 'update',
    'modificar': 'update',
    'editar': 'update',
    'alterar': 'update',
    'deletar': 'delete',
    'excluir': 'delete',
    'remover': 'delete',
    'apagar': 'delete'
  };

  // Mapeamento de campos comuns
  private fieldMappings: Record<string, Record<string, string>> = {
    'accounts': {
      'nome': 'name',
      'email': 'emailaddress1',
      'telefone': 'telephone1',
      'site': 'websiteurl',
      'website': 'websiteurl',
      'endereço': 'address1_composite',
      'cidade': 'address1_city',
      'estado': 'address1_stateorprovince',
      'país': 'address1_country',
      'cep': 'address1_postalcode',
      'receita': 'revenue',
      'funcionários': 'numberofemployees',
      'setor': 'industrycode',
      'tipo': 'accountcategorycode',
      'dono': '_ownerid_value',
      'proprietário': '_ownerid_value',
      'criado': 'createdon',
      'modificado': 'modifiedon'
    },
    'contacts': {
      'nome': 'firstname',
      'sobrenome': 'lastname',
      'email': 'emailaddress1',
      'telefone': 'telephone1',
      'celular': 'mobilephone',
      'cargo': 'jobtitle',
      'departamento': 'department',
      'conta': '_parentcustomerid_value',
      'empresa': '_parentcustomerid_value',
      'endereço': 'address1_composite',
      'cidade': 'address1_city',
      'estado': 'address1_stateorprovince',
      'país': 'address1_country',
      'cep': 'address1_postalcode',
      'dono': '_ownerid_value',
      'proprietário': '_ownerid_value',
      'criado': 'createdon',
      'modificado': 'modifiedon'
    },
    'incidents': {
      'título': 'title',
      'assunto': 'title',
      'descrição': 'description',
      'cliente': '_customerid_value',
      'status': 'statuscode',
      'prioridade': 'prioritycode',
      'origem': 'caseorigincode',
      'tipo': 'casetypecode',
      'dono': '_ownerid_value',
      'proprietário': '_ownerid_value',
      'criado': 'createdon',
      'modificado': 'modifiedon',
      'resolvido': 'resolvedon'
    }
  };

  // Mapeamento de operadores de comparação
  private operatorMappings: Record<string, string> = {
    'igual': 'eq',
    'igual a': 'eq',
    '=': 'eq',
    '==': 'eq',
    'diferente': 'ne',
    'diferente de': 'ne',
    '!=': 'ne',
    '<>': 'ne',
    'maior': 'gt',
    'maior que': 'gt',
    '>': 'gt',
    'menor': 'lt',
    'menor que': 'lt',
    '<': 'lt',
    'maior ou igual': 'ge',
    'maior ou igual a': 'ge',
    '>=': 'ge',
    'menor ou igual': 'le',
    'menor ou igual a': 'le',
    '<=': 'le',
    'contém': 'contains',
    'contem': 'contains',
    'inicia com': 'startswith',
    'começa com': 'startswith',
    'termina com': 'endswith'
  };

  /**
   * Processa uma consulta em linguagem natural e retorna os resultados do Dynamics 365
   * @param query Consulta em linguagem natural
   * @returns Resultados da consulta processada
   */
  public async processQuery(query: string): Promise<any> {
    logger.debug(`[NLQueryService] Processando consulta: "${query}"`);
    
    try {
      // Normalizar a consulta (remover acentos, converter para minúsculas)
      const normalizedQuery = this.normalizeText(query);
      
      // Extrair a entidade, ação e filtros da consulta
      const { entity, action, filters, fields, limit } = this.parseQuery(normalizedQuery);
      
      if (!entity) {
        return {
          success: false,
          message: "Não foi possível identificar a entidade na consulta. Por favor, especifique a entidade (ex: contas, contatos, casos).",
          query: normalizedQuery
        };
      }
      
      logger.debug(`[NLQueryService] Consulta interpretada: Entidade=${entity}, Ação=${action}, Filtros=${JSON.stringify(filters)}, Campos=${fields?.join(', ')}, Limite=${limit}`);
      
      // Executar a ação apropriada
      switch (action) {
        case 'list':
          return await this.executeListQuery(entity, filters, fields, limit);
        case 'get':
          return await this.executeGetQuery(entity, filters);
        case 'create':
          return {
            success: false,
            message: "A criação de registros via consulta em linguagem natural ainda não é suportada. Use a ferramenta específica para criar registros.",
            query: normalizedQuery
          };
        case 'update':
          return {
            success: false,
            message: "A atualização de registros via consulta em linguagem natural ainda não é suportada. Use a ferramenta específica para atualizar registros.",
            query: normalizedQuery
          };
        case 'delete':
          return {
            success: false,
            message: "A exclusão de registros via consulta em linguagem natural ainda não é suportada. Use a ferramenta específica para excluir registros.",
            query: normalizedQuery
          };
        default:
          // Se não identificou a ação, assume que é uma listagem
          return await this.executeListQuery(entity, filters, fields, limit);
      }
    } catch (error: any) {
      logger.error(`[NLQueryService] Erro ao processar consulta: ${error.message}`, error);
      return {
        success: false,
        message: `Erro ao processar consulta: ${error.message}`,
        query
      };
    }
  }

  /**
   * Normaliza o texto removendo acentos e convertendo para minúsculas
   */
  private normalizeText(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  /**
   * Analisa a consulta em linguagem natural e extrai os componentes
   */
  private parseQuery(query: string): { 
    entity: string | null; 
    action: string | null; 
    filters: Record<string, any>; 
    fields: string[] | null;
    limit: number | null;
  } {
    // Inicializar resultado
    const result = {
      entity: null as string | null,
      action: null as string | null,
      filters: {} as Record<string, any>,
      fields: null as string[] | null,
      limit: null as number | null
    };
    
    // Palavras-chave para ignorar
    const stopWords = ['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'à', 'às', 'pelo', 'pela', 'pelos', 'pelas', 'com', 'para', 'por', 'em', 'sobre', 'sob', 'entre', 'que', 'quem', 'qual', 'quais', 'quando', 'onde', 'como', 'e', 'ou', 'mas', 'porem', 'todavia', 'entretanto', 'contudo'];
    
    // Dividir a consulta em palavras
    const words = query.split(/\s+/).filter(word => word && !stopWords.includes(word));
    
    // Tentar identificar a entidade e a ação
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // Verificar se é uma ação
      if (!result.action && this.actionMappings[word]) {
        result.action = this.actionMappings[word];
        continue;
      }
      
      // Verificar se é uma entidade
      if (!result.entity && this.entityMappings[word]) {
        result.entity = this.entityMappings[word];
        continue;
      }
      
      // Verificar se é um limite (ex: "top 10", "limite 5")
      if ((word === 'top' || word === 'limite' || word === 'limitar' || word === 'limitado' || word === 'maximo' || word === 'max') && i < words.length - 1) {
        const nextWord = words[i + 1];
        const limitValue = parseInt(nextWord);
        if (!isNaN(limitValue) && limitValue > 0) {
          result.limit = limitValue;
          i++; // Pular a próxima palavra (o número)
          continue;
        }
      }
      
      // Tentar identificar filtros no formato "campo operador valor"
      // Exemplo: "nome contém João" ou "criado após 2023-01-01"
      if (i < words.length - 2) {
        const potentialField = word;
        const potentialOperator = words[i + 1];
        const potentialValue = words[i + 2];
        
        // Verificar se o operador é reconhecido
        if (this.operatorMappings[potentialOperator]) {
          // Adicionar o filtro
          result.filters[potentialField] = {
            operator: this.operatorMappings[potentialOperator],
            value: potentialValue
          };
          
          i += 2; // Pular as próximas duas palavras (operador e valor)
          continue;
        }
      }
    }
    
    // Se não identificou a ação, assume que é uma listagem
    if (!result.action) {
      result.action = 'list';
    }
    
    // Verificar se há menção a campos específicos
    const fieldMatches = query.match(/campos\s+([^.]+)/i);
    if (fieldMatches && fieldMatches[1]) {
      result.fields = fieldMatches[1].split(/\s*,\s*/);
    }
    
    return result;
  }

  /**
   * Executa uma consulta de listagem
   */
  private async executeListQuery(
    entity: string, 
    filters: Record<string, any>, 
    fields: string[] | null = null,
    limit: number | null = null
  ): Promise<any> {
    // Converter filtros para formato OData
    const odataFilter = this.buildODataFilter(entity, filters);
    
    // Converter campos para formato OData
    const selectFields = this.mapFields(entity, fields);
    
    // Executar a consulta
    try {
      const results = await dynamicsService.queryEntities(entity, {
        filter: odataFilter || undefined,
        select: selectFields || undefined,
        top: limit || 50,
        orderBy: 'createdon desc'
      });
      
      return {
        success: true,
        entity,
        count: results.length,
        results,
        filter: odataFilter,
        fields: selectFields
      };
    } catch (error: any) {
      logger.error(`[NLQueryService] Erro ao executar consulta de listagem: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Executa uma consulta de detalhamento
   */
  private async executeGetQuery(entity: string, filters: Record<string, any>): Promise<any> {
    // Para consultas de detalhamento, precisamos de um ID ou um filtro único
    if (!filters || Object.keys(filters).length === 0) {
      throw new Error(`Para obter detalhes de um registro, é necessário especificar um ID ou um filtro único.`);
    }
    
    // Converter filtros para formato OData
    const odataFilter = this.buildODataFilter(entity, filters);
    
    // Executar a consulta
    try {
      const results = await dynamicsService.queryEntities(entity, {
        filter: odataFilter,
        top: 1
      });
      
      if (results.length === 0) {
        return {
          success: false,
          entity,
          message: `Nenhum registro encontrado com os filtros especificados.`,
          filter: odataFilter
        };
      }
      
      return {
        success: true,
        entity,
        result: results[0],
        filter: odataFilter
      };
    } catch (error: any) {
      logger.error(`[NLQueryService] Erro ao executar consulta de detalhamento: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Constrói um filtro OData a partir dos filtros em linguagem natural
   */
  private buildODataFilter(entity: string, filters: Record<string, any>): string {
    if (!filters || Object.keys(filters).length === 0) {
      return '';
    }
    
    const filterParts: string[] = [];
    
    for (const [field, filterInfo] of Object.entries(filters)) {
      const { operator, value } = filterInfo;
      
      // Mapear o nome do campo para o nome real no Dynamics
      const mappedField = this.mapFieldName(entity, field);
      
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
          filterPart = `${mappedField} ${operator} '${value}'`;
          break;
        case 'contains':
        case 'startswith':
        case 'endswith':
          // Para operadores de string
          filterPart = `${operator}(${mappedField}, '${value}')`;
          break;
        default:
          // Operador não suportado
          logger.warn(`[NLQueryService] Operador não suportado: ${operator}`);
          continue;
      }
      
      filterParts.push(filterPart);
    }
    
    return filterParts.join(' and ');
  }

  /**
   * Mapeia um nome de campo em linguagem natural para o nome real no Dynamics
   */
  private mapFieldName(entity: string, field: string): string {
    // Verificar se temos um mapeamento para esta entidade
    if (this.fieldMappings[entity] && this.fieldMappings[entity][field]) {
      return this.fieldMappings[entity][field];
    }
    
    // Se não encontrou um mapeamento, retorna o campo original
    return field;
  }

  /**
   * Mapeia uma lista de campos em linguagem natural para os nomes reais no Dynamics
   */
  private mapFields(entity: string, fields: string[] | null): string[] | null {
    if (!fields || fields.length === 0) {
      return null;
    }
    
    return fields.map(field => this.mapFieldName(entity, field.trim()));
  }
}

// Exportar uma instância única do serviço
export const nlQueryService = new NLQueryService();
