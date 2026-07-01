import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as os from 'os';
import { 
    printStatus, 
    switchAccount, 
    logout, 
    logoutAll, 
    readConfig, 
    killMcpChrome 
} from './auth.js';

interface TargetConfig {
    notebook_id?: string;
    path: string;
    files?: string[];
}

interface ProjectConfig {
    project_name?: string;
    targets: Record<string, TargetConfig>;
}

// Utilidad para parsear argumentos de Node (--key value)
function parseArgs(): Record<string, string> {
    const args = process.argv.slice(2);
    const result: Record<string, string> = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].replace('--', '');
            const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
            result[key] = value;
            if (value !== 'true') i++;
        }
    }
    return result;
}

const askQuestion = (query: string): Promise<string> => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => rl.question(query, (ans) => {
        rl.close();
        resolve(ans);
    }));
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getMcpClient(): Promise<Client> {
    const mcpPath = path.join(os.homedir(), '.local', 'bin', 'notebooklm-mcp.exe');
    const transport = new StdioClientTransport({
        command: mcpPath,
        args: []
    });

    const client = new Client({
        name: "notebooklm-updater",
        version: "1.0.0"
    }, {
        capabilities: {}
    });

    await client.connect(transport);
    return client;
}

function loadProjectConfig(): { config: ProjectConfig; filePath: string } | null {
    const cwd = process.cwd();
    const configPath = path.join(cwd, 'notebook-sync.json');
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config && config.targets) {
                return { config, filePath: configPath };
            }
        } catch (e: any) {
            console.error(`⚠️ Error al parsear el archivo notebook-sync.json: ${e.message}`);
        }
    }
    return null;
}

async function handleLogin(email: string) {
    console.log(`🚀 Iniciando conexión con NotebookLM MCP para la cuenta: ${email}...`);
    try {
        const client = await getMcpClient();
        await switchAccount(email, client);
    } catch (e: any) {
        console.error("\n❌ Error crítico de autenticación:", e.message || e);
    } finally {
        process.exit(0);
    }
}

async function handleList() {
    console.log("🚀 Consultando listado de cuadernos en NotebookLM...");
    killMcpChrome();
    try {
        const client = await getMcpClient();
        const listResult = await client.callTool({
            name: "notebook_list",
            arguments: {}
        }) as any;

        const textOutput = listResult.content?.[0]?.text || "{}";
        
        // FastMCP devuelve isError: false pero mete el error en el texto
        if (listResult.isError || textOutput.includes('"status":"error"')) {
            throw new Error(textOutput || "Error al listar cuadernos");
        }

        const resultData = JSON.parse(textOutput);
        let notebooks: any[] = [];
        if (Array.isArray(resultData)) {
            notebooks = resultData;
        } else if (resultData.notebooks) {
            notebooks = resultData.notebooks;
        } else if (resultData.data && resultData.data.notebooks) {
            notebooks = resultData.data.notebooks;
        }
        
        console.log("\n📓 CUADERNOS DISPONIBLES EN NOTEBOOKLM:\n");
        if (notebooks.length === 0) {
            console.log("   - No se encontraron cuadernos en tu cuenta.");
        } else {
            console.log(
                "   " + "ID".padEnd(38) + " | " + "NOMBRE".padEnd(35) + " | " + "TEMAS\n" +
                "   " + "-".repeat(38) + "-+-" + "-".repeat(35) + "-+-" + "-".repeat(20)
            );
            for (const nb of notebooks) {
                const topicsStr = Array.isArray(nb.topics) ? nb.topics.slice(0, 3).join(', ') : '';
                console.log(`   ${nb.id.padEnd(38)} | ${nb.name.slice(0, 35).padEnd(35)} | ${topicsStr}`);
            }
        }
        console.log("");
    } catch (e: any) {
        console.error("\n❌ Error consultando cuadernos:", e.message || e);
    } finally {
        process.exit(0);
    }
}

async function handleSelect(notebookId: string) {
    console.log(`🚀 Seleccionando el cuaderno "${notebookId}" en NotebookLM...`);
    killMcpChrome();
    try {
        const client = await getMcpClient();
        const selectResult = await client.callTool({
            name: "chat_configure",
            arguments: { notebook_id: notebookId }
        }) as any;

        const textOutput = selectResult.content?.[0]?.text || "{}";
        
        if (selectResult.isError || textOutput.includes('"status":"error"')) {
            throw new Error(textOutput || "Error al seleccionar el cuaderno");
        }

        console.log(`\n🎉 Cuaderno seleccionado exitosamente.`);
        console.log(`👉 Todas las subidas sin URL explícita irán al cuaderno: \x1b[36m${notebookId}\x1b[0m`);
        console.log("");
    } catch (e: any) {
        console.error("\n❌ Error seleccionando el cuaderno:", e.message || e);
    } finally {
        process.exit(0);
    }
}

async function handleCleanup() {
    console.log("🧹 Iniciando limpieza nativa del perfil de Chrome y sesiones de NotebookLM...");
    killMcpChrome();
    
    const mcpDataDir = path.join(process.env.LOCALAPPDATA || '', 'notebooklm-mcp', 'Data');
    const activeProfilePath = path.join(mcpDataDir, 'chrome_profile');
    
    try {
        if (fs.existsSync(activeProfilePath)) {
            console.log("🗑️ Eliminando directorio de perfil de Chrome activo...");
            fs.rmSync(activeProfilePath, { recursive: true, force: true });
        }
        
        fs.mkdirSync(activeProfilePath, { recursive: true });
        console.log("📁 Recreando directorio de perfil limpio...");
        
        console.log("\n🎉 Limpieza completada con éxito. Se eliminaron perfiles bloqueados y archivos temporales de Chrome.");
        console.log("👉 Ahora puedes intentar iniciar sesión de nuevo con: notebook login <email>");
        console.log("");
    } catch (e: any) {
        console.error("\n❌ Error durante la limpieza nativa del perfil:", e.message || e);
    } finally {
        process.exit(0);
    }
}

async function handleUpload() {
    const args = parseArgs();
    const commandArgs = process.argv.slice(2);
    
    // Buscar target en los argumentos de la CLI
    let targetName: string | undefined = undefined;
    const uploadIdx = commandArgs.findIndex(arg => arg === 'upload' || arg === '--upload');
    
    if (uploadIdx !== -1 && commandArgs[uploadIdx + 1] && !commandArgs[uploadIdx + 1].startsWith('-')) {
        targetName = commandArgs[uploadIdx + 1];
    }

    const projectConfigData = loadProjectConfig();
    let targetConfig: TargetConfig | undefined = undefined;
    let configDir = process.cwd();

    if (projectConfigData) {
        const { config, filePath } = projectConfigData;
        configDir = path.dirname(filePath);
        const targets = config.targets;

        // Si el usuario ejecuta "notebook docs" directamente (sin "upload")
        const firstArg = commandArgs[0];
        if (!targetName && firstArg && targets[firstArg] && firstArg !== 'upload') {
            targetName = firstArg;
        }

        if (targetName) {
            targetConfig = targets[targetName];
            if (!targetConfig) {
                console.error(`❌ Error: El target "${targetName}" no existe en notebook-sync.json.`);
                console.log("Targets disponibles:", Object.keys(targets).join(', '));
                process.exit(1);
            }
            console.log(`📦 Usando configuración del target: \x1b[35m${targetName}\x1b[0m (Proyecto: ${config.project_name || "Sin nombre"})`);
        } else if (commandArgs[0] === 'upload' || commandArgs[0] === '--upload' || commandArgs.includes('--path')) {
            // El usuario llamó a upload pero sin target, o tiene flags. Si tiene --path seguimos tradicional.
            if (!args.path) {
                console.log(`ℹ️ Detectado notebook-sync.json (Proyecto: ${config.project_name || "Sin nombre"})`);
                console.log("Targets disponibles:");
                for (const key of Object.keys(targets)) {
                    console.log(`  - \x1b[35m${key}\x1b[0m: ${targets[key].path} (${targets[key].files?.length || "todos"} archivos)`);
                }
                console.log("\nUso: notebook upload <target>");
                process.exit(0);
            }
        }
    }

    // Resolver path a subir
    let targetDir = "";
    let filesToUpload: string[] | undefined = undefined;
    let customNotebookId: string | undefined = undefined;

    if (targetConfig) {
        targetDir = path.resolve(configDir, targetConfig.path);
        filesToUpload = targetConfig.files;
        customNotebookId = targetConfig.notebook_id;
    } else {
        if (!args.path) {
            console.error("❌ Error: Debes proporcionar un directorio usando --path o configurar un archivo notebook-sync.json.");
            console.log("\n📖 Uso de subida tradicional:");
            console.log("  notebook upload --path \"C:\\ruta\\a\\los\\md\"");
            process.exit(1);
        }
        targetDir = path.resolve(args.path);
    }

    if (!fs.existsSync(targetDir)) {
        console.error(`❌ Error: El directorio ${targetDir} no existe.`);
        process.exit(1);
    }

    // Cuenta activa
    const config = readConfig();
    const activeAccount = config.active_account || "Sin cuenta vinculada (Ejecuta 'notebook login <email>' primero)";

    console.log("🚀 Iniciando conexión con NotebookLM MCP...");
    console.log(`👤 Cuenta activa: \x1b[36m${activeAccount}\x1b[0m`);
    console.log(`📁 Directorio objetivo: ${targetDir}`);
    
    // Matar procesos Chrome huérfanos antes de conectar el MCP para la subida
    killMcpChrome();
    
    try {
        const client = await getMcpClient();
        console.log("✅ Conectado exitosamente al servidor MCP.");

        // Obtener notebookId:
        // 1. Del target config
        // 2. De la URL explícita --url
        // 3. Del get_health actual
        let notebookId = customNotebookId;
        let notebookUrl = args.url;

        if (!notebookId) {
            if (notebookUrl) {
                const notebookIdMatch = notebookUrl.match(/notebook\/([a-f0-9\-]+)/);
                notebookId = notebookIdMatch ? notebookIdMatch[1] : notebookUrl;
            } else {
                console.log("⏳ Consultando cuaderno activo en NotebookLM...");
                const healthResult = await client.callTool({ name: "get_health", arguments: {} }) as any;
                const textOutput = healthResult.content?.[0]?.text || "{}";
                try {
                    const healthData = JSON.parse(textOutput);
                    if (healthData.success && healthData.data && healthData.data.active_notebook_id) {
                        notebookId = healthData.data.active_notebook_id;
                        notebookUrl = healthData.data.notebook_url;
                        console.log(`📓 Cuaderno activo: \x1b[36m${healthData.data.active_notebook_name}\x1b[0m (ID: ${notebookId})`);
                    } else if (healthData.active_notebook_id) {
                        notebookId = healthData.active_notebook_id;
                        notebookUrl = healthData.notebook_url;
                    }
                } catch (e) {
                    // Ignorar
                }
            }
        }

        if (!notebookId) {
            console.error("❌ Error: No se ha podido determinar el cuaderno de destino.");
            console.error("👉 Selecciona uno predeterminado usando 'notebook list' y 'notebook select <id>', o indica el ID en tu config.");
            process.exit(1);
        }

        if (notebookUrl) {
            console.log(`📓 Enlace del cuaderno: ${notebookUrl}`);
        }

        // Obtener archivos de la carpeta
        let files = fs.readdirSync(targetDir).filter(f => f.endsWith('.md'));
        if (filesToUpload && filesToUpload.length > 0) {
            // Filtrar y ordenar según lo especificado
            files = files.filter(f => filesToUpload!.includes(f));
            files.sort((a, b) => filesToUpload!.indexOf(a) - filesToUpload!.indexOf(b));
        }

        if (files.length === 0) {
            console.log("ℹ️ No se encontraron archivos para subir en el directorio especificado.");
            process.exit(0);
        }

        console.log(`\n📦 Encontrados ${files.length} archivos para subir en ${targetDir}:`);
        for (const file of files) {
            console.log(`   - 📄 ${file}`);
        }

        const answer = await askQuestion("\n¿Estás seguro de que quieres subir todas estas fuentes al cuaderno? (s/N): ");
        if (answer.toLowerCase() !== 's') {
            console.log("🛑 Operación de subida cancelada por el usuario.");
            process.exit(0);
        }

        // Obtener fuentes existentes para deduplicación
        console.log("⏳ Consultando fuentes existentes en el cuaderno para evitar duplicados...");
        let existingSources: { id: string; title: string }[] = [];
        try {
            const getResult = await client.callTool({
                name: "notebook_get",
                arguments: { notebook_id: notebookId }
            }) as any;

            const textOutput = getResult.content?.[0]?.text || "";
            if (!getResult.isError && !textOutput.includes('"status":"error"')) {
                const notebookData = JSON.parse(textOutput);
                if (notebookData.notebook && Array.isArray(notebookData.notebook)) {
                    const notebookEntry = notebookData.notebook[0];
                    if (notebookEntry && Array.isArray(notebookEntry[1])) {
                        existingSources = notebookEntry[1].map((s: any) => ({
                            id: s[0]?.[0],
                            title: s[1]
                        })).filter((s: any) => s.id && s.title);
                    }
                } else if (notebookData.sources) {
                    existingSources = notebookData.sources.map((s: any) => ({
                        id: s.id,
                        title: s.title || s.name
                    }));
                }
                console.log(`ℹ️ Se encontraron ${existingSources.length} fuentes existentes en el cuaderno.`);
            }
        } catch (err) {
            console.warn("⚠️ No se pudo obtener la lista de fuentes existentes, se subirán directamente sin deduplicar.");
        }

        console.log("\n🚀 Inyectando conocimiento (con delay de 1.5s entre operaciones para no saturar)...\n");
        
        let uploaded = 0;
        for (const file of files) {
            const filePath = path.join(targetDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            
            try {
                const duplicate = existingSources.find(s => s.title === file);
                if (duplicate) {
                    console.log(`\n🗑️ Detectada fuente duplicada: "${file}" (ID: ${duplicate.id}). Eliminando...`);
                    try {
                        await client.callTool({
                            name: "source_delete",
                            arguments: {
                                source_id: duplicate.id,
                                confirm: true
                            }
                        });
                        console.log(`✅ Fuente obsoleta eliminada. Esperando 1.5s antes de subir la nueva...`);
                        await sleep(1500);
                    } catch (delErr: any) {
                        console.error(`⚠️ No se pudo eliminar la fuente obsoleta: ${delErr.message || String(delErr)}. Se intentará subir igualmente.`);
                    }
                }

                const result = await client.callTool({
                    name: "notebook_add_text",
                    arguments: {
                        notebook_id: notebookId,
                        text: content,
                        title: file
                    }
                }) as any;
                
                const textOutput = result.content?.[0]?.text || "";
                
                if (result.isError || textOutput.includes('"status":"error"')) {
                    throw new Error(textOutput || "Error desconocido devuelto por el MCP");
                }
                
                uploaded++;
                process.stdout.write(`\r[${uploaded}/${files.length}] ✅ Subido: ${file}${' '.repeat(20)}`);
                
                await sleep(1500); 
            } catch (err: any) {
                console.error(`\n\n❌ Error al subir ${file}:`);
                const msg = err.message || String(err);
                console.error(msg);
                
                if (msg.toLowerCase().includes('auth') || msg.toLowerCase().includes('session') || msg.toLowerCase().includes('login')) {
                    console.log("\n⚠️ PARADA DE EMERGENCIA: Tu sesión de NotebookLM parece haber caducado o no estar iniciada.");
                    console.log(`👉 Ejecuta 'notebook login ${config.active_account || "<email>"}' para restablecer la conexión.`);
                    break;
                }
            }
        }
        
        console.log(`\n\n🎉 Proceso completado. Se han inyectado ${uploaded} fuentes de conocimiento.`);

    } catch (e: any) {
        console.error("\n❌ Error crítico conectando con el servidor MCP:", e.message || e);
    } finally {
        process.exit(0);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    // Por compatibilidad con los scripts preexistentes que usan --path directamente
    if (command && (command === '--path' || args.includes('--path'))) {
        await handleUpload();
        return;
    }

    switch (command) {
        case 'status':
        case '--status':
        case '-s':
            printStatus();
            process.exit(0);
        case 'login':
        case '--login':
            const email = args[1];
            if (!email) {
                console.error("❌ Error: Debes especificar un email. Ejemplo: notebook login josueba.verdnatura@gmail.com");
                process.exit(1);
            }
            await handleLogin(email);
            break;
        case 'logout':
        case '--logout':
            const isAll = args.includes('--all');
            if (isAll) {
                logoutAll();
            } else {
                const targetEmail = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
                logout(targetEmail);
            }
            process.exit(0);
        case 'list':
        case 'list-notebooks':
        case '--list':
            await handleList();
            break;
        case 'select':
        case 'select-notebook':
        case '--select':
            const notebookId = args[1];
            if (!notebookId) {
                console.error("❌ Error: Debes proporcionar el ID del cuaderno. Ejemplo: notebook select base-de-conocimiento-refactori");
                process.exit(1);
            }
            await handleSelect(notebookId);
            break;
        case 'upload':
        case '--upload':
            await handleUpload();
            break;
        case 'cleanup':
        case '--cleanup':
            await handleCleanup();
            break;
        default:
            // Ver si coincide con un target de la config actual sin poner 'upload' explícito
            const configData = loadProjectConfig();
            if (configData && configData.config.targets[command]) {
                await handleUpload();
            } else {
                console.log("\n📖 Uso del NotebookLM CLI:");
                console.log("  notebook status                  Muestra el estado de la conexión y cuentas");
                console.log("  notebook login <email>           Inicia sesión o cambia a la cuenta especificada");
                console.log("  notebook logout                  Cierra la sesión activa actual");
                console.log("  notebook logout <email>          Elimina el perfil y cierra sesión para un correo específico");
                console.log("  notebook logout --all            Elimina todas las sesiones y perfiles guardados");
                console.log("  notebook list                    Lista los cuadernos disponibles en la cuenta activa");
                console.log("  notebook select <id>             Selecciona el cuaderno predeterminado para subidas");
                console.log("  notebook upload <target>         Sube los archivos definidos en el target de notebook-sync.json");
                console.log("  notebook upload --path <ruta>    Sube los archivos Markdown de forma tradicional");
                console.log("  notebook cleanup                 Limpia bloqueos de perfiles de Chrome y archivos corruptos");
                console.log("\nℹ️ También puedes usar '--path' directamente al inicio (ej. notebook --path ...) por compatibilidad.");
                process.exit(0);
            }
    }
}

main();
