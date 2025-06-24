// src/services/dynamicsService.ts
import axios, { AxiosInstance } from 'axios';
import * as msal from '@azure/msal-node';
import logger from '../logger.js';

// Tipos para as respostas da API
export interface DynamicsEntity {
  id: string;
  [key: string]: any;
}

export interface DynamicsResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

/**
 * Serviço para interagir com a API do Dynamics 365
 */
export class DynamicsService {
  private clientId: string;
  private clientSecret: string;
  private tenantId: string;
  private resourceUrl: string;
  private apiVersion: string;
  private client: AxiosInstance | null = null;
  private tokenExpiresAt: number = 0;
  private metadataCache: Record<string, any> = {};

  // Métodos públicos são implementados diretamente na classe

  constructor() {
    this.clientId = process.env.DYNAMICS_CLIENT_ID || '';
    this.clientSecret = process.env.DYNAMICS_CLIENT_SECRET || '';
    this.tenantId = process.env.DYNAMICS_TENANT_ID || '';
    this.resourceUrl = process.env.DYNAMICS_URL || '';
    this.apiVersion = process.env.DYNAMICS_API_VERSION || '9.2';

    if (!this.clientId || !this.clientSecret || !this.tenantId || !this.resourceUrl) {
      logger.warn('[DynamicsService] Credenciais incompletas. Usando modo simulado.');
    }
  }

  /**
   * Obtém um token de acesso para a API do Dynamics 365
   */
  private async getAccessToken(): Promise<string> {
    if (!this.clientId || !this.clientSecret || !this.tenantId) {
      logger.warn('[DynamicsService] Credenciais incompletas. Retornando token simulado.');
      return 'token-simulado-' + Date.now();
    }

    try {
      // Configuração do cliente MSAL
      const msalConfig = {
        auth: {
          clientId: this.clientId,
          clientSecret: this.clientSecret,
          authority: `https://login.microsoftonline.com/${this.tenantId}`
        }
      };

      const cca = new msal.ConfidentialClientApplication(msalConfig);
      
      // Escopo para a API do Dynamics 365
      const scopes = [`${this.resourceUrl}/.default`];
      
      // Obter token
      const result = await cca.acquireTokenByClientCredential({
        scopes
      });

      if (result?.accessToken) {
        // Armazenar quando o token expira
        const expiresOn = result.expiresOn || new Date(Date.now() + 3600 * 1000);
        this.tokenExpiresAt = expiresOn instanceof Date ? expiresOn.getTime() : Date.now() + 3600 * 1000;
        return result.accessToken;
      } else {
        throw new Error('Falha ao obter token de acesso');
      }
    } catch (error) {
      logger.error('[DynamicsService] Erro ao obter token:', error);
      throw error;
    }
  }

  /**
   * Cria ou atualiza o cliente HTTP para a API do Dynamics 365
   */
  private async getClient(): Promise<AxiosInstance> {
    // Se o token expirou ou não existe cliente, criar um novo
    if (!this.client || Date.now() >= this.tokenExpiresAt) {
      try {
        const accessToken = await this.getAccessToken();
        
        this.client = axios.create({
          baseURL: `${this.resourceUrl}/api/data/v${this.apiVersion}/`,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0'
          }
        });
      } catch (error) {
        logger.error('[DynamicsService] Erro ao criar cliente HTTP:', error);
        throw error;
      }
    }
    
    return this.client;
  }

  /**
   * Executa uma ação na API do Dynamics 365
   */
  public async executeAction(actionName: string, parameters: Record<string, any> = {}): Promise<any> {
    logger.debug(`[DynamicsService] Executando ação ${actionName}`);
    
    try {
      // Verificar se estamos em modo simulado
      if (!this.clientId || !this.clientSecret || !this.tenantId) {
        return this.simulateAction(actionName, parameters);
      }
      
      const client = await this.getClient();
      
      // Corrigir o formato do endpoint para ações do Dynamics 365
      // Para WhoAmI, o endpoint correto é WhoAmI sem parênteses
      if (actionName === 'WhoAmI') {
        // Para WhoAmI, usamos GET em vez de POST
        const response = await client.get(`WhoAmI`);
        return response.data;
      } else {
        // Para outras ações, usamos o formato padrão
        const response = await client.post(`${actionName}`, parameters);
        return response.data;
      }
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao executar ação ${actionName}:`, error);
      throw error;
    }
  }

  /**
   * Consulta entidades na API do Dynamics 365
   */
  public async queryEntities<T = DynamicsEntity>(
    entityName: string, 
    options: { 
      select?: string[], 
      filter?: string, 
      orderBy?: string, 
      top?: number,
      expand?: string[]
    } = {}
  ): Promise<T[]> {
    logger.debug(`[DynamicsService] Consultando entidades ${entityName}`);
    
    try {
      // Verificar se estamos em modo simulado
      if (!this.clientId || !this.clientSecret || !this.tenantId) {
        return this.simulateQueryEntities(entityName, options) as T[];
      }
      
      const client = await this.getClient();
      
      // Construir a query OData
      let query = `${entityName}?`;
      
      if (options.select && options.select.length > 0) {
        query += `$select=${options.select.join(',')}&`;
      }
      
      if (options.filter) {
        query += `$filter=${options.filter}&`;
      }
      
      if (options.orderBy) {
        query += `$orderby=${options.orderBy}&`;
      }
      
      if (options.top) {
        query += `$top=${options.top}&`;
      }
      
      if (options.expand && options.expand.length > 0) {
        query += `$expand=${options.expand.join(',')}&`;
      }
      
      // Remover o último '&' ou '?'
      query = query.replace(/[?&]$/, '');
      
      const response = await client.get<DynamicsResponse<T>>(query);
      return response.data.value;
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao consultar entidades ${entityName}:`, error);
      throw error;
    }
  }

  /**
   * Cria uma entidade na API do Dynamics 365
   */
  public async createEntity(
    entityName: string, 
    data: Record<string, any>
  ): Promise<any> {
    logger.debug(`[DynamicsService] Criando entidade ${entityName}`);
    
    try {
      // Verificar se estamos em modo simulado
      if (!this.clientId || !this.clientSecret || !this.tenantId) {
        return this.simulateCreateEntity(entityName, data);
      }
      
      const client = await this.getClient();
      const response = await client.post(`${entityName}`, data);
      return response.data;
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao criar entidade ${entityName}:`, error);
      throw error;
    }
  }

  /**
   * Atualiza uma entidade na API do Dynamics 365
   */
  public async updateEntity(
    entityName: string, 
    entityId: string, 
    data: Record<string, any>
  ): Promise<void> {
    logger.debug(`[DynamicsService] Atualizando entidade ${entityName} com ID ${entityId}`);
    
    try {
      // Verificar se estamos em modo simulado
      if (!this.clientId || !this.clientSecret || !this.tenantId) {
        return this.simulateUpdateEntity(entityName, entityId, data);
      }
      
      const client = await this.getClient();
      await client.patch(`${entityName}(${entityId})`, data);
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao atualizar entidade ${entityName} com ID ${entityId}:`, error);
      throw error;
    }
  }

  // Métodos de simulação para testes sem credenciais reais

  private simulateAction(actionName: string, parameters: Record<string, any> = {}): any {
    logger.debug(`[DynamicsService] Simulando ação ${actionName} com parâmetros:`, parameters);
    
    if (actionName === 'WhoAmI') {
      return {
        BusinessUnitId: '00000000-0000-0000-0000-000000000000',
        UserId: '11111111-1111-1111-1111-111111111111',
        OrganizationId: '22222222-2222-2222-2222-222222222222',
        OrganizationName: 'Dynamics 365 Simulado',
        SimulatedResponse: true
      };
    }
    
    return {
      actionName,
      parameters,
      result: 'Ação simulada executada com sucesso',
      timestamp: new Date().toISOString(),
      SimulatedResponse: true
    };
  }

  private simulateQueryEntities(
    entityName: string, 
    options: { 
      select?: string[], 
      filter?: string, 
      orderBy?: string, 
      top?: number,
      expand?: string[]
    } = {}
  ): DynamicsEntity[] {
    logger.debug(`[DynamicsService] Simulando consulta de entidades ${entityName} com opções:`, options);
    
    // Simulação de diferentes entidades
    if (entityName === 'accounts') {
      return [
        { id: 'acc-001', name: 'Contoso Ltd.', industry: 'Technology', revenue: 1000000 },
        { id: 'acc-002', name: 'Fabrikam Inc.', industry: 'Manufacturing', revenue: 750000 },
        { id: 'acc-003', name: 'Northwind Traders', industry: 'Retail', revenue: 500000 },
        { id: 'acc-004', name: 'Adventure Works', industry: 'Sports', revenue: 250000 }
      ];
    } else if (entityName === 'contacts') {
      return [
        { id: 'cont-001', firstName: 'John', lastName: 'Doe', email: 'john.doe@contoso.com', accountId: 'acc-001' },
        { id: 'cont-002', firstName: 'Jane', lastName: 'Smith', email: 'jane.smith@fabrikam.com', accountId: 'acc-002' },
        { id: 'cont-003', firstName: 'Bob', lastName: 'Johnson', email: 'bob.johnson@northwind.com', accountId: 'acc-003' }
      ];
    } else if (entityName === 'incidents') {
      return [
        { id: 'case-001', title: 'Problema de login', status: 'Ativo', customerId: 'acc-001', createdOn: '2025-04-01T10:00:00Z' },
        { id: 'case-002', title: 'Erro na fatura', status: 'Em Andamento', customerId: 'acc-002', createdOn: '2025-04-02T14:30:00Z' },
        { id: 'case-003', title: 'Solicitação de suporte', status: 'Resolvido', customerId: 'acc-001', createdOn: '2025-04-03T09:15:00Z' }
      ];
    }
    
    return [];
  }

  private simulateCreateEntity(entityName: string, data: Record<string, any>): any {
    logger.debug(`[DynamicsService] Simulando criação de entidade ${entityName} com dados:`, data);
    
    return {
      id: `${entityName.slice(0, 4)}-${Date.now()}`,
      ...data,
      createdOn: new Date().toISOString(),
      SimulatedResponse: true
    };
  }

  private simulateUpdateEntity(entityName: string, entityId: string, data: Record<string, any>): void {
    logger.debug(`[DynamicsService] Simulando atualização de entidade ${entityName} com ID ${entityId} e dados:`, data);
  }

  /**
 * Obtém metadados de uma entidade do Dynamics 365
 * @param entityLogicalName Nome lógico da entidade (ex: account, contact, incident)
 * @param options Opções adicionais para a consulta de metadados
 * @returns Metadados da entidade, incluindo atributos e seus tipos
 */
public async getEntityMetadata(
  entityLogicalName: string,
  options: {
    includeAttributes?: boolean;
    includeAttributeTypes?: boolean; // Kept for clarity, AttributeType should be in selectAttributeProperties
    includeOptionSets?: boolean;
    selectEntityProperties?: string[];
    selectAttributeProperties?: string[];
  } = {}
): Promise<any> {
  logger.debug(`[DynamicsService] Obtendo metadados da entidade ${entityLogicalName} com opções: ${JSON.stringify(options)}`);

  try {
    if (!this.clientId || !this.clientSecret || !this.tenantId) {
      return this.simulateEntityMetadata(entityLogicalName, options);
    }

    const cacheKey = `entity-${entityLogicalName}-${JSON.stringify(options)}`;
    if (this.metadataCache[cacheKey]) {
      logger.debug(`[DynamicsService] Usando metadados em cache para entidade ${entityLogicalName}`);
      return this.metadataCache[cacheKey];
    }

    const client = await this.getClient();
    let metadataUrl = `EntityDefinitions(LogicalName='${entityLogicalName}')`;
    const queryParams = [];

    const entityPropertiesToSelect = options.selectEntityProperties && options.selectEntityProperties.length > 0
      ? options.selectEntityProperties
      : ['LogicalName', 'SchemaName', 'DisplayName', 'PrimaryIdAttribute', 'PrimaryNameAttribute', 'ObjectTypeCode', 'IsCustomizable', 'Description', 'EntitySetName'];

    if (entityPropertiesToSelect.length > 0) {
      queryParams.push(`$select=${entityPropertiesToSelect.join(',')}`);
    }

    if (options.includeAttributes) {
      const attributePropertiesToSelect = options.selectAttributeProperties && options.selectAttributeProperties.length > 0
        ? options.selectAttributeProperties
        : ['LogicalName', 'SchemaName', 'DisplayName', 'AttributeType', 'RequiredLevel', 'Description', 'IsPrimaryId', 'IsPrimaryName', 'Format', 'MaxLength', 'MinValue', 'MaxValue'];
      
      let attributeSelect = `$select=${attributePropertiesToSelect.join(',')}`;
      let attributeExpandClause = `Attributes(${attributeSelect}`;

      if (options.includeOptionSets) {
        const optionSetExpansions = [
          'Microsoft.Dynamics.CRM.PicklistAttributeMetadata/OptionSet($select=Options,Name,DisplayName)',
          'Microsoft.Dynamics.CRM.StatusAttributeMetadata/OptionSet($select=Options,Name,DisplayName)',
          'Microsoft.Dynamics.CRM.StateAttributeMetadata/OptionSet($select=Options,Name,DisplayName)',
          'Microsoft.Dynamics.CRM.BooleanAttributeMetadata/OptionSet($select=Options,Name,DisplayName)' // For TwoOptionSet
        ];
        attributeExpandClause += `;$expand=${optionSetExpansions.join(',')}`;
      }
      attributeExpandClause += ')';
      queryParams.push(`$expand=${attributeExpandClause}`);
    }

    if (queryParams.length > 0) {
      metadataUrl += `?${queryParams.join('&')}`;
    }

    logger.debug(`[DynamicsService] URL de metadados da entidade: ${metadataUrl}`);
    const response = await client.get(metadataUrl);
    this.metadataCache[cacheKey] = response.data;
    return response.data;

  } catch (error: any) {
    logger.error(`[DynamicsService] Erro ao obter metadados da entidade ${entityLogicalName}: ${error.message}`, error.stack);
    if (error.response?.data) {
        logger.error('[DynamicsService] Detalhes do erro da API:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

/**
 * Obtém metadados de um atributo específico de uma entidade do Dynamics 365
 * @param entityLogicalName Nome lógico da entidade (ex: account, contact, incident)
 * @param attributeName Nome lógico do atributo (ex: name, emailaddress1, prioritycode)
 * @param options Opções adicionais para a consulta de metadados
 * @returns Metadados do atributo específico
 */
public async getAttributeMetadata(
  entityLogicalName: string,
  attributeLogicalName: string,
  options: {
    includeOptionSets?: boolean;
    selectAttributeProperties?: string[];
  } = {}
): Promise<any> {
  logger.debug(`[DynamicsService] Obtendo metadados do atributo ${attributeLogicalName} da entidade ${entityLogicalName} com opções: ${JSON.stringify(options)}`);

  try {
    if (!this.clientId || !this.clientSecret || !this.tenantId) {
      // Pass attributeLogicalName to simulateEntityMetadata if it's adapted to handle it,
      // otherwise, this simulation might need its own specific mock for attribute metadata.
      return this.simulateEntityMetadata(entityLogicalName, { ...options, attributeLogicalNameForSimulation: attributeLogicalName });
    }

    const cacheKey = `attribute-${entityLogicalName}-${attributeLogicalName}-${JSON.stringify(options)}`;
    if (this.metadataCache[cacheKey]) {
      logger.debug(`[DynamicsService] Usando metadados em cache para ${entityLogicalName}.${attributeLogicalName}`);
      return this.metadataCache[cacheKey];
    }

    const client = await this.getClient();

    // 1. Obter o tipo do atributo primeiro.
    const typeQueryUrl = `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attributeLogicalName}')?$select=AttributeType,LogicalName`;
    logger.debug(`[DynamicsService] URL para obter tipo do atributo: ${typeQueryUrl}`);
    const typeResponse = await client.get(typeQueryUrl);
    
    if (!typeResponse.data || !typeResponse.data.AttributeType) {
        throw new Error(`Não foi possível determinar o tipo do atributo '${attributeLogicalName}' na entidade '${entityLogicalName}'. Resposta: ${JSON.stringify(typeResponse.data)}`);
    }
    const attributeType = typeResponse.data.AttributeType;

    // 2. Construir a URL final com base no tipo e opções
    let attributeMetadataUrl = `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attributeLogicalName}')`;
    
    let specificTypeCast = '';
    switch (attributeType) {
      case 'Picklist': specificTypeCast = '/Microsoft.Dynamics.CRM.PicklistAttributeMetadata'; break;
      case 'Status': specificTypeCast = '/Microsoft.Dynamics.CRM.StatusAttributeMetadata'; break;
      case 'State': specificTypeCast = '/Microsoft.Dynamics.CRM.StateAttributeMetadata'; break;
      case 'Boolean': specificTypeCast = '/Microsoft.Dynamics.CRM.BooleanAttributeMetadata'; break;
      case 'Lookup': specificTypeCast = '/Microsoft.Dynamics.CRM.LookupAttributeMetadata'; break;
      case 'Customer': specificTypeCast = '/Microsoft.Dynamics.CRM.LookupAttributeMetadata'; break;
      case 'Owner': specificTypeCast = '/Microsoft.Dynamics.CRM.LookupAttributeMetadata'; break;
      case 'String': specificTypeCast = '/Microsoft.Dynamics.CRM.StringAttributeMetadata'; break;
      case 'Memo': specificTypeCast = '/Microsoft.Dynamics.CRM.MemoAttributeMetadata'; break;
      case 'Integer': specificTypeCast = '/Microsoft.Dynamics.CRM.IntegerAttributeMetadata'; break;
      case 'Decimal': specificTypeCast = '/Microsoft.Dynamics.CRM.DecimalAttributeMetadata'; break;
      case 'Money': specificTypeCast = '/Microsoft.Dynamics.CRM.MoneyAttributeMetadata'; break;
      case 'Double': specificTypeCast = '/Microsoft.Dynamics.CRM.DoubleAttributeMetadata'; break;
      case 'DateTime': specificTypeCast = '/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata'; break;
      case 'Uniqueidentifier': specificTypeCast = '/Microsoft.Dynamics.CRM.UniqueidentifierAttributeMetadata'; break;
      case 'Image': specificTypeCast = '/Microsoft.Dynamics.CRM.ImageAttributeMetadata'; break;
      // Adicionar outros tipos conforme necessário (BigInt, File, etc.)
      default:
        logger.warn(`[DynamicsService] Tipo de atributo não mapeado para cast específico: ${attributeType}. Usando cast genérico AttributeMetadata.`);
        specificTypeCast = '/Microsoft.Dynamics.CRM.AttributeMetadata'; // Fallback to generic attribute metadata
    }
    attributeMetadataUrl += specificTypeCast;

    const queryParams = [];
    const defaultAttributeProperties = ['LogicalName', 'SchemaName', 'DisplayName', 'AttributeType', 'RequiredLevel', 'Description', 'IsPrimaryId', 'IsPrimaryName', 'Format', 'MaxLength', 'MinValue', 'MaxValue'];
    
    const attributePropertiesToSelect = options.selectAttributeProperties && options.selectAttributeProperties.length > 0
      ? options.selectAttributeProperties
      : defaultAttributeProperties;

    if (attributePropertiesToSelect.length > 0) {
      queryParams.push(`$select=${attributePropertiesToSelect.join(',')}`);
    }

    if (options.includeOptionSets) {
      if (['Picklist', 'Status', 'State', 'Boolean'].includes(attributeType)) {
        queryParams.push(`$expand=OptionSet($select=Options,Name,DisplayName)`); // Value is part of each Option in Options
      }
    }
    
    if (queryParams.length > 0) {
      attributeMetadataUrl += `?${queryParams.join('&')}`;
    }
    
    logger.debug(`[DynamicsService] URL final de metadados do atributo: ${attributeMetadataUrl}`);
    const response = await client.get(attributeMetadataUrl);
    
    this.metadataCache[cacheKey] = response.data;
    return response.data;

  } catch (error: any) {
    logger.error(`[DynamicsService] Erro ao obter metadados do atributo ${attributeLogicalName} da entidade ${entityLogicalName}: ${error.message}`, error.stack);
     if (error.response?.data) {
        logger.error('[DynamicsService] Detalhes do erro da API:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

  /**
   * Simula a obtenção de metadados de uma entidade
   * @param entityLogicalName Nome lógico da entidade
   * @param options Opções adicionais para a simulação
   * @returns Metadados simulados da entidade
   */
  private simulateEntityMetadata(entityLogicalName: string, options: any): any {
    logger.debug(`[DynamicsService] Simulando metadados da entidade ${entityLogicalName} com opções:`, options);
    
    // Simulação básica de metadados para algumas entidades comuns
    if (entityLogicalName === 'account') {
      return {
        LogicalName: 'account',
        SchemaName: 'Account',
        DisplayName: {
          UserLocalizedLabel: {
            Label: 'Conta'
          }
        },
        Description: {
          UserLocalizedLabel: {
            Label: 'Entidade de conta de negócios.'
          }
        },
        PrimaryIdAttribute: 'accountid',
        PrimaryNameAttribute: 'name',
        ObjectTypeCode: 1,
        EntitySetName: 'accounts',
        IsCustomizable: { Value: true, CanBeChanged: false },
        Attributes: [
          {
            LogicalName: 'accountid',
            SchemaName: 'AccountId',
            AttributeType: 'Uniqueidentifier',
            DisplayName: { UserLocalizedLabel: { Label: 'ID da Conta' } },
            IsPrimaryId: true
          },
          {
            LogicalName: 'name',
            SchemaName: 'Name',
            AttributeType: 'String',
            DisplayName: { UserLocalizedLabel: { Label: 'Nome' } },
            MaxLength: 100,
            RequiredLevel: { Value: 'Required' }
          },
          {
            LogicalName: 'accountnumber',
            SchemaName: 'AccountNumber',
            AttributeType: 'String',
            DisplayName: { UserLocalizedLabel: { Label: 'Número da Conta' } },
            MaxLength: 20
          },
          {
            LogicalName: 'industrycode',
            SchemaName: 'IndustryCode',
            AttributeType: 'Picklist',
            DisplayName: { UserLocalizedLabel: { Label: 'Setor' } },
            OptionSet: {
              Options: [
                { Value: 1, Label: { UserLocalizedLabel: { Label: 'Agricultura' } } },
                { Value: 2, Label: { UserLocalizedLabel: { Label: 'Manufatura' } } },
                { Value: 3, Label: { UserLocalizedLabel: { Label: 'Tecnologia' } } },
                { Value: 4, Label: { UserLocalizedLabel: { Label: 'Varejo' } } }
              ]
            }
          },
          {
            LogicalName: 'revenue',
            SchemaName: 'Revenue',
            AttributeType: 'Money',
            DisplayName: { UserLocalizedLabel: { Label: 'Receita Anual' } }
          },
          {
            LogicalName: 'createdon',
            SchemaName: 'CreatedOn',
            AttributeType: 'DateTime',
            DisplayName: { UserLocalizedLabel: { Label: 'Data de Criação' } }
          }
        ],
        SimulatedResponse: true
      };
    } else if (entityLogicalName === 'contact') {
      return {
        LogicalName: 'contact',
        SchemaName: 'Contact',
        DisplayName: {
          UserLocalizedLabel: {
            Label: 'Contato'
          }
        },
        Attributes: [
          {
            LogicalName: 'contactid',
            SchemaName: 'ContactId',
            AttributeType: 'Uniqueidentifier',
            DisplayName: { UserLocalizedLabel: { Label: 'ID do Contato' } },
            IsPrimaryId: true
          },
          {
            LogicalName: 'firstname',
            SchemaName: 'FirstName',
            AttributeType: 'String',
            DisplayName: { UserLocalizedLabel: { Label: 'Nome' } },
            MaxLength: 50
          },
          {
            LogicalName: 'lastname',
            SchemaName: 'LastName',
            AttributeType: 'String',
            DisplayName: { UserLocalizedLabel: { Label: 'Sobrenome' } },
            MaxLength: 50,
            RequiredLevel: { Value: 'Required' }
          },
          {
            LogicalName: 'emailaddress1',
            SchemaName: 'EmailAddress1',
            AttributeType: 'String',
            DisplayName: { UserLocalizedLabel: { Label: 'E-mail' } },
            Format: 'Email'
          },
          {
            LogicalName: 'gendercode',
            SchemaName: 'GenderCode',
            AttributeType: 'Picklist',
            DisplayName: { UserLocalizedLabel: { Label: 'Gênero' } },
            OptionSet: {
              Options: [
                { Value: 1, Label: { UserLocalizedLabel: { Label: 'Masculino' } } },
                { Value: 2, Label: { UserLocalizedLabel: { Label: 'Feminino' } } },
                { Value: 3, Label: { UserLocalizedLabel: { Label: 'Não Especificado' } } }
              ]
            }
          }
        ],
        SimulatedResponse: true
      };
    } else if (entityLogicalName === 'incident') {
      return {
        LogicalName: 'incident',
        SchemaName: 'Incident',
        DisplayName: {
          UserLocalizedLabel: {
            Label: 'Caso'
          }
        },
        Attributes: [
          {
            LogicalName: 'incidentid',
            SchemaName: 'IncidentId',
            AttributeType: 'Uniqueidentifier',
            DisplayName: { UserLocalizedLabel: { Label: 'ID do Caso' } },
            IsPrimaryId: true
          },
          {
            LogicalName: 'title',
            SchemaName: 'Title',
            AttributeType: 'String',
            DisplayName: { UserLocalizedLabel: { Label: 'Título' } },
            MaxLength: 200,
            RequiredLevel: { Value: 'Required' }
          },
          {
            LogicalName: 'description',
            SchemaName: 'Description',
            AttributeType: 'Memo',
            DisplayName: { UserLocalizedLabel: { Label: 'Descrição' } },
            MaxLength: 2000
          },
          {
            LogicalName: 'statuscode',
            SchemaName: 'StatusCode',
            AttributeType: 'Status',
            DisplayName: { UserLocalizedLabel: { Label: 'Status' } },
            OptionSet: {
              Options: [
                { Value: 1, Label: { UserLocalizedLabel: { Label: 'Ativo' } } },
                { Value: 2, Label: { UserLocalizedLabel: { Label: 'Em Andamento' } } },
                { Value: 3, Label: { UserLocalizedLabel: { Label: 'Resolvido' } } },
                { Value: 4, Label: { UserLocalizedLabel: { Label: 'Cancelado' } } }
              ]
            }
          },
          {
            LogicalName: 'prioritycode',
            SchemaName: 'PriorityCode',
            AttributeType: 'Picklist',
            DisplayName: { UserLocalizedLabel: { Label: 'Prioridade' } },
            OptionSet: {
              Options: [
                { Value: 1, Label: { UserLocalizedLabel: { Label: 'Alta' } } },
                { Value: 2, Label: { UserLocalizedLabel: { Label: 'Normal' } } },
                { Value: 3, Label: { UserLocalizedLabel: { Label: 'Baixa' } } }
              ]
            }
          },
          {
            LogicalName: 'customerid',
            SchemaName: 'CustomerId',
            AttributeType: 'Lookup',
            DisplayName: { UserLocalizedLabel: { Label: 'Cliente' } },
            Targets: ['account', 'contact']
          }
        ],
        SimulatedResponse: true
      };
    } else {
      // Retornar uma estrutura genérica para entidades não simuladas especificamente
      return {
        LogicalName: entityLogicalName,
        SchemaName: entityLogicalName.charAt(0).toUpperCase() + entityLogicalName.slice(1),
        DisplayName: {
          UserLocalizedLabel: {
            Label: entityLogicalName.charAt(0).toUpperCase() + entityLogicalName.slice(1)
          }
        },
        Attributes: [
          {
            LogicalName: `${entityLogicalName}id`,
            SchemaName: `${entityLogicalName.charAt(0).toUpperCase() + entityLogicalName.slice(1)}Id`,
            AttributeType: 'Uniqueidentifier',
            DisplayName: { UserLocalizedLabel: { Label: 'ID' } },
            IsPrimaryId: true
          },
          {
            LogicalName: 'name',
            SchemaName: 'Name',
            AttributeType: 'String',
            DisplayName: { UserLocalizedLabel: { Label: 'Nome' } },
            MaxLength: 100
          },
          {
            LogicalName: 'createdon',
            SchemaName: 'CreatedOn',
            AttributeType: 'DateTime',
            DisplayName: { UserLocalizedLabel: { Label: 'Data de Criação' } }
          }
        ],
        SimulatedResponse: true
      };
    }
  }

  /**
   * Cria um novo contato no Dynamics 365
   * @param data Dados do contato a ser criado
   * @returns Dados do contato criado
   */
  public async createContact(data: Record<string, any>): Promise<any> {
    logger.debug(`[DynamicsService] Criando novo contato`);
    
    try {
      return await this.createEntity('contacts', data);
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao criar contato:`, error);
      throw error;
    }
  }

  /**
   * Atualiza um contato existente no Dynamics 365
   * @param contactId ID do contato a ser atualizado
   * @param data Dados do contato a serem atualizados
   */
  public async updateContact(contactId: string, data: Record<string, any>): Promise<void> {
    logger.debug(`[DynamicsService] Atualizando contato ${contactId}`);
    
    try {
      await this.updateEntity('contacts', contactId, data);
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao atualizar contato:`, error);
      throw error;
    }
  }

  /**
   * Busca contatos com filtros avançados
   * @param filters Filtros para a busca (ex: nome, email, telefone)
   * @param options Opções adicionais (ordenação, limite, etc)
   * @returns Lista de contatos encontrados
   */
  public async searchContacts(
    filters: Record<string, any>,
    options: { orderBy?: string, top?: number, expand?: string[] } = {}
  ): Promise<any[]> {
    logger.debug(`[DynamicsService] Buscando contatos com filtros`);
    
    try {
      // Construir a string de filtro OData
      const filterParts: string[] = [];
      
      for (const [key, value] of Object.entries(filters)) {
        if (typeof value === 'string') {
          // Para strings, usar contains para busca parcial
          filterParts.push(`contains(${key},'${value}')`);
        } else {
          // Para outros tipos, usar igualdade exata
          filterParts.push(`${key} eq ${value}`);
        }
      }
      
      const filterString = filterParts.join(' and ');
      
      return await this.queryEntities('contacts', {
        filter: filterString,
        orderBy: options.orderBy,
        top: options.top,
        expand: options.expand
      });
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao buscar contatos:`, error);
      throw error;
    }
  }

  /**
   * Cria uma nova conta no Dynamics 365
   * @param data Dados da conta a ser criada
   * @returns Dados da conta criada
   */
  public async createAccount(data: Record<string, any>): Promise<any> {
    logger.debug(`[DynamicsService] Criando nova conta`);
    
    try {
      return await this.createEntity('accounts', data);
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao criar conta:`, error);
      throw error;
    }
  }

  /**
   * Atualiza uma conta existente no Dynamics 365
   * @param accountId ID da conta a ser atualizada
   * @param data Dados da conta a serem atualizados
   */
  public async updateAccount(accountId: string, data: Record<string, any>): Promise<void> {
    logger.debug(`[DynamicsService] Atualizando conta ${accountId}`);
    
    try {
      await this.updateEntity('accounts', accountId, data);
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao atualizar conta:`, error);
      throw error;
    }
  }

  /**
   * Obtém a hierarquia de uma conta (contas pai e filhas)
   * @param accountId ID da conta para obter a hierarquia
   * @returns Estrutura hierárquica da conta
   */
  public async getAccountHierarchy(accountId: string): Promise<any> {
    logger.debug(`[DynamicsService] Obtendo hierarquia da conta ${accountId}`);
    
    try {
      // Verificar se estamos em modo simulado
      if (!this.clientId || !this.clientSecret || !this.tenantId) {
        return {
          account: {
            id: accountId,
            name: `Conta ${accountId}`,
            createdOn: new Date().toISOString()
          },
          parentAccount: {
            id: `parent-${accountId}`,
            name: `Conta Pai de ${accountId}`,
            createdOn: new Date(Date.now() - 86400000).toISOString()
          },
          childAccounts: [
            {
              id: `child1-${accountId}`,
              name: `Subsidiária 1 de ${accountId}`,
              createdOn: new Date(Date.now() - 43200000).toISOString()
            },
            {
              id: `child2-${accountId}`,
              name: `Subsidiária 2 de ${accountId}`,
              createdOn: new Date(Date.now() - 21600000).toISOString()
            }
          ],
          SimulatedResponse: true
        };
      }
      
      const client = await this.getClient();
      
      // Obter a conta principal
      const accountResponse = await client.get(`accounts(${accountId})`);
      const account = accountResponse.data;
      
      // Obter a conta pai, se existir
      let parentAccount = null;
      if (account._parentaccountid_value) {
        const parentResponse = await client.get(`accounts(${account._parentaccountid_value})`);
        parentAccount = parentResponse.data;
      }
      
      // Obter as contas filhas
      const childrenResponse = await client.get('accounts', {
        params: {
          $filter: `_parentaccountid_value eq ${accountId}`,
          $select: 'accountid,name,createdon'
        }
      });
      
      return {
        account,
        parentAccount,
        childAccounts: childrenResponse.data.value
      };
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao obter hierarquia da conta:`, error);
      throw error;
    }
  }

  /**
   * Atribui um caso a um usuário ou equipe específica
   * @param caseId ID do caso a ser atribuído
   * @param assigneeId ID do usuário ou equipe para atribuição
   * @param assigneeType Tipo do destinatário ('systemuser' ou 'team')
   * @returns Resultado da operação de atribuição
   */
  public async assignCase(
    caseId: string,
    assigneeId: string,
    assigneeType: 'systemuser' | 'team' = 'systemuser'
  ): Promise<any> {
    logger.debug(`[DynamicsService] Atribuindo caso ${caseId} para ${assigneeType} ${assigneeId}`);
    
    try {
      // Verificar se estamos em modo simulado
      if (!this.clientId || !this.clientSecret || !this.tenantId) {
        return {
          success: true,
          caseId,
          assigneeId,
          assigneeType,
          message: `Caso atribuído com sucesso para ${assigneeType} ${assigneeId} (simulado)`,
          timestamp: new Date().toISOString(),
          SimulatedResponse: true
        };
      }
      
      const client = await this.getClient();
      
      // Executar a ação de atribuição usando a API do Dynamics
      const response = await client.post('AssignRequest', {
        Target: {
          entityType: 'incident',
          id: caseId
        },
        Assignee: {
          entityType: assigneeType,
          id: assigneeId
        }
      });
      
      return {
        success: true,
        caseId,
        assigneeId,
        assigneeType,
        message: 'Caso atribuído com sucesso',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao atribuir caso:`, error);
      throw error;
    }
  }

  /**
   * Escala um caso, alterando sua prioridade e possivelmente atribuindo a outro usuário
   * @param caseId ID do caso a ser escalado
   * @param newPriority Nova prioridade do caso
   * @param escalationNotes Notas sobre a escalação
   * @param assigneeId ID do novo responsável (opcional)
   * @returns Resultado da operação de escalação
   */
  public async escalateCase(
    caseId: string,
    newPriority: number,
    escalationNotes: string,
    assigneeId?: string
  ): Promise<any> {
    logger.debug(`[DynamicsService] Escalando caso ${caseId} para prioridade ${newPriority}`);
    
    try {
      // Verificar se estamos em modo simulado
      if (!this.clientId || !this.clientSecret || !this.tenantId) {
        return {
          success: true,
          caseId,
          newPriority,
          escalationNotes,
          assigneeId,
          message: `Caso escalado com sucesso para prioridade ${newPriority} (simulado)`,
          timestamp: new Date().toISOString(),
          SimulatedResponse: true
        };
      }
      
      // Atualizar a prioridade do caso
      await this.updateEntity('incidents', caseId, {
        prioritycode: newPriority
      });
      
      // Adicionar nota sobre a escalação
      await this.createEntity('annotations', {
        objectid_entityname: 'incident',
        'objectid_incident@odata.bind': `/incidents(${caseId})`,
        subject: 'Escalação de Caso',
        notetext: escalationNotes
      });
      
      // Atribuir a um novo responsável, se especificado
      if (assigneeId) {
        await this.assignCase(caseId, assigneeId);
      }
      
      return {
        success: true,
        caseId,
        newPriority,
        escalationNotes,
        assigneeId,
        message: 'Caso escalado com sucesso',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao escalar caso:`, error);
      throw error;
    }
  }

  /**
   * Atualiza múltiplos casos de uma vez
   * @param caseIds IDs dos casos a serem atualizados
   * @param updateData Dados a serem atualizados em todos os casos
   * @returns Resultado da operação de atualização em massa
   */
  public async bulkUpdateCases(
    caseIds: string[],
    updateData: Record<string, any>
  ): Promise<any> {
    logger.debug(`[DynamicsService] Atualizando em massa ${caseIds.length} casos`);
    
    try {
      // Verificar se estamos em modo simulado
      if (!this.clientId || !this.clientSecret || !this.tenantId) {
        return {
          success: true,
          totalCases: caseIds.length,
          updatedCases: caseIds.length,
          failedCases: 0,
          message: `${caseIds.length} casos atualizados com sucesso (simulado)`,
          timestamp: new Date().toISOString(),
          SimulatedResponse: true
        };
      }
      
      const client = await this.getClient();
      const results: { success: string[], failed: Array<{id: string, error: string}> } = { success: [], failed: [] };
      
      // Atualizar cada caso individualmente
      for (const caseId of caseIds) {
        try {
          await client.patch(`incidents(${caseId})`, updateData);
          results.success.push(caseId);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.failed.push({ id: caseId, error: errorMessage });
          logger.error(`[DynamicsService] Erro ao atualizar caso ${caseId}:`, error);
        }
      }
      
      return {
        success: true,
        totalCases: caseIds.length,
        updatedCases: results.success.length,
        failedCases: results.failed.length,
        failedDetails: results.failed,
        message: `${results.success.length} de ${caseIds.length} casos atualizados com sucesso`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao atualizar casos em massa:`, error);
      throw error;
    }
  }

  /**
   * Recupera a linha do tempo e atividades de um caso
   * @param caseId ID do caso para obter atividades
   * @param activityTypes Tipos de atividades a serem incluídos
   * @param options Opções adicionais (ordenação, limite, etc)
   * @returns Lista de atividades do caso
   */
  public async getCaseActivities(
    caseId: string,
    activityTypes: string[] = ['phonecall', 'email', 'task', 'annotation'],
    options: { orderBy?: string, top?: number } = {}
  ): Promise<any> {
    logger.debug(`[DynamicsService] Obtendo atividades do caso ${caseId}`);
    
    try {
      // Verificar se estamos em modo simulado
      if (!this.clientId || !this.clientSecret || !this.tenantId) {
        return {
          caseId,
          activities: [
            {
              id: `note-${Date.now()}-1`,
              type: 'annotation',
              subject: 'Nota inicial',
              description: 'Cliente relatou problema pela primeira vez',
              createdOn: new Date(Date.now() - 86400000).toISOString(),
              createdBy: 'Agente de Suporte'
            },
            {
              id: `call-${Date.now()}-1`,
              type: 'phonecall',
              subject: 'Ligação de acompanhamento',
              description: 'Ligação para verificar status do problema',
              createdOn: new Date(Date.now() - 43200000).toISOString(),
              createdBy: 'Agente de Suporte',
              direction: 'Outbound',
              duration: 15
            },
            {
              id: `email-${Date.now()}-1`,
              type: 'email',
              subject: 'Informações adicionais solicitadas',
              description: 'Email solicitando mais detalhes sobre o problema',
              createdOn: new Date(Date.now() - 21600000).toISOString(),
              createdBy: 'Agente de Suporte',
              direction: 'Outbound'
            },
            {
              id: `task-${Date.now()}-1`,
              type: 'task',
              subject: 'Verificar com equipe técnica',
              description: 'Tarefa para consultar equipe técnica sobre solução',
              createdOn: new Date(Date.now() - 10800000).toISOString(),
              createdBy: 'Agente de Suporte',
              status: 'Completed'
            }
          ],
          timestamp: new Date().toISOString(),
          SimulatedResponse: true
        };
      }
      
      const client = await this.getClient();
      const activities = [];
      
      // Para cada tipo de atividade, buscar registros relacionados ao caso
      for (const activityType of activityTypes) {
        const response = await client.get(`${activityType}s`, {
          params: {
            $filter: `_regardingobjectid_value eq ${caseId}`,
            $orderby: options.orderBy,
            $top: options.top
          }
        });
        
        // Adicionar o tipo à resposta para facilitar o processamento
        const typedActivities = response.data.value.map((activity: any) => ({
          ...activity,
          type: activityType
        }));
        
        activities.push(...typedActivities);
      }
      
      // Ordenar todas as atividades por data de criação
      activities.sort((a, b) => {
        const dateA = new Date(a.createdon).getTime();
        const dateB = new Date(b.createdon).getTime();
        return dateB - dateA; // Ordem decrescente (mais recente primeiro)
      });
      
      // Limitar o número total de atividades se necessário
      const limitedActivities = options.top ? activities.slice(0, options.top) : activities;
      
      return {
        caseId,
        activities: limitedActivities,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao obter atividades do caso:`, error);
      throw error;
    }
  }

  /**
   * Executa um workflow no Dynamics 365
   * @param workflowId ID do workflow a ser executado
   * @param entityName Nome da entidade associada ao workflow
   * @param entityId ID do registro da entidade
   * @returns Resultado da execução do workflow
   */
  public async triggerWorkflow(
    workflowId: string,
    entityName: string,
    entityId: string
  ): Promise<any> {
    logger.debug(`[DynamicsService] Executando workflow ${workflowId} para ${entityName}(${entityId})`);
    
    try {
      // Verificar se estamos em modo simulado
      if (!this.clientId || !this.clientSecret || !this.tenantId) {
        return {
          success: true,
          workflowId,
          entityName,
          entityId,
          instanceId: `wf-instance-${Date.now()}`,
          status: "Started",
          message: `Workflow iniciado com sucesso (simulado)`,
          timestamp: new Date().toISOString(),
          SimulatedResponse: true
        };
      }
      
      const client = await this.getClient();
      
      // Executar o workflow usando a ação ExecuteWorkflow
      const response = await client.post('ExecuteWorkflow', {
        EntityId: entityId,
        WorkflowId: workflowId
      });
      
      return {
        success: true,
        workflowId,
        entityName,
        entityId,
        instanceId: response.data.InstanceId || `wf-instance-${Date.now()}`,
        status: "Started",
        message: 'Workflow iniciado com sucesso',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao executar workflow:`, error);
      throw error;
    }
  }

  /**
   * Exclui uma entidade na API do Dynamics 365
   * @param entityName Nome da entidade a ser excluída
   * @param entityId ID da entidade a ser excluída
   * @returns Promessa vazia após a exclusão
   */
  public async deleteEntity(
    entityName: string, 
    entityId: string
  ): Promise<void> {
    logger.debug(`[DynamicsService] Excluindo ${entityName} com ID ${entityId}`);
    
    try {
      // Verificar se estamos em modo simulado
      if (!this.clientId || !this.clientSecret || !this.tenantId) {
        logger.info(`[DynamicsService] Simulando exclusão de ${entityName} com ID ${entityId}`);
        return;
      }
      
      const client = await this.getClient();
      
      // Executar a exclusão
      await client.delete(`${entityName}(${entityId})`);
      
      logger.info(`[DynamicsService] ${entityName} com ID ${entityId} excluído com sucesso`);
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao excluir ${entityName} com ID ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Verifica o status de um workflow no Dynamics 365
   * @param workflowInstanceId ID da instância do workflow
   * @returns Status atual do workflow
   */
  public async getWorkflowStatus(workflowInstanceId: string): Promise<any> {
    logger.debug(`[DynamicsService] Verificando status do workflow ${workflowInstanceId}`);
    
    try {
      // Verificar se estamos em modo simulado
      if (!this.clientId || !this.clientSecret || !this.tenantId) {
        // Gerar um status aleatório para simulação
        const statuses = ["Succeeded", "Running", "Succeeded", "Succeeded", "Failed"];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        
        return {
          instanceId: workflowInstanceId,
          status: randomStatus,
          startTime: new Date(Date.now() - 3600000).toISOString(),
          endTime: randomStatus !== "Running" ? new Date().toISOString() : null,
          message: randomStatus === "Failed" ? "Falha na execução do workflow" : 
                  randomStatus === "Running" ? "Workflow em execução" : 
                  "Workflow concluído com sucesso",
          SimulatedResponse: true
        };
      }
      
      const client = await this.getClient();
      
      // Consultar o status do workflow usando a entidade asyncoperation
      const response = await client.get('asyncoperations', {
        params: {
          $filter: `asyncoperationid eq ${workflowInstanceId}`,
          $select: 'asyncoperationid,statuscode,startedon,completedon,message'
        }
      });
      
      if (response.data.value.length === 0) {
        throw new Error(`Instância de workflow ${workflowInstanceId} não encontrada`);
      }
      
      const workflowData = response.data.value[0];
      
      // Mapear os códigos de status para valores legíveis
      const statusMap: Record<number, string> = {
        0: "NotStarted",
        10: "InProgress",
        20: "Paused",
        21: "Canceling",
        22: "Canceled",
        30: "Succeeded",
        31: "Failed",
        32: "Suspended"
      };
      
      return {
        instanceId: workflowData.asyncoperationid,
        status: statusMap[workflowData.statuscode] || `Unknown (${workflowData.statuscode})`,
        startTime: workflowData.startedon,
        endTime: workflowData.completedon || null,
        message: workflowData.message || ""
      };
    } catch (error) {
      logger.error(`[DynamicsService] Erro ao verificar status do workflow:`, error);
      throw error;
    }
  }
}

// Exportar uma instância única do serviço
export const dynamicsService = new DynamicsService();
