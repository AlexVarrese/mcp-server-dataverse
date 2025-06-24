# Guia de Instalação e Uso: MCP Server Dynamics 365 com VS Code

Este guia detalha os passos para instalar, configurar e utilizar o MCP Server para Dynamics 365 em seu ambiente de desenvolvimento local, com foco na integração com o Visual Studio Code (VS Code).

## 1. Introdução

O MCP Server Dynamics 365 é um servidor que implementa o Model Context Protocol (MCP) para fornecer uma interface unificada e poderosa para interagir com sua instância do Microsoft Dynamics 365. Ele permite que assistentes de IA e outras ferramentas acessem e manipulem dados e metadados do Dynamics 365 de forma programática.

## 2. Benefícios para Desenvolvedores (com GitHub Copilot)

Utilizar o MCP Server Dynamics 365 no seu fluxo de trabalho de desenvolvimento, especialmente em conjunto com ferramentas como o GitHub Copilot no VS Code, oferece vantagens significativas:

-   **Aceleração do Desenvolvimento**: Acesse e manipule dados e metadados do Dynamics 365 diretamente do seu editor, sem a necessidade de alternar constantemente para a interface web do Dynamics ou construir consultas complexas manualmente.
-   **Consistência e Padronização**: O MCP fornece uma interface unificada e padronizada para interagir com o Dynamics 365, simplificando a forma como diferentes partes de um projeto ou diferentes desenvolvedores acessam a plataforma.
-   **Testes e Validações Simplificados**: Com ferramentas como o MCP Inspector, você pode rapidamente testar chamadas, validar payloads e verificar respostas da API do Dynamics, agilizando o ciclo de desenvolvimento e depuração.
-   **Integração Poderosa com GitHub Copilot**:
    -   **Geração de Código Contextualizada**: Ao expor as funcionalidades do Dynamics 365 através das ferramentas MCP, o GitHub Copilot no VS Code ganha um contexto rico. Ele pode entender melhor suas intenções ao trabalhar com o Dynamics e sugerir trechos de código mais precisos e relevantes para interagir com o servidor (ex: construir parâmetros para uma ferramenta MCP, processar respostas).
    -   **Criação de Scripts e Automações**: O Copilot pode auxiliar na criação de scripts (ex: Node.js, Python) que utilizam o MCP Server para automatizar tarefas, migrar dados ou realizar integrações complexas.
    -   **Aprendizado e Exploração**: Use o Copilot para gerar exemplos de como usar ferramentas MCP específicas, ajudando a explorar as capacidades do servidor e da API do Dynamics.
-   **Curva de Aprendizagem Reduzida para a API Dynamics**: O MCP Server abstrai muitas das complexidades da API Web do Dynamics 365, oferecendo ferramentas de mais alto nível que são mais fáceis de entender e usar.
-   **Automação de Tarefas Repetitivas**: Desenvolvedores podem criar scripts ou pequenas aplicações que consomem o MCP Server para automatizar tarefas comuns de desenvolvimento ou administração no Dynamics 365.
-   **Colaboração Aprimorada**: Ao padronizar o acesso ao Dynamics através do MCP, equipes podem compartilhar mais facilmente scripts, testes e conhecimento sobre como interagir com a plataforma.

## 3. Pré-requisitos

Antes de começar, certifique-se de que você possui os seguintes softwares instalados:

- **Node.js e npm**: Recomenda-se a versão LTS mais recente do Node.js (que inclui o npm). Você pode baixá-los em [nodejs.org](https://nodejs.org/).
- **Visual Studio Code (VS Code)**: Um editor de código-fonte popular. Disponível em [code.visualstudio.com](https://code.visualstudio.com/).
- **Git**: Sistema de controle de versão para clonar o repositório. Disponível em [git-scm.com](https://git-scm.com/).
- **Acesso a uma instância do Dynamics 365**: Para funcionalidade completa, você precisará de credenciais para se conectar a uma instância do Dynamics 365. Caso contrário, o servidor operará em **modo simulado**, utilizando dados de exemplo para algumas operações.

## 4. Instalação

Siga estes passos para instalar o MCP Server:

1.  **Clonar o Repositório**:
    Abra seu terminal ou prompt de comando e clone o repositório do projeto para sua máquina local. Se você não tiver a URL do repositório, substitua `URL_DO_REPOSITORIO` pela URL correta.
    ```bash
    git clone URL_DO_REPOSITORIO mcp-dynamics
    ```
2.  **Navegar para o Diretório do Projeto**:
    ```bash
    cd mcp-dynamics
    ```
3.  **Instalar Dependências**:
    Execute o comando abaixo para instalar todas as dependências do projeto listadas no arquivo `package.json`.
    ```bash
    npm install
    ```

## 5. Configuração

A configuração principal é feita através de variáveis de ambiente.

1.  **Criar Arquivo `.env`**:
    Na raiz do projeto, crie um arquivo chamado `.env`. Este arquivo armazenará suas credenciais e configurações do Dynamics 365 de forma segura.

2.  **Definir Variáveis de Ambiente**:
    Adicione as seguintes variáveis ao seu arquivo `.env`. Estes valores são necessários para conectar o servidor à sua instância do Dynamics 365.

    ```env
    DYNAMICS_URL=https://suaorganizacao.api.crm.dynamics.com
    DYNAMICS_CLIENT_ID=seu_client_id
    DYNAMICS_CLIENT_SECRET=seu_client_secret
    DYNAMICS_TENANT_ID=seu_tenant_id
    # DYNAMICS_API_VERSION=9.2 (Opcional, padrão é 9.2)
    # LOG_LEVEL=debug (Opcional, padrão é info. Outras opções: error, warn, verbose)
    ```

    -   `DYNAMICS_URL`: A URL base da API da sua instância do Dynamics 365.
    -   `DYNAMICS_CLIENT_ID`: O ID do Aplicativo (Cliente) registrado no Azure Active Directory com permissões para acessar o Dynamics 365.
    -   `DYNAMICS_CLIENT_SECRET`: O segredo do cliente gerado para o aplicativo registrado no Azure AD.
    -   `DYNAMICS_TENANT_ID`: O ID do Diretório (Tenant) do seu Azure AD.

    **Como obter esses valores?**
    Você precisará registrar um aplicativo no portal do Azure Active Directory (Azure AD) e conceder a ele as permissões apropriadas para o Dynamics 365. Consulte a documentação da Microsoft sobre "Registro de Aplicativo" e "Autenticação do Power Apps com APIs Web" para obter detalhes.

    **Modo Simulado**: Se estas variáveis não forem fornecidas ou estiverem incompletas, o servidor iniciará em **modo simulado**. Neste modo, ele não se conectará ao Dynamics 365 real, mas usará dados de exemplo para algumas ferramentas e funcionalidades, o que é útil para desenvolvimento e testes iniciais sem uma instância real.

## 6. Executando o MCP Server

1.  **Compilar o Projeto (Build)**:
    Antes de executar o servidor, você precisa compilar o código TypeScript para JavaScript.
    ```bash
    npm run build
    ```
    Este comando geralmente cria uma pasta `dist/` com os arquivos compilados.

2.  **Iniciar o Servidor**:
    Existem duas formas principais de iniciar o servidor:

    *   **Transporte STDIO (Recomendado para VS Code Inspector)**:
        Este modo é ideal para usar com a extensão MCP Inspector no VS Code ou outras ferramentas que se comunicam via entrada/saída padrão.
        ```bash
        npm run start:stdio
        ```
        Internamente, este comando executa algo como `node dist/run-stdio.js`.

    *   **Transporte SSE (Server-Sent Events)**:
        Este modo inicia um servidor HTTP que expõe um endpoint SSE, geralmente na porta 3001. Útil para inspetores baseados em navegador ou integrações diretas via HTTP.
        ```bash
        npm run start
        ```
        Verifique os logs do console para a URL exata (ex: `http://localhost:3001/mcp/sse`).

## 7. Usando com o VS Code

1.  **Abrir o Projeto no VS Code**:
    Abra a pasta do projeto `mcp-dynamics` no VS Code.

2.  **Instalar a Extensão MCP Inspector (Recomendado)**:
    -   Vá para a aba de Extensões no VS Code (Ctrl+Shift+X).
    -   Procure por `@modelcontextprotocol/inspector` e instale-a.

3.  **Configurar o MCP Inspector**:
    -   Após a instalação, abra o MCP Inspector (geralmente através da paleta de comandos: Ctrl+Shift+P, procure por "MCP Inspector").
    -   **Para transporte STDIO**:
        -   Escolha a opção de conectar via "STDIO Command".
        -   No campo "Command", insira o comando para iniciar o servidor em modo STDIO. Se a raiz do seu projeto estiver aberta no VS Code, você pode usar um caminho relativo ou o comando npm:
            -   Exemplo direto: `node dist/run-stdio.js` (assumindo que `dist/run-stdio.js` é o script correto).
            -   Exemplo com npm: `npm run start:stdio` (certifique-se que o `cwd` está correto ou use caminhos absolutos se necessário).
        -   Clique em "Connect".
    -   **Para transporte SSE**:
        -   Escolha a opção de conectar via "SSE URL".
        -   No campo "URL", insira a URL do endpoint SSE do seu servidor (ex: `http://localhost:3001/mcp/sse`).
        -   Clique em "Connect".

4.  **Testando Ferramentas com o MCP Inspector**:
    -   Uma vez conectado, o MCP Inspector mostrará as ferramentas disponíveis no servidor.
    -   Você pode selecionar uma ferramenta, preencher seus parâmetros em formato JSON e clicar em "Execute" para enviar a requisição ao servidor.
    -   **Exemplo de chamada para a ferramenta `whoami`**:
        ```json
        {
          "toolName": "whoami",
          "parameters": {}
        }
        ```
    -   **Exemplo de chamada para `get-entity-metadata`**:
        ```json
        {
          "toolName": "get-entity-metadata",
          "parameters": {
            "entityName": "account",
            "includeAttributes": true
          }
        }
        ```

## 8. Desenvolvimento no VS Code

-   **Estrutura do Projeto**: Familiarize-se com a estrutura de pastas, especialmente:
    -   `src/`: Contém o código-fonte TypeScript.
        -   `src/server.ts`: Ponto de entrada principal, onde as ferramentas e o servidor MCP são definidos.
        -   `src/services/`: Contém a lógica de negócios para interagir com o Dynamics 365 e outras funcionalidades.
    -   `docs/`: Documentação do projeto.
-   **Linting e Formatting**: O projeto pode estar configurado com ESLint e Prettier para manter a consistência do código. Verifique o `package.json` por scripts como `lint` ou `format`.
-   **Debugging**: Você pode configurar o VS Code para depurar o aplicativo Node.js. Crie um arquivo `launch.json` na pasta `.vscode` com configurações apropriadas. Exemplo para depurar o `run-stdio.js`:
    ```json
    {
      "version": "0.2.0",
      "configurations": [
        {
          "type": "node",
          "request": "launch",
          "name": "Debug MCP Server (STDIO)",
          "program": "${workspaceFolder}/dist/run-stdio.js",
          "preLaunchTask": "npm: build", // Garante que o build seja executado antes
          "outFiles": ["${workspaceFolder}/dist/**/*.js"],
          "console": "integratedTerminal"
        }
      ]
    }
    ```
    Não se esqueça de executar `npm run build` antes de depurar se não usar uma `preLaunchTask`.

## 9. Solução de Problemas

-   **Modo Simulado**: Se o servidor estiver respondendo com dados de exemplo ou você vir avisos sobre "modo simulado" e "credenciais incompletas", verifique seu arquivo `.env` e as variáveis de ambiente.
-   **Erros de Conexão com Dynamics**: Se estiver usando credenciais reais e encontrar erros de autenticação ou conexão (ex: 401 Unauthorized, 403 Forbidden), verifique:
    -   Se as credenciais no `.env` estão corretas.
    -   Se o aplicativo registrado no Azure AD tem as permissões necessárias para o Dynamics 365.
    -   Se a URL do Dynamics (`DYNAMICS_URL`) está correta.
-   **Erros 400 Bad Request**: Podem indicar que os parâmetros enviados para uma ferramenta estão incorretos ou malformados. Verifique a documentação da ferramenta e o formato JSON da sua requisição.
-   **Logs**: Verifique os logs do console onde o servidor está rodando. O `logger` configurado no projeto (geralmente em `src/logger.ts`) fornecerá informações úteis. O nível de log pode ser ajustado pela variável de ambiente `LOG_LEVEL`.
-   **TypeScript Errors**: Se encontrar erros durante `npm run build`, o compilador TypeScript (tsc) indicará os problemas no código que precisam ser corrigidos.

## 10. Ferramentas Disponíveis

O servidor MCP Dynamics 365 oferece uma variedade de ferramentas para interagir com sua instância. Para uma lista completa, descrições detalhadas, parâmetros e exemplos de cada ferramenta, consulte o documento `guia-ferramentas-mcp.md` localizado na pasta `docs/` do projeto.

Categorias de ferramentas incluem:
- Consulta de dados (ex: `retrieve-entity`, `query-dynamics`)
- Manipulação de dados (ex: `createCase`, `updateAccount`)
- Exploração de metadados (ex: `get-entity-metadata`, `metadata-explorer`)
- Comandos abreviados e assistentes de consulta.

---

Esperamos que este guia ajude você a começar com o MCP Server Dynamics 365 no VS Code! Se encontrar problemas ou tiver dúvidas, consulte a documentação adicional do projeto ou os logs do servidor.
