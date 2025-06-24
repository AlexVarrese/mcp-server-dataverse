// src/cli.ts
import readline from 'readline';
import { dynamicsService } from './services/dynamicsService.js';
import { nlQueryService } from './services/nlQueryService.js';
import { shortCommandService } from './services/shortCommandService.js';
import { queryAssistantService } from './services/queryAssistantService.js';
import logger from './logger.js';

// Configurar interface de linha de comando
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Variáveis de estado
let activeSessionId: string | null = null;
let mode: 'command' | 'natural' | 'assistant' = 'command';

// Função para exibir o prompt
function showPrompt() {
  const modePrefix = mode === 'command' ? 'CMD' : mode === 'natural' ? 'NL' : 'ASSIST';
  const sessionSuffix = activeSessionId ? ` (${activeSessionId.substring(0, 8)}...)` : '';
  rl.setPrompt(`[${modePrefix}${sessionSuffix}]> `);
  rl.prompt();
}

// Função para exibir ajuda
function showHelp() {
  console.log('\n=== CLI do Dynamics 365 ===');
  console.log('Modos disponíveis:');
  console.log('  :cmd       - Modo de comandos abreviados (ex: contact:list)');
  console.log('  :nl        - Modo de linguagem natural (ex: listar contatos ativos)');
  console.log('  :assist    - Modo de assistente interativo (guiado passo a passo)');
  console.log('\nComandos gerais:');
  console.log('  :help      - Exibe esta ajuda');
  console.log('  :exit      - Sai do programa');
  console.log('  :clear     - Limpa a tela');
  
  if (mode === 'command') {
    console.log('\nExemplos de comandos abreviados:');
    console.log('  contact:list                  - Lista contatos');
    console.log('  account:get 123               - Obtém detalhes da conta com ID 123');
    console.log('  case:create subject="Teste"   - Cria um novo caso');
    console.log('  contact:update 456 firstname="João" - Atualiza um contato');
    console.log('  account:count name=*Microsoft* - Conta registros com filtro');
    console.log('  contact:fields                - Lista campos disponíveis');
  } else if (mode === 'natural') {
    console.log('\nExemplos de consultas em linguagem natural:');
    console.log('  listar contatos ativos');
    console.log('  mostrar casos criados hoje');
    console.log('  buscar contas em São Paulo');
    console.log('  contar oportunidades com valor maior que 10000');
  } else if (mode === 'assistant') {
    console.log('\nComandos do assistente:');
    console.log('  :start     - Inicia uma nova sessão de assistente');
    console.log('  :end       - Encerra a sessão atual do assistente');
    console.log('  (qualquer outra entrada será enviada para o assistente)');
  }
  
  console.log('\n');
}

// Função para processar comandos especiais
function processSpecialCommand(input: string): boolean {
  const command = input.trim().toLowerCase();
  
  // Comandos gerais
  if (command === ':help') {
    showHelp();
    return true;
  } else if (command === ':exit') {
    console.log('Encerrando o programa...');
    rl.close();
    process.exit(0);
    return true;
  } else if (command === ':clear') {
    console.clear();
    return true;
  }
  
  // Comandos de mudança de modo
  else if (command === ':cmd') {
    mode = 'command';
    console.log('Modo de comandos abreviados ativado.');
    return true;
  } else if (command === ':nl') {
    mode = 'natural';
    console.log('Modo de linguagem natural ativado.');
    return true;
  } else if (command === ':assist') {
    mode = 'assistant';
    console.log('Modo de assistente interativo ativado.');
    if (!activeSessionId) {
      console.log('Use :start para iniciar uma nova sessão de assistente.');
    }
    return true;
  }
  
  // Comandos específicos do assistente
  else if (mode === 'assistant' && command === ':start') {
    startAssistantSession();
    return true;
  } else if (mode === 'assistant' && command === ':end') {
    endAssistantSession();
    return true;
  }
  
  return false;
}

// Função para iniciar uma sessão de assistente
async function startAssistantSession() {
  try {
    const { sessionId, message } = queryAssistantService.startSession();
    activeSessionId = sessionId;
    console.log(`\n${message}\n`);
  } catch (error: any) {
    console.error(`Erro ao iniciar sessão: ${error.message}`);
  }
}

// Função para encerrar uma sessão de assistente
async function endAssistantSession() {
  if (!activeSessionId) {
    console.log('Nenhuma sessão ativa para encerrar.');
    return;
  }
  
  try {
    const success = queryAssistantService.endSession(activeSessionId);
    if (success) {
      console.log('Sessão encerrada com sucesso.');
    } else {
      console.log('Sessão não encontrada ou já encerrada.');
    }
    activeSessionId = null;
  } catch (error: any) {
    console.error(`Erro ao encerrar sessão: ${error.message}`);
  }
}

// Função para processar entrada no modo de comandos abreviados
async function processCommandMode(input: string) {
  try {
    const result = await shortCommandService.processCommand(input);
    
    if (!result.success) {
      console.log(`\nErro: ${result.message}\n`);
      return;
    }
    
    // Formatar a resposta de acordo com o tipo de comando
    if (result.count !== undefined && result.results) {
      // Resultado de listagem
      console.log(`\nEncontrados ${result.count} registros de ${result.entity}:\n`);
      console.log(JSON.stringify(result.results, null, 2));
    } else if (result.result) {
      // Resultado de detalhamento
      console.log(`\nDetalhes do registro de ${result.entity}:\n`);
      console.log(JSON.stringify(result.result, null, 2));
    } else if (result.count !== undefined) {
      // Resultado de contagem
      console.log(`\nTotal de registros de ${result.entity}: ${result.count}`);
      if (result.filter) {
        console.log(`Filtro aplicado: ${result.filter}`);
      }
    } else if (result.fields) {
      // Resultado de campos
      console.log(`\nCampos da entidade ${result.entity} (${result.entityDisplayName}):\n`);
      result.fields.forEach((field: any) => {
        let fieldInfo = `- ${field.name} (${field.type}): ${field.displayName}`;
        if (field.required) fieldInfo += ' [Obrigatório]';
        if (field.description) fieldInfo += `\n  Descrição: ${field.description}`;
        if (field.optionSet?.options) {
          fieldInfo += `\n  Opções: ${field.optionSet.options.map((opt: any) => `${opt.value}=${opt.label}`).join(', ')}`;
        }
        console.log(fieldInfo);
      });
    } else {
      // Outro tipo de resultado
      console.log(`\n${result.message || JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error: any) {
    console.error(`\nErro ao processar comando: ${error.message}\n`);
  }
}

// Função para processar entrada no modo de linguagem natural
async function processNaturalLanguageMode(input: string) {
  try {
    const result = await nlQueryService.processQuery(input);
    
    if (!result.success) {
      console.log(`\nErro: ${result.message}\n`);
      return;
    }
    
    // Exibir o resultado
    console.log(`\n${result.message || ''}`);
    
    if (result.data) {
      if (Array.isArray(result.data)) {
        console.log(`Encontrados ${result.data.length} registros:\n`);
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        console.log(`Detalhes do registro:\n`);
        console.log(JSON.stringify(result.data, null, 2));
      }
    }
  } catch (error: any) {
    console.error(`\nErro ao processar consulta: ${error.message}\n`);
  }
}

// Função para processar entrada no modo de assistente
async function processAssistantMode(input: string) {
  if (!activeSessionId) {
    console.log('Nenhuma sessão ativa. Use :start para iniciar uma nova sessão.');
    return;
  }
  
  try {
    const response = await queryAssistantService.processInput(activeSessionId, input);
    
    console.log(`\n${response.message}\n`);
    
    if (response.completed && response.result) {
      if (Array.isArray(response.result)) {
        console.log(`Resultados (${response.result.length}):\n`);
        console.log(JSON.stringify(response.result, null, 2));
      } else if (response.result.count !== undefined) {
        console.log(`Total de registros: ${response.result.count}`);
        if (response.result.filter) {
          console.log(`Filtro aplicado: ${response.result.filter}`);
        }
      } else {
        console.log(`Detalhes do registro:\n`);
        console.log(JSON.stringify(response.result, null, 2));
      }
      
      // Encerrar a sessão após completar
      activeSessionId = null;
      console.log('\nSessão concluída. Use :start para iniciar uma nova consulta.\n');
    }
  } catch (error: any) {
    console.error(`\nErro ao processar entrada: ${error.message}\n`);
  }
}

// Função principal para processar a entrada do usuário
async function processInput(input: string) {
  // Verificar se é um comando especial
  if (processSpecialCommand(input)) {
    return;
  }
  
  // Processar de acordo com o modo atual
  if (mode === 'command') {
    await processCommandMode(input);
  } else if (mode === 'natural') {
    await processNaturalLanguageMode(input);
  } else if (mode === 'assistant') {
    await processAssistantMode(input);
  }
}

// Inicializar a CLI
console.clear();
console.log('=== CLI do Dynamics 365 ===');
console.log('Digite :help para ver os comandos disponíveis ou :exit para sair.');
console.log('Modo inicial: comandos abreviados (ex: contact:list)');
console.log('');

// Configurar o handler de linha
rl.on('line', async (input) => {
  if (input.trim()) {
    await processInput(input);
  }
  showPrompt();
}).on('close', () => {
  console.log('Programa encerrado.');
  process.exit(0);
});

// Exibir o prompt inicial
showPrompt();
