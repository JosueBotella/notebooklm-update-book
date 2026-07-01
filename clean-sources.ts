import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as readline from 'readline';

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

async function main() {
    const args = parseArgs();
    
    const notebookUrl = args.url || "https://notebooklm.google.com/notebook/a0f74dc3-ae95-4ddd-817b-a565677c6c5a";
    const pattern = args.pattern || '';

    console.log("🚀 Iniciando herramienta de limpieza de NotebookLM...");
    console.log(`📓 Cuaderno destino: ${notebookUrl}`);
    if (pattern) {
        console.log(`🔍 Filtro activo: Borrar solo archivos que contengan '${pattern}' en su nombre\n`);
    } else {
        console.log(`⚠️ ATENCIÓN: No has especificado un filtro --pattern. Esto podría borrar TODAS las fuentes si no tienes cuidado.\n`);
    }
    
    const transport = new StdioClientTransport({
        command: "C:\\Users\\josueba\\.local\\bin\\notebooklm-mcp.exe",
        args: []
    });

    const client = new Client({
        name: "notebooklm-cleaner",
        version: "1.0.0"
    }, {
        capabilities: {}
    });

    try {
        await client.connect(transport);
        console.log("✅ Conectado exitosamente al servidor MCP.");

        // Extract UUID from URL
        const notebookIdMatch = notebookUrl.match(/notebook\/([a-f0-9\-]+)/);
        const notebookId = notebookIdMatch ? notebookIdMatch[1] : notebookUrl;

        console.log("⏳ Obteniendo fuentes del cuaderno...");
        const getResult = await client.callTool({
            name: "notebook_get",
            arguments: { notebook_id: notebookId }
        }) as any;

        const textOutput = getResult.content?.[0]?.text || "";
        if (getResult.isError || textOutput.includes('"status":"error"')) {
            throw new Error(textOutput || "Error al obtener el cuaderno");
        }

        const notebookData = JSON.parse(textOutput);
        
        let sources = [];
        if (notebookData.notebook && Array.isArray(notebookData.notebook)) {
            // El formato es ["Titulo Notebook", [ [ ["uuid"], "Titulo Fuente", ... ], ... ] ]
            // Pero notebookData.notebook es en realidad [ ["Titulo Notebook", [ fuentes ]] ]
            const notebookEntry = notebookData.notebook[0];
            if (notebookEntry && Array.isArray(notebookEntry[1])) {
                sources = notebookEntry[1].map((s: any) => ({
                    id: s[0]?.[0],
                    title: s[1],
                    name: s[1]
                })).filter((s: any) => s.id && s.title);
            }
        } else if (notebookData.sources) {
            sources = notebookData.sources;
        }

        if (sources.length === 0) {
            console.log("ℹ️ El cuaderno no tiene ninguna fuente.");
            process.exit(0);
        }

        console.log(`📦 Encontradas ${sources.length} fuentes en total en el cuaderno.`);

        // Filter sources
        const toDelete = sources.filter((s: any) => {
            if (!pattern) return true; // if no pattern, select all
            const title = (s.title || s.name || "").toLowerCase();
            return title.includes(pattern.toLowerCase());
        });

        if (toDelete.length === 0) {
            console.log(`ℹ️ Ninguna fuente coincide con el filtro '${pattern}'.`);
            process.exit(0);
        }

        console.log(`\n🚨 Se van a ELIMINAR las siguientes ${toDelete.length} fuentes:`);
        for (const s of toDelete) {
            console.log(`   - [${s.id}] ${s.title || s.name}`);
        }
        console.log("\n⚠️ ESTA ACCIÓN ES IRREVERSIBLE.");

        const answer = await askQuestion("¿Estás seguro de que quieres eliminarlas? (s/N): ");
        if (answer.toLowerCase() !== 's') {
            console.log("🛑 Operación cancelada por el usuario.");
            process.exit(0);
        }

        console.log("\n🗑️ Iniciando borrado...");
        let deleted = 0;
        for (const s of toDelete) {
            try {
                await client.callTool({
                    name: "source_delete",
                    arguments: {
                        source_id: s.id,
                        confirm: true
                    }
                });
                deleted++;
                process.stdout.write(`\r[${deleted}/${toDelete.length}] ✅ Borrado: ${s.title || s.name}${' '.repeat(20)}`);
            } catch (err: any) {
                console.error(`\n❌ Error al borrar ${s.title || s.name}: ${err.message || String(err)}`);
            }
        }

        console.log(`\n\n🎉 Proceso completado. Se han eliminado ${deleted} fuentes.`);

    } catch (e: any) {
        console.error("\n❌ Error crítico:", e.message || e);
    } finally {
        // Necesario para evitar que el script se cuelgue esperando al proceso MCP
        process.exit(0);
    }
}

main();
