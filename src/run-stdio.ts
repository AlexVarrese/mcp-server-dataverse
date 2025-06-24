// src/run-stdio.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { server } from "./server.js"; // Importa a instância do servidor (note o .js)
import { config } from "dotenv";

// Substituir console.log por uma função que escreve em stderr
// para não interferir com a comunicação JSON no stdout
const log = (message: string) => {
  process.stderr.write(`${message}\n`);
};

// Carregar variáveis de ambiente do arquivo .env, se existir
config();

// Imprimir informações de diagnóstico para ajudar a depurar (em stderr)
// log("Variáveis de ambiente do Dynamics 365:");
// log(`DYNAMICS_URL: ${process.env.DYNAMICS_URL ? "Definido" : "Não definido"}`);
// log(`DYNAMICS_CLIENT_ID: ${process.env.DYNAMICS_CLIENT_ID ? "Definido" : "Não definido"}`);
// log(`DYNAMICS_CLIENT_SECRET: ${process.env.DYNAMICS_CLIENT_SECRET ? "Definido" : "Não definido"}`);
// log(`DYNAMICS_TENANT_ID: ${process.env.DYNAMICS_TENANT_ID ? "Definido" : "Não definido"}`);

async function main() {
  // log("Iniciando o servidor MCP com transporte Stdio...");

  // Cria uma instância do transporte Stdio
  const transport = new StdioServerTransport();
  // log("Transporte Stdio criado.");

  try {
    // Conecta o servidor ao transporte
    // O servidor começará a ouvir mensagens no stdin e enviar no stdout
    await server.connect(transport);
    // log("Servidor MCP conectado ao transporte Stdio. Aguardando mensagens...");
    // A função connect geralmente entra em um loop de escuta,
    // então o código aqui só será executado se a conexão for fechada.
  } catch (error) {
    process.stderr.write(`Erro ao conectar ou durante a execução do servidor: ${error}\n`);
    process.exit(1); // Termina o processo com erro
  }
}

// Inicia o servidor
main().catch(error => {
  process.stderr.write(`Erro não tratado: ${error}\n`);
  process.exit(1);
});