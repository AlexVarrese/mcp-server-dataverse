// src/services/metadataExplorerService.ts
import { dynamicsService } from './dynamicsService.js';
import logger from '../logger.js';

interface MetadataRelationship {
  name: string;
  type: string;
  referencedEntity: string;
  navigationProperty: string;
  lookupField?: string;
}

interface MetadataAttribute {
  name: string;
  displayName: string;
  type: string;
  description?: string;
  required: boolean;
  isPrimaryId: boolean;
  isPrimaryName: boolean;
  maxLength?: number;
  precision?: number;
  minValue?: number;
  maxValue?: number;
  optionSet?: {
    name: string;
    options: { value: number; label: string }[];
  };
}

interface MetadataEntity {
  name: string;
  displayName: string;
  displayCollectionName: string;
  description?: string;
  primaryIdField: string;
  primaryNameField?: string;
  isCustomEntity: boolean;
  attributes: MetadataAttribute[];
  relationships: MetadataRelationship[];
}

interface MetadataCache {
  entities: { [key: string]: MetadataEntity };
  lastUpdated: Date;
}

class MetadataExplorerService {
  private cache: MetadataCache = {
    entities: {},
    lastUpdated: new Date(0) // Data antiga para forçar atualização inicial
  };
  
  private cacheExpirationMs = 3600000; // 1 hora
  
  /**
   * Lista todas as entidades disponíveis no Dynamics 365
   */
  async listEntities(refresh = false): Promise<{ name: string; displayName: string; displayCollectionName: string }[]> {
    try {
      // Verificar se precisamos atualizar o cache
      if (refresh || this.isCacheExpired()) {
        await this.refreshEntityCache();
      }
      
      return Object.values(this.cache.entities).map(entity => ({
        name: entity.name,
        displayName: entity.displayName,
        displayCollectionName: entity.displayCollectionName
      }));
    } catch (error: any) {
      logger.error('Erro ao listar entidades:', error);
      throw new Error(`Falha ao listar entidades: ${error.message}`);
    }
  }
  
  /**
   * Obtém detalhes completos de uma entidade específica
   */
  async getEntityDetails(
    entityName: string, 
    options: {
      includeAttributes?: boolean;
      includeOptionSets?: boolean;
      includeAttributeTypes?: boolean;
      selectEntityProperties?: string[];
      selectAttributeProperties?: string[];
      refresh?: boolean;
    } = {}
  ): Promise<MetadataEntity> {
    try {
      const normalizedEntityName = this.normalizeEntityName(entityName);
      
      // Verificar se precisamos atualizar o cache para esta entidade
      // Pass options (including refresh) to loadEntityDetails
      if (options.refresh || this.isCacheExpired() || !this.cache.entities[normalizedEntityName] || 
          (options.includeAttributes && !this.cache.entities[normalizedEntityName]?.attributes?.length) || // Force refresh if attributes are requested but not cached
          (options.includeOptionSets && !this.cache.entities[normalizedEntityName]?.attributes?.some(a => a.optionSet)) // Force refresh if option sets requested but not cached
      ) {
        await this.loadEntityDetails(normalizedEntityName, options);
      }
      
      const entity = this.cache.entities[normalizedEntityName];
      if (!entity) {
        throw new Error(`Entidade '${entityName}' (normalizada: ${normalizedEntityName}) não encontrada no cache após tentativa de carregamento.`);
      }
      
      // Potentially filter attributes based on selectAttributeProperties if needed here,
      // or ensure loadEntityDetails already respects this.
      // For now, assume loadEntityDetails fetches according to options.
      return entity;
    } catch (error: any) {
      logger.error(`Erro ao obter detalhes da entidade ${entityName}:`, error);
      throw new Error(`Falha ao obter detalhes da entidade ${entityName}: ${error.message}`);
    }
  }
  
  /**
   * Busca atributos de uma entidade específica
   */
  async getEntityAttributes(entityName: string, refresh = false): Promise<MetadataAttribute[]> {
    const entity = await this.getEntityDetails(entityName, { refresh: refresh });
    return entity.attributes;
  }
  
  /**
   * Busca relacionamentos de uma entidade específica
   */
  async getEntityRelationships(entityName: string, refresh = false): Promise<MetadataRelationship[]> {
    const entity = await this.getEntityDetails(entityName, { refresh: refresh });
    return entity.relationships;
  }
  
  /**
   * Busca detalhes de um atributo específico
   */
  async getAttributeDetails(
    entityLogicalName: string, 
    attributeLogicalName: string, 
    options: {
      includeOptionSets?: boolean;
      selectAttributeProperties?: string[];
      refresh?: boolean; // To potentially bypass or refresh cache
    } = {}
  ): Promise<MetadataAttribute> {
    try {
      logger.debug(`[MetadataExplorerService] Obtendo detalhes para atributo: ${entityLogicalName}.${attributeLogicalName} com opções: ${JSON.stringify(options)}`);

      // O parâmetro refresh aqui pode ser usado para invalidar um cache futuro no dynamicsService se implementado,
      // ou simplesmente passado adiante.
      const attrMetadata = await dynamicsService.getAttributeMetadata(entityLogicalName, attributeLogicalName, {
        includeOptionSets: options.includeOptionSets,
        selectAttributeProperties: options.selectAttributeProperties,
      });

      if (!attrMetadata) {
        throw new Error(`Atributo '${attributeLogicalName}' não encontrado na entidade '${entityLogicalName}' via dynamicsService.`);
      }

      // Mapear a resposta do dynamicsService para a interface MetadataAttribute
      const attribute: MetadataAttribute = {
        name: attrMetadata.LogicalName,
        displayName: attrMetadata.DisplayName?.UserLocalizedLabel?.Label || attrMetadata.SchemaName || attrMetadata.LogicalName,
        type: attrMetadata.AttributeType,
        description: attrMetadata.Description?.UserLocalizedLabel?.Label,
        required: attrMetadata.RequiredLevel?.Value === 'ApplicationRequired' || attrMetadata.RequiredLevel?.Value === 'SystemRequired',
        isPrimaryId: attrMetadata.IsPrimaryId,
        isPrimaryName: attrMetadata.IsPrimaryName,
        maxLength: attrMetadata.MaxLength,
        minValue: attrMetadata.MinValue,
        maxValue: attrMetadata.MaxValue,
        precision: attrMetadata.Precision,
        // format: attrMetadata.Format, // Se aplicável e selecionado
        // targets: attrMetadata.Targets, // Para Lookups, se aplicável e selecionado
      };

      if (options.includeOptionSets && attrMetadata.OptionSet && (attrMetadata.AttributeType === 'Picklist' || attrMetadata.AttributeType === 'Status' || attrMetadata.AttributeType === 'State' || attrMetadata.AttributeType === 'Boolean')) {
        attribute.optionSet = {
          name: attrMetadata.OptionSet.Name,
          options: attrMetadata.OptionSet.Options?.map((opt: any) => ({
            value: opt.Value,
            label: opt.Label?.UserLocalizedLabel?.Label || `Opção ${opt.Value}`
          })) || []
        };
      }
      
      return attribute;
    } catch (error: any) {
      logger.error(`Erro ao obter detalhes do atributo ${entityLogicalName}.${attributeLogicalName}:`, error);
      throw new Error(`Falha ao obter detalhes do atributo ${entityLogicalName}.${attributeLogicalName}: ${error.message}`);
    }
  }
  
  /**
   * Busca entidades por texto de pesquisa (nome ou nome de exibição)
   */
  async searchEntities(searchText: string): Promise<{ name: string; displayName: string; displayCollectionName: string }[]> {
    const entities = await this.listEntities();
    const lowerSearchText = searchText.toLowerCase();
    
    return entities.filter(entity => 
      entity.name.toLowerCase().includes(lowerSearchText) || 
      entity.displayName.toLowerCase().includes(lowerSearchText) ||
      entity.displayCollectionName.toLowerCase().includes(lowerSearchText)
    );
  }
  
  /**
   * Busca atributos por texto de pesquisa (nome ou nome de exibição)
   */
  async searchAttributes(entityName: string, searchText: string): Promise<MetadataAttribute[]> {
    const attributes = await this.getEntityAttributes(entityName);
    const lowerSearchText = searchText.toLowerCase();
    
    return attributes.filter(attr => 
      attr.name.toLowerCase().includes(lowerSearchText) || 
      attr.displayName.toLowerCase().includes(lowerSearchText) ||
      (attr.description && attr.description.toLowerCase().includes(lowerSearchText))
    );
  }
  
  /**
   * Gera um resumo da estrutura de dados do Dynamics 365
   */
  async generateDataModel(entityNames?: string[]): Promise<any> {
    try {
      let entities: MetadataEntity[] = [];
      
      if (entityNames && entityNames.length > 0) {
        // Carregar apenas as entidades especificadas
        entities = await Promise.all(
          entityNames.map(name => this.getEntityDetails(name))
        );
      } else {
        // Listar todas as entidades e obter detalhes das primeiras N
        const allEntities = await this.listEntities();
        const mainEntities = allEntities.slice(0, 20); // Limitar para não sobrecarregar
        
        entities = await Promise.all(
          mainEntities.map(entity => this.getEntityDetails(entity.name))
        );
      }
      
      // Construir modelo de dados com entidades e relacionamentos
      const dataModel = {
        entities: entities.map(entity => ({
          name: entity.name,
          displayName: entity.displayName,
          primaryIdField: entity.primaryIdField,
          primaryNameField: entity.primaryNameField,
          keyAttributes: entity.attributes
            .filter(attr => attr.isPrimaryId || attr.isPrimaryName || attr.required)
            .map(attr => ({
              name: attr.name,
              displayName: attr.displayName,
              type: attr.type,
              isPrimaryId: attr.isPrimaryId,
              isPrimaryName: attr.isPrimaryName
            })),
          relationships: entity.relationships.map(rel => ({
            name: rel.name,
            type: rel.type,
            referencedEntity: rel.referencedEntity,
            navigationProperty: rel.navigationProperty
          }))
        }))
      };
      
      return dataModel;
    } catch (error: any) {
      logger.error('Erro ao gerar modelo de dados:', error);
      throw new Error(`Falha ao gerar modelo de dados: ${error.message}`);
    }
  }
  
  /**
   * Verifica se o cache está expirado
   */
  private isCacheExpired(): boolean {
    const now = new Date();
    const timeDiff = now.getTime() - this.cache.lastUpdated.getTime();
    return timeDiff > this.cacheExpirationMs;
  }
  
  /**
   * Atualiza o cache de entidades
   */
  private async refreshEntityCache(): Promise<void> {
    try {
      // Consultar EntityDefinitions para obter a lista de entidades
      const result = await dynamicsService.queryEntities('EntityDefinitions', {
        select: [
          'LogicalName', 
          'DisplayName', 
          'DisplayCollectionName', 
          'Description', 
          'PrimaryIdAttribute', 
          'PrimaryNameAttribute', 
          'IsCustomEntity'
        ],
        top: 500
      });
      
      // Limpar o cache atual
      this.cache.entities = {};
      
      // Preencher o cache com informações básicas das entidades
      for (const entity of result) {
        this.cache.entities[entity.LogicalName] = {
          name: entity.LogicalName,
          displayName: entity.DisplayName?.UserLocalizedLabel?.Label || entity.LogicalName,
          displayCollectionName: entity.DisplayCollectionName?.UserLocalizedLabel?.Label || entity.LogicalName,
          description: entity.Description?.UserLocalizedLabel?.Label,
          primaryIdField: entity.PrimaryIdAttribute,
          primaryNameField: entity.PrimaryNameAttribute,
          isCustomEntity: entity.IsCustomEntity,
          attributes: [],
          relationships: []
        };
      }
      
      // Atualizar timestamp do cache
      this.cache.lastUpdated = new Date();
    } catch (error: any) {
      logger.error('Erro ao atualizar cache de entidades:', error);
      throw new Error(`Falha ao atualizar cache de entidades: ${error.message}`);
    }
  }
  
  /**
   * Carrega detalhes completos de uma entidade específica
   */
  private async loadEntityDetails(
    entityName: string, 
    options: {
      includeAttributes?: boolean;
      includeOptionSets?: boolean;
      includeAttributeTypes?: boolean; // For clarity, actual types come from AttributeType property
      selectEntityProperties?: string[];
      selectAttributeProperties?: string[];
      refresh?: boolean; // refresh can influence dynamicsService cache, not directly used here other than for triggering
    } = {}
  ): Promise<void> {
    try {
      logger.debug(`[MetadataExplorerService] Carregando detalhes para entidade: ${entityName} com opções: ${JSON.stringify(options)}`);
      // Obter metadados detalhados da entidade usando as opções fornecidas
      const entityMetadata = await dynamicsService.getEntityMetadata(entityName, {
        includeAttributes: options.includeAttributes ?? true, // Default to true if including attributes
        includeOptionSets: options.includeOptionSets,
        includeAttributeTypes: options.includeAttributeTypes, // Passed for consistency
        selectEntityProperties: options.selectEntityProperties,
        selectAttributeProperties: options.selectAttributeProperties,
        // refresh option for dynamicsService cache is handled by its own logic if needed, or not passed if not supported
      });
      
      if (!entityMetadata) {
        throw new Error(`Metadados para '${entityName}' não retornados pelo dynamicsService.`);
      }
      
      this.cache.entities[entityName] = {
        name: entityMetadata.LogicalName,
        displayName: entityMetadata.DisplayName?.UserLocalizedLabel?.Label || entityMetadata.SchemaName || entityMetadata.LogicalName,
        displayCollectionName: entityMetadata.DisplayCollectionName?.UserLocalizedLabel?.Label || entityMetadata.EntitySetName || entityMetadata.LogicalName,
        description: entityMetadata.Description?.UserLocalizedLabel?.Label,
        primaryIdField: entityMetadata.PrimaryIdAttribute,
        primaryNameField: entityMetadata.PrimaryNameAttribute,
        isCustomEntity: entityMetadata.IsCustomEntity === undefined ? false : entityMetadata.IsCustomEntity.Value, // Adjust based on actual API response structure
        attributes: [],
        relationships: []
      };
      
      if (options.includeAttributes && entityMetadata.Attributes) {
        this.cache.entities[entityName].attributes = entityMetadata.Attributes.map((attr: any) => {
          const attribute: MetadataAttribute = {
            name: attr.LogicalName,
            displayName: attr.DisplayName?.UserLocalizedLabel?.Label || attr.SchemaName || attr.LogicalName,
            type: attr.AttributeType,
            description: attr.Description?.UserLocalizedLabel?.Label,
            required: attr.RequiredLevel?.Value === 'ApplicationRequired' || attr.RequiredLevel?.Value === 'SystemRequired',
            isPrimaryId: attr.IsPrimaryId,
            isPrimaryName: attr.IsPrimaryName,
            // Common properties
            maxLength: attr.MaxLength,
            minValue: attr.MinValue,
            maxValue: attr.MaxValue,
            precision: attr.Precision,
            // format: attr.Format, // If Format is part of selectAttributeProperties
            // targets: attr.Targets, // For Lookups
          };
          
          if (options.includeOptionSets && attr.OptionSet && (attr.AttributeType === 'Picklist' || attr.AttributeType === 'Status' || attr.AttributeType === 'State' || attr.AttributeType === 'Boolean')) {
            attribute.optionSet = {
              name: attr.OptionSet.Name,
              options: attr.OptionSet.Options?.map((opt: any) => ({
                value: opt.Value,
                label: opt.Label?.UserLocalizedLabel?.Label || `Opção ${opt.Value}`
              })) || []
            };
          }
          return attribute;
        });
      }
      
      // Processar relacionamentos (simplificado, pode precisar de mais detalhes/opções)
      // This part might also need to respect selectProperties if we add that for relationships
      const mapRelationship = (rel: any, type: string) => ({
        name: rel.SchemaName,
        type: type,
        referencedEntity: type === 'ManyToOne' ? rel.ReferencedEntity : (type === 'OneToMany' ? rel.ReferencingEntity : rel.Entity2LogicalName),
        navigationProperty: type === 'ManyToOne' ? rel.ReferencingEntityNavigationPropertyName : (type === 'OneToMany' ? rel.ReferencedEntityNavigationPropertyName : rel.Entity1NavigationPropertyName),
        lookupField: type === 'ManyToOne' ? rel.ReferencingAttribute : undefined
      });

      if (entityMetadata.ManyToOneRelationships) {
        this.cache.entities[entityName].relationships.push(...entityMetadata.ManyToOneRelationships.map((rel:any) => mapRelationship(rel, 'ManyToOne')));
      }
      if (entityMetadata.OneToManyRelationships) {
        this.cache.entities[entityName].relationships.push(...entityMetadata.OneToManyRelationships.map((rel:any) => mapRelationship(rel, 'OneToMany')));
      }
      if (entityMetadata.ManyToManyRelationships) {
        this.cache.entities[entityName].relationships.push(...entityMetadata.ManyToManyRelationships.map((rel:any) => mapRelationship(rel, 'ManyToMany')));
      }

      this.cache.lastUpdated = new Date(); // Update cache timestamp

    } catch (error: any) {
      logger.error(`Erro ao carregar detalhes da entidade ${entityName} no MetadataExplorerService:`, error);
      // Não limpar o cache aqui, pode ser um erro transitório e o cache antigo ainda é útil.
      throw new Error(`Falha ao carregar detalhes da entidade ${entityName}: ${error.message}`);
    }
  }
  
  /**
   * Normaliza o nome da entidade (singular/plural)
   */
  private normalizeEntityName(entityName: string): string {
    // Remover 's' final se presente (para converter plural para singular)
    const singularName = entityName.endsWith('s') ? entityName.slice(0, -1) : entityName;
    
    // Mapeamento de nomes comuns
    const commonMappings: { [key: string]: string } = {
      'account': 'account',
      'accounts': 'account',
      'contact': 'contact',
      'contacts': 'contact',
      'opportunity': 'opportunity',
      'opportunities': 'opportunity',
      'lead': 'lead',
      'leads': 'lead',
      'case': 'incident',
      'cases': 'incident',
      'incident': 'incident',
      'incidents': 'incident',
      'activity': 'activity',
      'activities': 'activity'
    };
    
    // Verificar se temos um mapeamento direto
    if (commonMappings[entityName.toLowerCase()]) {
      return commonMappings[entityName.toLowerCase()];
    }
    
    // Tentar o nome original ou o singular
    return entityName.toLowerCase();
  }
}

export const metadataExplorerService = new MetadataExplorerService();
