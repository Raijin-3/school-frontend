export interface DatabaseTable {
  name: string;
  displayName: string;
  description?: string;
  columns: Array<{
    name: string;
    type: 'INTEGER' | 'TEXT' | 'REAL' | 'BLOB' | 'NUMERIC';
    nullable?: boolean;
    primaryKey?: boolean;
    unique?: boolean;
    defaultValue?: string | number;
  }>;
  data: Record<string, any>[];
  indexes?: Array<{
    name: string;
    columns: string[];
    unique?: boolean;
  }>;
}

export interface PracticeExercise {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  tables: DatabaseTable[];
  questions: Array<{
    id: string;
    text: string;
    hint?: string;
    solution?: string;
    expectedColumns?: string[];
    expectedRowCount?: number;
    explanation?: string;
  }>;
}

export function generateDatabaseSchema(tables: DatabaseTable[]): string {
  let schema = '';
  
  for (const table of tables) {
    schema += `-- Table: ${table.displayName}\n`;
    if (table.description) {
      schema += `-- ${table.description}\n`;
    }
    
    schema += `CREATE TABLE ${table.name} (\n`;
    
    const columnDefs = table.columns.map(col => {
      let def = `  ${col.name} ${col.type}`;
      
      if (col.primaryKey) def += ' PRIMARY KEY';
      if (!col.nullable && !col.primaryKey) def += ' NOT NULL';
      if (col.unique) def += ' UNIQUE';
      if (col.defaultValue !== undefined) {
        def += ` DEFAULT ${typeof col.defaultValue === 'string' ? `'${col.defaultValue}'` : col.defaultValue}`;
      }
      
      return def;
    });
    
    schema += columnDefs.join(',\n') + '\n';
    schema += ');\n\n';
    
    // Add indexes
    if (table.indexes) {
      for (const index of table.indexes) {
        const uniqueKeyword = index.unique ? 'UNIQUE ' : '';
        schema += `CREATE ${uniqueKeyword}INDEX ${index.name} ON ${table.name} (${index.columns.join(', ')});\n`;
      }
      schema += '\n';
    }
    
    // Add sample data
    if (table.data.length > 0) {
      schema += `-- Sample data for ${table.name}\n`;
      const columns = Object.keys(table.data[0]);
      
      for (const row of table.data) {
        const values = columns.map(col => {
          const value = row[col];
          if (value === null) return 'NULL';
          return typeof value === 'string' ? `'${value}'` : value;
        }).join(', ');
        
        schema += `INSERT INTO ${table.name} (${columns.join(', ')}) VALUES (${values});\n`;
      }
      schema += '\n';
    }
  }
  
  return schema;
}