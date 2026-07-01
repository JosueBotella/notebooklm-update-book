# NotebookLM CLI Updater

Esta herramienta CLI es un puente automatizado que te permite conectar y sincronizar directorios de archivos Markdown (`.md`) de tu ordenador local directamente con tu cuenta de **Google NotebookLM** mediante el Model Context Protocol (MCP), con soporte nativo para **múltiples cuentas de usuario**.

---

## ⚙️ Prerrequisitos

Para poder utilizar este script en tu máquina, necesitas contar con lo siguiente:

1.  **Node.js** (versión 18.0.0 o superior).
2.  **Un gestor de paquetes de Node** (se recomienda **pnpm**, pero puedes usar `npm` o `yarn`).
3.  **El Servidor MCP de NotebookLM**: Tener instalado y configurado el servidor `notebooklm-mcp.exe` en tu sistema Windows (por defecto, el script buscará el ejecutable en `~/.local/bin/notebooklm-mcp.exe`).

---

## 📥 Instalación e Inicialización (Primera Vez)

Sigue estos pasos para poner en marcha el proyecto desde cero:

### 1. Clonar o descargar el proyecto
Descarga el proyecto en tu máquina local y accede a su directorio raíz:
```bash
git clone https://github.com/josuebaverdnatura/notebooklm-update-book.git
cd notebooklm-update-book
```

### 2. Instalar dependencias
Instala los paquetes necesarios definidos en el `package.json`:
```bash
pnpm install
```
*(Si no usas pnpm, ejecuta `npm install` o `yarn install`)*.

---

## 🔑 Flujo de Primer Uso (Paso a Paso)

### Paso 1: Verificar el estado
Comprueba que el script se conecta correctamente al servidor MCP y ve si tienes alguna sesión configurada:
```bash
pnpm tsx index.ts status
```

### Paso 2: Iniciar sesión con tu cuenta de Google
Registra e inicia sesión en la cuenta que quieres usar. El script creará un perfil local aislado y abrirá una ventana de Chrome para que te autentiques:
```bash
pnpm tsx index.ts login tu-correo@gmail.com
```
1.  Se abrirá una ventana visible de Chrome.
2.  Inicia sesión con tu cuenta de Google en esa ventana.
3.  Una vez completado el inicio de sesión y cargado el panel de NotebookLM, **regresa a la terminal** de comandos y presiona **`ENTER`**.
4.  El script guardará las cookies de esa sesión de forma segura y aislada en tu AppData local.

### Paso 3: Subir conocimiento a un cuaderno
Una vez logueado, puedes inyectar de manera masiva todos los archivos Markdown de cualquier carpeta local a tu cuaderno de NotebookLM:
```bash
pnpm tsx index.ts upload --path "C:\mis-proyectos\docs_md" --url "https://notebooklm.google.com/notebook/tu-uuid-de-cuaderno"
```
*   El script leerá todos los archivos `.md` de la ruta.
*   Consultará las fuentes existentes en tu cuaderno para evitar duplicados. Si detecta que un archivo ya existe con el mismo nombre, **lo eliminará antes de subir la nueva versión**.
*   Subirá las fuentes de una en una con un delay de seguridad de 1.5s para no saturar las cuotas de red.

---

## 🛠️ Comandos de la CLI

El script principal soporta una interfaz organizada en subcomandos:

*   **`pnpm tsx index.ts status`**: Muestra qué cuenta está activa actualmente y qué otras cuentas tienen sesiones guardadas de forma local en tu máquina.
*   **`pnpm tsx index.ts login <email>`**: Cambia instantáneamente a la sesión del correo indicado. Si no existe, inicia el flujo de autenticación en navegador.
*   **`pnpm tsx index.ts logout`**: Cierra la sesión activa actual y borra sus credenciales y perfil local.
*   **`pnpm tsx index.ts logout <email>`**: Borra la sesión de la cuenta específica indicada.
*   **`pnpm tsx index.ts logout --all`**: Borra todos los perfiles de sesión y credenciales guardados localmente.
*   **`pnpm tsx index.ts upload --path <ruta> [--url <url>]`**: Inicia la subida masiva de Markdowns al cuaderno indicado.

---

## 🧠 ¿Cómo funciona la gestión multicuenta por debajo?

El servidor MCP oficial de NotebookLM solo soporta por defecto una única sesión en disco (`chrome_profile`). Para superar esta limitación sin modificar el servidor:

1.  El CLI detecta y cierra cualquier proceso huérfano del navegador Chrome asociado al MCP para evitar bloqueos del sistema de archivos.
2.  Almacena cada sesión de usuario de forma aislada en carpetas nombradas por correo (`chrome_profile_<email>`).
3.  Al usar el comando `login <email>`, el script realiza un renombrado dinámico y atómico de la carpeta para poner el perfil del usuario solicitado en la ubicación que el MCP espera (`chrome_profile`), logrando un cambio de cuenta instantáneo y sin fricciones.
