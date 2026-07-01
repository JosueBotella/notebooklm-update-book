import * as fs from 'fs';
import * as path from 'path';

const typesPath = path.resolve(__dirname, '../vnapp-refactor/src/integrations/supabase/types.ts');
const outputDir = path.resolve(__dirname, '../brain-notes/03_BBDD_Consolidada');
const outputFile = path.join(outputDir, 'Diccionario_Supabase_Completo.md');

function main() {
  if (!fs.existsSync(typesPath)) {
    console.error(`❌ Error: El archivo de tipos de Supabase no existe en ${typesPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const content = fs.readFileSync(typesPath, 'utf8');
  const lines = content.split('\n');

  let currentSection: string | null = null;
  const schema: {
    Tables: Record<string, { fields: { name: string; type: string }[]; relationships: any[] }>;
    Views: Record<string, { fields: { name: string; type: string }[] }>;
    Enums: Record<string, string>;
  } = {
    Tables: {},
    Views: {},
    Enums: {}
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect section
    if (line.includes('Tables: {')) {
      currentSection = 'Tables';
      continue;
    } else if (line.includes('Views: {') && currentSection === 'Tables') {
      currentSection = 'Views';
      continue;
    } else if (line.includes('Enums: {') && currentSection === 'Views') {
      currentSection = 'Enums';
      continue;
    } else if (line.trim() === 'CompositeTypes: {') {
      currentSection = 'CompositeTypes';
      continue;
    }

    if (currentSection === 'Tables') {
      const tableMatch = line.match(/^\s{6}(\w+):\s*\{/);
      if (tableMatch) {
        const tableName = tableMatch[1];
        schema.Tables[tableName] = { fields: [], relationships: [] };
        
        let j = i + 1;
        let inRow = false;
        let inRelationships = false;
        let rowBraceCount = 0;
        let relBraceCount = 0;
        
        let currentRel: any = {};
        
        while (j < lines.length) {
          const subLine = lines[j];
          
          if (subLine.includes('Row: {')) {
            inRow = true;
            rowBraceCount = 1;
            j++;
            continue;
          }
          
          if (inRow) {
            if (subLine.includes('{')) rowBraceCount++;
            if (subLine.includes('}')) rowBraceCount--;
            
            if (rowBraceCount === 0) {
              inRow = false;
            } else {
              const fieldMatch = subLine.match(/^\s{10}(\w+):\s*([^;]+);/);
              if (fieldMatch) {
                schema.Tables[tableName].fields.push({
                  name: fieldMatch[1],
                  type: fieldMatch[2].trim()
                });
              }
            }
          }

          if (subLine.includes('Relationships: [')) {
            inRelationships = true;
            relBraceCount = 1;
            j++;
            continue;
          }

          if (inRelationships) {
            if (subLine.includes('[')) relBraceCount++;
            if (subLine.includes(']')) relBraceCount--;
            
            if (relBraceCount === 0) {
              inRelationships = false;
            } else {
              // Parse relationship details
              if (subLine.includes('{')) {
                currentRel = {};
              }
              
              const nameMatch = subLine.match(/foreignKeyName:\s*["']([^"']+)["']/);
              const columnsMatch = subLine.match(/columns:\s*\[([^\]]+)\]/);
              const refRelationMatch = subLine.match(/referencedRelation:\s*["']([^"']+)["']/);
              const refColumnsMatch = subLine.match(/referencedColumns:\s*\[([^\]]+)\]/);
              
              if (nameMatch) currentRel.foreignKeyName = nameMatch[1];
              if (columnsMatch) {
                currentRel.columns = columnsMatch[1].split(',').map(s => s.replace(/["'\s]/g, ''));
              }
              if (refRelationMatch) currentRel.referencedRelation = refRelationMatch[1];
              if (refColumnsMatch) {
                currentRel.referencedColumns = refColumnsMatch[1].split(',').map(s => s.replace(/["'\s]/g, ''));
              }
              
              if (subLine.includes('}')) {
                if (currentRel.foreignKeyName) {
                  schema.Tables[tableName].relationships.push(currentRel);
                }
              }
            }
          }
          
          if (subLine.match(/^\s{6}\};/) || subLine.match(/^\s{6}\w+:\s*\{/)) {
            break;
          }
          j++;
        }
      }
    } else if (currentSection === 'Views') {
      const viewMatch = line.match(/^\s{6}(\w+):\s*\{/);
      if (viewMatch) {
        const viewName = viewMatch[1];
        schema.Views[viewName] = { fields: [] };
        let j = i + 1;
        let inRow = false;
        let rowBraceCount = 0;
        while (j < lines.length) {
          const subLine = lines[j];
          if (subLine.includes('Row: {')) {
            inRow = true;
            rowBraceCount = 1;
            j++;
            continue;
          }
          if (inRow) {
            if (subLine.includes('{')) rowBraceCount++;
            if (subLine.includes('}')) rowBraceCount--;
            if (rowBraceCount === 0) {
              inRow = false;
            } else {
              const fieldMatch = subLine.match(/^\s{10}(\w+):\s*([^;]+);/);
              if (fieldMatch) {
                schema.Views[viewName].fields.push({
                  name: fieldMatch[1],
                  type: fieldMatch[2].trim()
                });
              }
            }
          }
          if (subLine.match(/^\s{6}\};/) || subLine.match(/^\s{6}\w+:\s*\{/)) {
            break;
          }
          j++;
        }
      }
    } else if (currentSection === 'Enums') {
      const enumMatch = line.match(/^\s{6}(\w+):\s*([^;]+);/);
      if (enumMatch) {
        schema.Enums[enumMatch[1]] = enumMatch[2].trim();
      }
    }
  }

  // Generate Markdown
  let md = `# Diccionario de Base de Datos - Supabase (PostgreSQL)\n\n`;
  md += `Este documento contiene la definición completa del esquema de base de datos de **Supabase** de la aplicación, extraído automáticamente a partir del tipado oficial de TypeScript (\`src/integrations/supabase/types.ts\`).\n\n`;

  md += `## Índice de Contenidos\n\n`;
  md += `- [Tablas (${Object.keys(schema.Tables).length})](#tablas)\n`;
  md += `- [Vistas (${Object.keys(schema.Views).length})](#vistas)\n`;
  md += `- [Enums (${Object.keys(schema.Enums).length})](#enums-tipos-personalizados)\n\n`;

  md += `## Tablas\n\n`;
  Object.keys(schema.Tables).sort().forEach(table => {
    md += `### \`${table}\`\n\n`;
    md += `#### Columnas\n\n`;
    md += `| Columna | Tipo | Relación (FK) |\n`;
    md += `| --- | --- | --- |\n`;
    
    const relMap: Record<string, string> = {};
    schema.Tables[table].relationships.forEach(rel => {
      if (rel.columns && rel.referencedRelation) {
        rel.columns.forEach((col: string, idx: number) => {
          relMap[col] = `→ [\`${rel.referencedRelation}\`](#${rel.referencedRelation.toLowerCase()})(\`${rel.referencedColumns ? rel.referencedColumns[idx] : ''}\`)`;
        });
      }
    });

    schema.Tables[table].fields.forEach(f => {
      const fkStr = relMap[f.name] || '';
      md += `| \`${f.name}\` | \`${f.type}\` | ${fkStr} |\n`;
    });
    
    md += `\n`;
  });

  md += `## Vistas\n\n`;
  Object.keys(schema.Views).sort().forEach(view => {
    md += `### \`${view}\`\n\n`;
    md += `#### Columnas\n\n`;
    md += `| Columna | Tipo |\n`;
    md += `| --- | --- |\n`;
    schema.Views[view].fields.forEach(f => {
      md += `| \`${f.name}\` | \`${f.type}\` |\n`;
    });
    md += `\n`;
  });

  md += `## Enums (Tipos Personalizados)\n\n`;
  md += `| Enum | Valores Posibles |\n`;
  md += `| --- | --- |\n`;
  Object.keys(schema.Enums).sort().forEach(en => {
    md += `| \`${en}\` | \`${schema.Enums[en]}\` |\n`;
  });

  fs.writeFileSync(outputFile, md, 'utf8');
  console.log(`✅ Diccionario de Supabase creado en: ${outputFile}`);
  console.log(`📦 Tablas: ${Object.keys(schema.Tables).length}`);
  console.log(`📦 Vistas: ${Object.keys(schema.Views).length}`);
  console.log(`📦 Enums: ${Object.keys(schema.Enums).length}`);
}

main();
