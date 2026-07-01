import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { 
    printStatus, 
    switchAccount, 
    logout, 
    logoutAll, 
    readConfig, 
    killMcpChrome 
} from './auth.js';

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
    const transport = new StdioClientTransport({
        command: "C:\\Users\\josueba\\.local\\bin\\notebooklm-mcp.exe",
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

async function handleUpload() {
    const args = parseArgs();
    
    // Validar path
    if (!args.path) {
        console.error("❌ Error: Debes proporcionar un directorio usando --path.");
        console.log("\n📖 Uso de subida:");
        console.log("  tsx index.ts upload --path \"C:\\ruta\\a\\los\\md\"");
        process.exit(1);
    }
    
    // Resolver path a ruta absoluta
    const targetDir = path.resolve(args.path);
    if (!fs.existsSync(targetDir)) {
        console.error(`❌ Error: El directorio ${targetDir} no existe.`);
        process.exit(1);
    }

    // Cuenta activa
    const config = readConfig();
    const activeAccount = config.active_account || "Sin cuenta vinculada (Ejecuta 'login <email>' primero)";

    // El cuaderno por defecto
    const notebookUrl = args.url || "https://notebooklm.google.com/notebook/a0f74dc3-ae95-4ddd-817b-a565677c6c5a";

    console.log("🚀 Iniciando conexión con NotebookLM MCP...");
    console.log(`👤 Cuenta activa: \x1b[36m${activeAccount}\x1b[0m`);
    console.log(`📁 Directorio objetivo: ${targetDir}`);
    console.log(`📓 Cuaderno destino: ${notebookUrl}\n`);
    
    // Matar procesos Chrome huérfanos antes de conectar el MCP para la subida
    killMcpChrome();
    
    try {
        const client = await getMcpClient();
        console.log("✅ Conectado exitosamente al servidor MCP.");

        const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.md'));
        if (files.length === 0) {
            console.log("ℹ️ No se encontraron archivos .md en el directorio especificado.");
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

        // Extraemos el UUID de la URL
        const notebookIdMatch = notebookUrl.match(/notebook\/([a-f0-9\-]+)/);
        const notebookId = notebookIdMatch ? notebookIdMatch[1] : notebookUrl;

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
                // Comprobar si existe para eliminarla antes
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
                    console.log(`👉 Ejecuta 'tsx index.ts login ${config.active_account || "<email>"}' para restablecer la conexión.`);
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
    if (command && command.startsWith('--')) {
        await handleUpload();
        return;
    }

    switch (command) {
        case 'status':
            printStatus();
            process.exit(0);
        case 'login':
            const email = args[1];
            if (!email) {
                console.error("❌ Error: Debes especificar un email. Ejemplo: tsx index.ts login josueba.verdnatura@gmail.com");
                process.exit(1);
            }
            await handleLogin(email);
            break;
        case 'logout':
            const isAll = args.includes('--all');
            if (isAll) {
                logoutAll();
            } else {
                const targetEmail = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
                logout(targetEmail);
            }
            process.exit(0);
        case 'upload':
            await handleUpload();
            break;
        default:
            console.log("\n📖 Uso del NotebookLM CLI:");
            console.log("  tsx index.ts status                  Muestra el estado de la conexión y cuentas");
            console.log("  tsx index.ts login <email>           Inicia sesión o cambia a la cuenta especificada");
            console.log("  tsx index.ts logout                  Cierra la sesión activa actual");
            console.log("  tsx index.ts logout <email>          Elimina el perfil y cierra sesión para un correo específico");
            console.log("  tsx index.ts logout --all            Elimina todas las sesiones y perfiles guardados");
            console.log("  tsx index.ts upload --path <ruta>    Sube los archivos Markdown al cuaderno");
            console.log("\nℹ️ También puedes usar '--path' directamente al inicio (ej. tsx index.ts --path ...) por compatibilidad.");
            process.exit(0);
    }
}

main();
