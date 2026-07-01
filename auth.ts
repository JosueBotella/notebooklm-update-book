import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawnSync } from 'child_process';
import * as readline from 'readline';
import * as os from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Directorio del MCP en AppData de Windows
const mcpDataDir = path.join(process.env.LOCALAPPDATA || '', 'notebooklm-mcp', 'Data');
const configFilePath = path.join(mcpDataDir, 'auth_config.json');

export interface AuthConfig {
    active_account?: string;
    saved_accounts?: string[];
}

function sanitizeEmail(email: string): string {
    return email.replace(/[^a-zA-Z0-9.@_\-]/g, '_');
}

function waitEnter(): Promise<void> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => rl.question('', () => {
        rl.close();
        resolve();
    }));
}

function getChromePath(): string {
    const paths = [
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    return 'chrome.exe';
}

// Función para matar procesos de Chrome huérfanos asociados al MCP
export function killMcpChrome() {
    try {
        console.log("⏳ Buscando y cerrando procesos bloqueantes de Chrome en segundo plano...");
        const command = `powershell -Command "Get-CimInstance Win32_Process -Filter \\"name='chrome.exe'\\" | Where-Object { $_.CommandLine -like '*notebooklm-mcp*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`;
        execSync(command, { stdio: 'ignore' });
        // Pausa breve para asegurar que el SO libera los locks del sistema de archivos
        execSync(`powershell -Command "Start-Sleep -Milliseconds 500"`);
    } catch (e) {
        // Ignorar errores
    }
}

export function readConfig(): AuthConfig {
    if (!fs.existsSync(configFilePath)) {
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
    } catch (e) {
        return {};
    }
}

export function writeConfig(config: AuthConfig) {
    fs.mkdirSync(mcpDataDir, { recursive: true });
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf-8');
}

export async function switchAccount(email: string, client: Client) {
    killMcpChrome();
    const config = readConfig();
    const currentActive = config.active_account;

    const activeProfilePath = path.join(mcpDataDir, 'chrome_profile');
    let skipRotation = false;
    let isNewLogin = false;
    if (currentActive === email && fs.existsSync(activeProfilePath)) {
        console.log(`ℹ️ La cuenta ${email} ya está activa. Verificando estado de la sesión...`);
        skipRotation = true;
    }

    if (!skipRotation) {
        // 1. Respaldar la cuenta activa actual si existe
        if (currentActive && fs.existsSync(activeProfilePath)) {
            const backupPath = path.join(mcpDataDir, `chrome_profile_${sanitizeEmail(currentActive)}`);
            if (fs.existsSync(backupPath)) {
                // Eliminar backup viejo antes de renombrar
                fs.rmSync(backupPath, { recursive: true, force: true });
            }
            try {
                fs.renameSync(activeProfilePath, backupPath);
                console.log(`💾 Sesión de ${currentActive} guardada.`);
            } catch (e: any) {
                console.error(`❌ Error guardando sesión de ${currentActive}: ${e.message}`);
                console.log("Intentando forzar el cerrado de procesos de Chrome...");
                killMcpChrome();
                fs.renameSync(activeProfilePath, backupPath);
            }
        }

        // 2. Cargar la nueva cuenta o iniciarla de cero
        const newAccountProfilePath = path.join(mcpDataDir, `chrome_profile_${sanitizeEmail(email)}`);

        if (fs.existsSync(newAccountProfilePath)) {
            // Si ya existe la carpeta de la nueva cuenta, la restauramos como activa
            if (fs.existsSync(activeProfilePath)) {
                fs.rmSync(activeProfilePath, { recursive: true, force: true });
            }
            fs.renameSync(newAccountProfilePath, activeProfilePath);
            console.log(`🔄 Sesión de ${email} restaurada.`);
        } else {
            // No existe perfil guardado para esta cuenta
            if (fs.existsSync(activeProfilePath)) {
                if (!currentActive) {
                    // Importación implícita de sesión huérfana
                    console.log(`ℹ️ Asociando sesión activa existente en disco a la cuenta: ${email}`);
                } else {
                    // Si había otra cuenta activa (que ya respaldamos arriba), limpiamos la carpeta activa
                    fs.rmSync(activeProfilePath, { recursive: true, force: true });
                    fs.mkdirSync(activeProfilePath, { recursive: true });
                    isNewLogin = true;
                    console.log(`🆕 Creando nueva sesión para ${email}...`);
                }
            } else {
                fs.mkdirSync(activeProfilePath, { recursive: true });
                isNewLogin = true;
                console.log(`🆕 Creando nueva sesión para ${email}...`);
            }
        }

        // Actualizar configuración
        config.active_account = email;
        if (!config.saved_accounts) config.saved_accounts = [];
        if (!config.saved_accounts.includes(email)) {
            config.saved_accounts.push(email);
        }
        writeConfig(config);
    }

    // 3. Verificar si la sesión es válida llamando a get_health
    console.log("⏳ Verificando estado de la sesión...");
    let isAuthenticated = false;
    try {
        const healthResult = await client.callTool({ name: "get_health", arguments: {} }) as any;
        const textOutput = healthResult.content?.[0]?.text || "{}";
        
        try {
            const healthData = JSON.parse(textOutput);
            if (healthData.success && healthData.data && healthData.data.authenticated) {
                isAuthenticated = true;
            } else if (textOutput.includes('"authenticated":true') || textOutput.includes('"authenticated": true')) {
                isAuthenticated = true;
            }
        } catch (e) {
            if (textOutput.includes('"authenticated":true') || textOutput.includes('"authenticated": true')) {
                isAuthenticated = true;
            }
        }
    } catch (e) {
        // Ignorar y forzar re-login
    }

    if (!isAuthenticated) {
        if (!isNewLogin) {
            console.log("⚠️ La sesión guardada ha caducado o no es válida. Iniciando renovación...");
        }
        console.log("\n🔑 Se abrirá una ventana de Chrome para que inicies sesión en Google.");
        console.log("👉 Por favor, inicia sesión con la cuenta: " + email);
        console.log("⏳ Tienes hasta 10 minutos para completar el inicio de sesión...");
        
        try {
            console.log("⏳ Forzando el lanzamiento de Google Chrome nativo...");
            const chromePath = getChromePath();
            const activeProfilePath = path.join(mcpDataDir, 'chrome_profile');
            const url = "https://notebooklm.google.com";

            // Lanzar Chrome nativo en Windows
            const { spawn } = require('child_process');
            const chromeProcess = spawn(chromePath, [
                `--user-data-dir=${activeProfilePath}`,
                `--remote-debugging-port=9222`,
                `--remote-allow-origins=*`,
                `--no-first-run`,
                url
            ], { detached: true, stdio: 'ignore' });
            chromeProcess.unref();

            console.log("🚀 Google Chrome abierto. Por favor, inicia sesión en la ventana del navegador.");
            console.log("⏳ Esperando a que el extractor de tokens se conecte...");
            
            // Pausa de 3 segundos para que el proceso de Chrome inicialice
            await new Promise(resolve => setTimeout(resolve, 3000));

            const mcpAuthPath = path.join(os.homedir(), '.local', 'bin', 'notebooklm-mcp-auth.exe');
            
            // Ejecutar el extractor de tokens apuntando a la ventana en puerto 9222
            spawnSync(mcpAuthPath, ['--no-auto-launch'], { stdio: 'inherit', shell: true });
            
            console.log("\n⏳ Verificando autenticación...");
            const healthResult = await client.callTool({ name: "get_health", arguments: {} }) as any;
            const textOutput = healthResult.content?.[0]?.text || "{}";
            
            try {
                const healthData = JSON.parse(textOutput);
                if (healthData.success && healthData.data && healthData.data.authenticated) {
                    console.log(`🎉 ¡Autenticado exitosamente como ${email}!`);
                } else if (textOutput.includes('"authenticated":true') || textOutput.includes('"authenticated": true')) {
                    console.log(`🎉 ¡Autenticado exitosamente como ${email}!`);
                } else {
                    console.warn("⚠️ Advertencia: No pudimos verificar el estado de autenticación. Es posible que tengas que volver a intentarlo.");
                }
            } catch (err) {
                if (textOutput.includes('"authenticated":true') || textOutput.includes('"authenticated": true')) {
                    console.log(`🎉 ¡Autenticado exitosamente como ${email}!`);
                } else {
                    console.warn("⚠️ Advertencia: No pudimos verificar la respuesta de salud.");
                }
            }
        } catch (authErr: any) {
            console.error("❌ Error al ejecutar la herramienta de login interactivo:", authErr.message || authErr);
        }
    } else {
        console.log(`✅ Conectado exitosamente como ${email}.`);
    }
}

export function logout(email?: string) {
    killMcpChrome();
    const config = readConfig();
    const activeProfilePath = path.join(mcpDataDir, 'chrome_profile');

    if (email) {
        const targetEmail = email.trim();
        const targetPath = path.join(mcpDataDir, `chrome_profile_${sanitizeEmail(targetEmail)}`);
        
        if (fs.existsSync(targetPath)) {
            fs.rmSync(targetPath, { recursive: true, force: true });
            console.log(`🗑️ Datos de sesión eliminados para la cuenta: ${targetEmail}`);
        }
        
        if (config.active_account === targetEmail) {
            if (fs.existsSync(activeProfilePath)) {
                fs.rmSync(activeProfilePath, { recursive: true, force: true });
            }
            config.active_account = undefined;
            console.log(`🚪 Has cerrado sesión de la cuenta activa actual.`);
        }
        
        if (config.saved_accounts) {
            config.saved_accounts = config.saved_accounts.filter(acc => acc !== targetEmail);
        }
        writeConfig(config);
    } else {
        const currentActive = config.active_account;
        if (!currentActive) {
            console.log("ℹ️ No hay ninguna cuenta activa actualmente.");
            return;
        }

        if (fs.existsSync(activeProfilePath)) {
            fs.rmSync(activeProfilePath, { recursive: true, force: true });
            console.log(`🗑️ Datos de sesión eliminados para la cuenta activa: ${currentActive}`);
        }
        
        config.active_account = undefined;
        if (config.saved_accounts) {
            config.saved_accounts = config.saved_accounts.filter(acc => acc !== currentActive);
        }
        writeConfig(config);
        console.log(`🚪 Has cerrado sesión exitosamente.`);
    }
}

export function logoutAll() {
    killMcpChrome();
    const config = readConfig();
    
    // Eliminar perfil activo
    const activeProfilePath = path.join(mcpDataDir, 'chrome_profile');
    if (fs.existsSync(activeProfilePath)) {
        fs.rmSync(activeProfilePath, { recursive: true, force: true });
    }

    // Eliminar perfiles guardados
    if (config.saved_accounts) {
        for (const acc of config.saved_accounts) {
            const backupPath = path.join(mcpDataDir, `chrome_profile_${sanitizeEmail(acc)}`);
            if (fs.existsSync(backupPath)) {
                fs.rmSync(backupPath, { recursive: true, force: true });
            }
        }
    }

    // Eliminar archivo de configuración de auth
    if (fs.existsSync(configFilePath)) {
        fs.unlinkSync(configFilePath);
    }
    
    console.log("🗑️ Se han cerrado todas las sesiones y se han eliminado todos los perfiles de Chrome locales.");
}

export function printStatus() {
    const config = readConfig();
    const active = config.active_account;
    const saved = config.saved_accounts || [];

    console.log("\n📊 ESTADO DE CONEXIONES NOTEBOOKLM:\n");
    if (active) {
        console.log(`🟢 Cuenta activa actual: \x1b[36m${active}\x1b[0m`);
    } else {
        console.log("🔴 No hay ninguna cuenta activa actualmente. Usa 'tsx index.ts login <email>' para conectar una.");
    }

    console.log("\n💾 Cuentas con sesiones guardadas localmente:");
    if (saved.length === 0) {
        console.log("   - Ninguna cuenta registrada.");
    } else {
        for (const acc of saved) {
            const statusIndicator = acc === active ? "👉 (Activa)" : "";
            console.log(`   - 📧 ${acc} ${statusIndicator}`);
        }
    }
    console.log("");
}
