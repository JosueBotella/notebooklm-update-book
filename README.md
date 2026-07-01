# NotebookLM Updater (CLI)

Este mini-proyecto es una herramienta de línea de comandos (CLI) creada para actuar como un **puente automatizado** entre tu disco duro local y tu cuenta de Google NotebookLM. 

Su único propósito (siguiendo el Principio de Responsabilidad Única o SRP) es coger una carpeta llena de archivos Markdown (`.md`) e inyectarlos masivamente en un cuaderno de NotebookLM usando el protocolo MCP (Model Context Protocol).

---

## 🧠 ¿Por qué este proyecto? (Lógica de Arquitectura)

En lugar de mezclar la lógica de "Subir a NotebookLM" dentro del proyecto que "Genera los esquemas de base de datos" (`db-schema-generator`), hemos separado las responsabilidades. 
De esta forma:
1. `db-schema-generator` solo se preocupa de leer MySQL y escupir Markdowns.
2. `notebooklm-update-book` solo se preocupa de leer Markdowns (vengan de donde vengan) y enviarlos a Google.

Esto te permite usar esta misma herramienta para subir esquemas de BBDD, documentación de negocio de React (`vnapp-refactor`), actas de reuniones, o cualquier carpeta de texto a tu cerebro de IA.

---

## 🛠️ Librerías Utilizadas

Para mantener el proyecto lo más ligero posible, hemos usado el mínimo de dependencias externas:

1. **`@modelcontextprotocol/sdk`**: Es la librería oficial que nos permite "hablar" con servidores MCP. En lugar de hacer complejas peticiones HTTP a la API privada de Google, esta librería se conecta al proceso `notebooklm-mcp.exe` que está en tu ordenador y le manda comandos estructurados.
2. **`tsx`**: En el mundo de Node.js, los archivos `.ts` (TypeScript) no se pueden ejecutar directamente, hay que transpilarlos a `.js` (JavaScript) primero usando el comando `tsc`. `tsx` es un motor de ejecución en tiempo real que hace esta conversión al vuelo en memoria. Nos ahorra el paso de compilar.
3. **`fs` y `path` (Nativas de Node.js)**: 
   - `fs` (File System): Nos permite leer el contenido de las carpetas locales (`fs.readdirSync`) y leer el texto de cada archivo (`fs.readFileSync`).
   - `path`: Nos ayuda a unir rutas de carpetas de forma segura en Windows (con sus barras `\` invertidas).
4. **`typescript` y `@types/node`**: Librerías de desarrollo que proveen el tipado estático (el superpoder de TypeScript) y el autocompletado en tu editor VSCode.

---

## 👨‍💻 Lógica de Programación (Paso a Paso)

Si abres `index.ts`, verás que el código sigue un flujo de trabajo muy secuencial:

### 1. Lectura de Argumentos (Argument Parsing)
En lugar de instalar una librería pesada como `commander` o `minimist`, hemos hecho una función nativa `parseArgs()`. 
Esta función lee lo que escribes en la terminal (`process.argv`). Si escribes `--path "C:\mis-docs"`, el código busca los guiones `--`, coge la palabra clave (`path`) y le asigna el valor que va justo detrás. Devuelve un objeto tipo diccionario (un `Record<string, string>` en TypeScript).

### 2. Inicialización del Cliente MCP
Utilizamos la clase `StdioClientTransport` de la librería MCP. Esto significa que no nos conectamos por Internet a un servidor, sino que levantamos un proceso oculto en tu propia terminal (el `.exe` de FastMCP) y hablamos con él mandándole texto por la "Entrada Estándar" (Stdio).

### 3. Lectura de Directorio
Con `fs.readdirSync(targetDir)` obtenemos una lista de todos los archivos de la carpeta. Luego usamos un `.filter()` funcional para quedarnos estrictamente con los que terminan en `.md`.

### 4. El Bucle de Subida y el "Delay"
Usamos un bucle `for...of`. Dentro de él, leemos el texto del archivo y ejecutamos:
```typescript
await client.callTool({ name: "notebook_add_text", arguments: { ... } })
```
Aquí le pedimos al servidor MCP que use su herramienta `notebook_add_text`. 
**Nota didáctica sobre concurrencia:** Justo después de la subida, usamos `await sleep(1500);`. Esto es una pausa artificial de 1.5 segundos. Si le tirásemos los 393 archivos de golpe a los servidores de Google en el mismo milisegundo, su firewall nos banearía por ataque DDoS (Rate Limiting).

### 5. ¿Qué pasa si falla o no conecta? (Error Handling)
Esta es la parte más interesante de este script. Usamos un bloque `try/catch`.
Si se corta la conexión en red con el ejecutable local, la promesa `callTool` explota y el `catch (err)` la captura, parando el programa.

**El "Engaño" de FastMCP (Fallo silencioso):**
Al interactuar con la API de Google, nos dimos cuenta de que si nuestra sesión de usuario en Google (la cookie) había caducado, el servidor MCP no lanzaba una excepción real (`isError: true`). En su lugar, el servidor devolvía un mensaje de éxito (`isError: false`) pero colaba el error dentro del texto de la respuesta como un JSON camuflado: `{"status":"error","error":"RPC Error 16: Authentication expired"}`.

Para arreglar este fallo silencioso, tuvimos que programar la máquina para que inspeccionara el interior del mensaje de éxito:
```typescript
const textOutput = result.content?.[0]?.text || "";
if (textOutput.includes('"status":"error"')) {
    throw new Error(textOutput); // Forzamos una explosión controlada
}
```

### 6. Gestión de Sesión Caducada
Si la excepción forzada contiene las palabras "auth", "session" o "login", el script no solo escupe el error técnico en rojo, sino que hace una **Parada de Emergencia** y le imprime al usuario un mensaje humano y amigable indicándole la solución: ejecutar `notebooklm-mcp-auth`.

---

## 📚 Conceptos Clave de TypeScript para Aprender Aquí

1. **Tipado Fuerte**: Fíjate que al declarar funciones o variables, añadimos dos puntos y el tipo (ej: `ms: number`). Esto hace que si intentas pasarle un texto a la función `sleep`, VSCode te pinte un error antes de ejecutar nada.
2. **Asincronía (`async / await`)**: JavaScript no puede "esperar" congelando el programa. En su lugar usa Promesas. Al poner `async` en `function main()`, podemos usar `await` delante de tareas pesadas (como hablar con el MCP o hacer el `sleep`). Esto "pausa" esa línea hasta que el trabajo termina, permitiendo escribir código que se lee de arriba a abajo en vez de usar callbacks enredados.
