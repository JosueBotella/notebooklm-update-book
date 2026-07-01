import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main() {
    const t = new StdioClientTransport({
        command: 'C:/Users/josueba/.local/bin/notebooklm-mcp.exe',
        args: []
    });
    const c = new Client({ name: 'test', version: '1' }, { capabilities: {} });
    await c.connect(t);
    console.log(JSON.stringify(await c.listTools(), null, 2));
    process.exit(0);
}
main();
