# NotebookLM CLI Updater

Esta herramienta CLI es un puente automatizado de última generación que te permite conectar y sincronizar directorios de archivos Markdown (`.md`) locales directamente con tu cuenta de **Google NotebookLM** mediante el Model Context Protocol (MCP). 

Cuenta con soporte nativo para **múltiples cuentas de usuario**, inyecciones granulares declarativas por proyecto y comandos de consulta/limpieza automatizados.

---

## ⚙️ Prerrequisitos

Para poder utilizar este script en tu máquina, necesitas contar con lo siguiente:

1. **Node.js** (versión 18.0.0 o superior).
2. **Un gestor de paquetes** (se recomienda **pnpm**, pero puedes usar `npm` o `yarn`).
3. **El Servidor MCP de NotebookLM**: Tener instalado y configurado el servidor `notebooklm-mcp.exe` en tu sistema Windows (por defecto, el script buscará el ejecutable en `~/.local/bin/notebooklm-mcp.exe`).

---

## 📥 Instalación e Inicialización Global

Sigue estos pasos para poner en marcha el CLI y dejarlo enlazado globalmente en tu sistema operativo:

### 1. Clonar el proyecto e instalar dependencias
Descarga el proyecto en tu máquina local y accede a su directorio raíz:
```bash
git clone https://github.com/JosueBotella/notebooklm-update-book.git
cd notebooklm-update-book
pnpm install
```

### 2. Enlazar el comando global
Haz que el comando **`notebook`** esté disponible desde cualquier terminal y en cualquier carpeta de tu disco:
```bash
npm link
```
*(Ahora podrás correr `notebook <comando>` directamente en cualquier directorio sin anteponer `pnpm tsx` ni rutas absolutas)*.

---

## 🔑 Flujo de Primer Uso (Paso a Paso)

### Paso 1: Iniciar sesión con tu cuenta de Google
Registra tu correo electrónico. El CLI lanzará de forma visual tu Google Chrome real con el puerto de depuración DevTools habilitado.
```bash
notebook login tu-correo@gmail.com
```
1. Se abrirá una ventana de Chrome apuntando a NotebookLM.
2. Inicia sesión en tu cuenta de Google si es necesario.
3. El CLI detectará el login de forma automática, extraerá tus tokens/cookies y pausará el navegador guardándolos de forma aislada.

### Paso 2: Consultar y seleccionar tu cuaderno
Lista tus cuadernos en NotebookLM y selecciona el cuaderno de trabajo activo:
```bash
notebook list
notebook select <notebook_uuid>
```

### Paso 3: Subir conocimiento
```bash
notebook upload --path "C:\mis-proyectos\docs_md"
```
* El script leerá los archivos `.md` de la ruta.
* Si el archivo ya existe en tu cuaderno, **lo eliminará antes de subir la nueva versión** para evitar fuentes duplicadas.

---

## 📦 Configuración Declarativa por Targets (`notebook-sync.json`)

Para evitar tener que escribir largas rutas y URLs al subir información, puedes crear un archivo de configuración llamado `notebook-sync.json` en la raíz de tus proyectos (como en `vnapp-refactor`).

### Estructura de Ejemplo:
```json
{
  "project_name": "vnapp-refactor",
  "targets": {
    "docs": {
      "notebook_id": "a0f74dc3-ae95-4ddd-817b-a565677c6c5a",
      "path": "./docs_md",
      "files": [
        "memoria_arquitectura_supabase.md",
        "PROGRESO.md",
        "refactor_plan.md"
      ]
    },
    "schema": {
      "notebook_id": "a0f74dc3-ae95-4ddd-817b-a565677c6c5a",
      "path": "C:/GIT/brain-notes/03_BBDD_Consolidada",
      "files": [
        "Diccionario_BBDD_Completo.md"
      ]
    }
  }
}
```

### Comandos de Subida Declarativa:

1. **Subida en el directorio actual**: Si estás dentro de la carpeta del proyecto, ejecuta el target deseado:
   ```bash
   notebook upload docs
   ```
2. **Subida cruzada entre proyectos**: Puedes ejecutar subidas de targets de tus proyectos desde **cualquier directorio** de tu PC sin necesidad de moverte de carpeta:
   ```bash
   notebook upload vnapp-refactor docs
   notebook upload vnapp-refactor schema
   ```
   *(El CLI registra y recuerda dinámicamente las rutas físicas de tus proyectos la primera vez que se ejecutan).*

---

## 🛠️ Comandos de la CLI

* **`notebook status`**: Muestra la cuenta activa, las sesiones guardadas y las rutas de tus proyectos vinculados localmente.
* **`notebook login <email>`**: Inicia sesión o cambia a la cuenta especificada. Si la sesión guardada caducó, lanza automáticamente la renovación.
* **`notebook list`**: Lista los cuadernos disponibles en la cuenta activa con su ID, nombre, total de fuentes y fecha de modificación.
* **`notebook select <id>`**: Selecciona el cuaderno por defecto para las subidas del canal de chat.
* **`notebook upload <target>`**: Sube los archivos definidos en el target de tu `notebook-sync.json` local.
* **`notebook upload <project> <target>`**: Sube el target de un proyecto registrado desde cualquier ubicación.
* **`notebook upload --path <ruta>`**: Subida tradicional indicando una carpeta del disco.
* **`notebook cleanup`**: Cierra procesos huérfanos de Chrome y purga bloqueos y archivos corruptos del perfil de depuración en AppData.
* **`notebook logout`**: Cierra sesión para la cuenta activa.
* **`notebook logout <email>`**: Elimina la sesión y el perfil de la cuenta indicada.
* **`notebook logout --all`**: Borra todas las sesiones y perfiles guardados en el disco.
