// src/logger.ts
/**
 * Utilitário de logging para o MCP Server do Dynamics 365
 * Evita que as mensagens de log interfiram na comunicação JSON do MCP
 */

// Níveis de log
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// Configuração do logger
const config = {
  level: LogLevel.INFO, // Nível mínimo de log a ser exibido
  useConsole: true,     // Se deve usar console.log
  prefix: '[D365-MCP]', // Prefixo para as mensagens de log
};

// Função para configurar o logger
export function configureLogger(options: {
  level?: LogLevel,
  useConsole?: boolean,
  prefix?: string
}) {
  if (options.level !== undefined) config.level = options.level;
  if (options.useConsole !== undefined) config.useConsole = options.useConsole;
  if (options.prefix !== undefined) config.prefix = options.prefix;
}

// Funções de log
export function debug(message: string, ...args: any[]) {
  if (config.level <= LogLevel.DEBUG) {
    log('DEBUG', message, args);
  }
}

export function info(message: string, ...args: any[]) {
  if (config.level <= LogLevel.INFO) {
    log('INFO', message, args);
  }
}

export function warn(message: string, ...args: any[]) {
  if (config.level <= LogLevel.WARN) {
    log('WARN', message, args);
  }
}

export function error(message: string, ...args: any[]) {
  if (config.level <= LogLevel.ERROR) {
    log('ERROR', message, args);
  }
}

// Função interna para formatar e exibir logs
function log(level: string, message: string, args: any[]) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `${timestamp} ${config.prefix} [${level}] ${message}`;
  
  if (config.useConsole) {
    // Usar stderr para não interferir com a comunicação JSON no stdout
    if (args.length > 0) {
      // Serializar objetos complexos para evitar problemas de JSON
      const safeArgs = args.map(arg => {
        if (arg instanceof Error) {
          return { message: arg.message, name: arg.name, stack: arg.stack };
        } else if (typeof arg === 'object' && arg !== null) {
          try {
            // Tentar serializar e deserializar para remover propriedades não serializáveis
            return JSON.parse(JSON.stringify(arg));
          } catch (e) {
            return `[Objeto não serializável: ${typeof arg}]`;
          }
        }
        return arg;
      });
      
      process.stderr.write(`${formattedMessage} ${safeArgs.map(a => 
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
      ).join(' ')}\n`);
    } else {
      process.stderr.write(`${formattedMessage}\n`);
    }
  }
  
  // Aqui você pode adicionar outros destinos de log, como arquivo ou serviço externo
}

// Função para obter a configuração atual do logger
export function getLoggerConfig() {
  return { ...config }; // Retorna uma cópia da configuração para evitar modificação direta
}

// Exportar um objeto logger para facilitar o uso
export const logger = {
  debug,
  info,
  warn,
  error,
  configure: configureLogger,
  getConfig: getLoggerConfig
};

export default logger;
