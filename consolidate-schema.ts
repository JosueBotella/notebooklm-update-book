import * as fs from 'fs';
import * as path from 'path';

const SCHEMAS_DIR = path.resolve(__dirname, '../brain-notes/03_BBDD_y_Esquemas');
const OUTPUT_DIR = path.resolve(__dirname, '../brain-notes/03_BBDD_Consolidada');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'Diccionario_BBDD_Completo.md');

function main() {
  if (!fs.existsSync(SCHEMAS_DIR)) {
    console.error(`❌ Error: El directorio ${SCHEMAS_DIR} no existe.`);
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const allEntries = fs.readdirSync(SCHEMAS_DIR);
  
  const indexFile = allEntries.find(f => f === '_INDEX.md');
  const domainFiles = allEntries.filter(f => f.startsWith('_dominio_') && f.endsWith('.md'));
  const tableFiles = allEntries.filter(f => !f.startsWith('_dominio_') && f !== '_INDEX.md' && f.endsWith('.md'));

  let content = `# DICCIONARIO Y ESQUEMA COMPLETO DE BBDD\n\nEste documento consolida toda la información de la base de datos: dominios, diagramas ER y la estructura detallada de todas las tablas.\n\n---\n\n`;

  // 1. Index
  if (indexFile) {
    const p = path.join(SCHEMAS_DIR, indexFile);
    if (fs.statSync(p).isFile()) {
        content += `# ÍNDICE GENERAL\n\n`;
        content += fs.readFileSync(p, 'utf-8');
        content += `\n\n---\n\n`;
    }
  }

  // 2. Domains
  content += `# DOMINIOS Y DIAGRAMAS ER\n\n`;
  for (const file of domainFiles) {
    const p = path.join(SCHEMAS_DIR, file);
    if (fs.statSync(p).isFile()) {
        content += `## Archivo: ${file}\n\n`;
        content += fs.readFileSync(p, 'utf-8');
        content += `\n\n---\n\n`;
    }
  }

  // 3. Tables
  content += `# DETALLE DE TABLAS\n\n`;
  for (const file of tableFiles) {
    const p = path.join(SCHEMAS_DIR, file);
    if (fs.statSync(p).isFile()) {
        content += `## Tabla: ${file.replace('.md', '')}\n\n`;
        content += fs.readFileSync(p, 'utf-8');
        content += `\n\n---\n\n`;
    }
  }

  fs.writeFileSync(OUTPUT_FILE, content);
  console.log(`✅ Diccionario completo creado en: ${OUTPUT_FILE}`);
  console.log(`📦 Dominios consolidados: ${domainFiles.length}`);
  console.log(`📦 Tablas consolidadas: ${tableFiles.length}`);
}

main();
