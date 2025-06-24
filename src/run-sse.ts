// src/run-sse.ts
import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { server } from "./server.js"; // Importa a instância do servidor
import logger from "./logger.js";
import http from 'http';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Configurações
const HEARTBEAT_INTERVAL_MS = 15000; // 15 segundos
const SESSION_CLEANUP_INTERVAL_MS = 60000; // 1 minuto
const MAX_SESSION_IDLE_TIME_MS = 3600000; // 1 hora

// Configurar o logger
logger.configure({
  useConsole: true,
  level: 1 // INFO
});

// Exibir informações das variáveis de ambiente
logger.info("Variáveis de ambiente do Dynamics 365:");
logger.info(`DYNAMICS_URL: ${process.env.DYNAMICS_URL || 'Não definido'}`);
logger.info(`DYNAMICS_CLIENT_ID: ${process.env.DYNAMICS_CLIENT_ID ? 'Definido' : 'Não definido'}`);
logger.info(`DYNAMICS_CLIENT_SECRET: ${process.env.DYNAMICS_CLIENT_SECRET ? 'Definido' : 'Não definido'}`);
logger.info(`DYNAMICS_TENANT_ID: ${process.env.DYNAMICS_TENANT_ID ? 'Definido' : 'Não definido'}`);

async function main() {
  logger.info("Iniciando o servidor MCP com transporte SSE/HTTP...");

  // Cria um servidor Express
  const app = express();
  const port = process.env.PORT || 3002; // Usar a porta 3002 pois o MCP Inspector está tentando se conectar nessa porta
  
  // Interface para armazenar informações do transporte
  interface TransportInfo {
    transport: SSEServerTransport;
    lastActivity: number;
  }

  // Armazenar os transportes SSE ativos
  const transports: Record<string, TransportInfo> = {};
  
  // Mapa para armazenar formatos alternativos de sessionId
  const sessionIdMap: Record<string, string> = {};

  // Função para registrar formatos alternativos de sessionId
  function registerSessionIdFormats(sessionId: string): void {
    sessionIdMap[sessionId] = sessionId;
    sessionIdMap[sessionId.toLowerCase()] = sessionId;
    sessionIdMap[sessionId.replace(/-/g, '')] = sessionId;
    sessionIdMap[sessionId.toLowerCase().replace(/-/g, '')] = sessionId;
  }

  // Função para atualizar o timestamp de última atividade
  function updateLastActivity(sessionId: string): void {
    if (transports[sessionId]) {
      transports[sessionId].lastActivity = Date.now();
    }
  }

  // Função para limpar sessões inativas
  function cleanupInactiveSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    Object.keys(transports).forEach(sessionId => {
      const transportInfo = transports[sessionId];
      if (now - transportInfo.lastActivity > MAX_SESSION_IDLE_TIME_MS) {
        // Remover o transporte
        delete transports[sessionId];
        // Remover do mapa de sessionIds
        Object.keys(sessionIdMap).forEach(key => {
          if (sessionIdMap[key] === sessionId) {
            delete sessionIdMap[key];
          }
        });
        cleanedCount++;
      }
    });
    
    if (cleanedCount > 0) {
      logger.info(`[SSE] Limpeza: ${cleanedCount} sessões inativas removidas`);
      logger.info(`[SSE] Total de conexões ativas após limpeza: ${Object.keys(transports).length}`);
    }
  }

  // Configurar limpeza periódica de sessões inativas
  setInterval(cleanupInactiveSessions, SESSION_CLEANUP_INTERVAL_MS);

  // Endpoint SSE para conexões persistentes
  app.get("/mcp/sse", async (req, res) => {
    try {
      logger.info(`[HTTP] Nova conexão SSE recebida de ${req.ip}`);
      
      // Criar transporte SSE
      const transport = new SSEServerTransport('/mcp/messages', res);
      const sessionId = transport.sessionId;
      
      // Registrar o transporte para uso posterior
      transports[sessionId] = {
        transport,
        lastActivity: Date.now()
      };
      
      // Registrar formatos alternativos do sessionId para compatibilidade
      registerSessionIdFormats(sessionId);
      
      logger.info(`[SSE] Nova conexão estabelecida com sessionId: ${sessionId}`);
      logger.info(`[SSE] Total de conexões ativas: ${Object.keys(transports).length}`);
      logger.debug(`[SSE] SessionIds ativos: ${Object.keys(transports).join(', ')}`);
      
      // Conectar o transporte ao servidor MCP
      // Isso chama internamente o método start() do transporte
      server.connect(transport);
      
      // Configurar evento de fechamento
      res.on("close", () => {
        logger.info(`[SSE] Cliente fechou a conexão para sessionId: ${sessionId}`);
        delete transports[sessionId];
        // Remover do mapa de sessionIds
        Object.keys(sessionIdMap).forEach(key => {
          if (sessionIdMap[key] === sessionId) {
            delete sessionIdMap[key];
          }
        });
        logger.info(`[SSE] Total de conexões ativas após fechamento: ${Object.keys(transports).length}`);
      });
      
      // Configurar heartbeat para manter a conexão ativa
      const heartbeatInterval = setInterval(() => {
        if (!res.writableEnded && !res.finished) {
          try {
            // Enviar um comentário heartbeat
            res.write(":heartbeat\n\n");
            
            // Enviar também um evento de dados vazio no formato correto
            // Formato correto JSON-RPC 2.0 para evitar erros de validação Zod
            res.write("data: {\"jsonrpc\":\"2.0\",\"result\":{}}\n\n");
              
            // Tentar usar res.flush() se disponível
            try {
              (res as any).flush();
            } catch (flushError) {
              // Ignorar erros de flush, pois nem todos os ambientes suportam
            }
          } catch (heartbeatError) {
            logger.error(`[SSE] Erro ao enviar heartbeat: ${heartbeatError}`);
            clearInterval(heartbeatInterval);
          }
        } else {
          // Limpar o intervalo se a conexão foi fechada
          clearInterval(heartbeatInterval);
        }
      }, HEARTBEAT_INTERVAL_MS);
      
    } catch (error) {
      logger.error(`[HTTP] Erro ao configurar conexão SSE: ${error}`);
      res.status(500).send(`Erro interno do servidor: ${error}`);
    }
  });

  // Endpoint POST para receber mensagens do cliente
  app.post("/mcp/messages", express.json(), async (req, res) => {
    // Desativar o logger do console durante o processamento para evitar interferência
    const originalUseConsole = logger.getConfig().useConsole;
    logger.configure({ useConsole: false });
    
    try {
      // Obter o sessionId da query string
      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        logger.error(`[HTTP] Requisição sem sessionId: ${JSON.stringify(req.query)}`);
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "SessionId não fornecido"
          },
          id: null
        });
        return;
      }
      
      // Obter a mensagem do corpo da requisição
      const message = req.body;
      if (!message) {
        logger.error(`[HTTP] Requisição sem corpo: ${sessionId}`);
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Corpo da requisição vazio ou inválido"
          },
          id: null
        });
        return;
      }
      
      // Tentar encontrar o transporte para o sessionId fornecido
      const transportInfo = transports[sessionId];
      if (!transportInfo) {
        logger.error(`[SSE] Sessão não encontrada para sessionId: ${sessionId}`);
        logger.debug(`[SSE] SessionIds ativos: ${Object.keys(transports).join(', ')}`);
        
        // Tentar encontrar o sessionId em formatos alternativos
        const alternativeSessionId = sessionIdMap[sessionId];
        if (alternativeSessionId && transports[alternativeSessionId]) {
          logger.info(`[SSE] Encontrado sessionId alternativo: ${alternativeSessionId}`);
          const altTransportInfo = transports[alternativeSessionId];
          
          // Usar o método handlePostMessage do transporte SSE
          try {
            await altTransportInfo.transport.handlePostMessage(req, res, message);
            return;
          } catch (error) {
            logger.error(`[SSE] Erro ao processar mensagem com transporte alternativo: ${error}`);
          }
        }
        
        // Verificar se há alguma sessão ativa - se houver, usar a primeira
        const activeSessionIds = Object.keys(transports);
        if (activeSessionIds.length > 0) {
          const firstSessionId = activeSessionIds[0];
          logger.info(`[SSE] Usando primeira sessão ativa disponível: ${firstSessionId}`);
          const firstTransportInfo = transports[firstSessionId];
          
          // Registrar o sessionId original como alternativa para o primeiro sessionId ativo
          sessionIdMap[sessionId] = firstSessionId;
          
          // Usar o método handlePostMessage do transporte SSE
          try {
            await firstTransportInfo.transport.handlePostMessage(req, res, message);
            return;
          } catch (error) {
            logger.error(`[SSE] Erro ao processar mensagem com primeira sessão ativa: ${error}`);
          }
        }
        
        // Se não encontrou nenhuma sessão ativa, retornar erro
        res.status(404).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Sessão não encontrada"
          },
          id: message.id || null
        });
        return;
      }
      
      // Atualizar o timestamp de última atividade
      updateLastActivity(sessionId);
      
      // Usar o método handlePostMessage do transporte SSE
      await transportInfo.transport.handlePostMessage(req, res, message);
      
    } catch (error) {
      logger.error(`[HTTP] Erro ao processar mensagem POST: ${error}`);
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: `Erro interno do servidor: ${error}`
        },
        id: null
      });
    } finally {
      // Restaurar a configuração original do logger
      logger.configure({ useConsole: originalUseConsole });
    }
  });

  // Criar servidor HTTP com configurações de timeout
  const httpServer = http.createServer(app);
  
  // Configurar timeouts
  httpServer.timeout = 0; // Desativar timeout
  httpServer.keepAliveTimeout = 120000; // 2 minutos

  // Iniciar o servidor
  httpServer.listen(port, () => {
    logger.info(`Servidor MCP com transporte SSE iniciado na porta ${port}`);
    logger.info(`Endpoint SSE disponível em: http://localhost:${port}/mcp/sse`);
    logger.info(`Configurações de timeout: keepAliveTimeout=${httpServer.keepAliveTimeout}ms, timeout=${httpServer.timeout}ms`);
  });
}

// Iniciar o servidor
main().catch(error => {
  logger.error(`Erro ao iniciar o servidor: ${error}`);
  process.exit(1);
});
