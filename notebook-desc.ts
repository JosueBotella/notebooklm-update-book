import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as os from 'os';
import * as path from 'path';

async function main() {
    const mcpPath = path.join(os.homedir(), '.local', 'bin', 'notebooklm-mcp.exe');
    const t = new StdioClientTransport({
        command: mcpPath,
        args: []
    });
    const c = new Client({ name: 'test', version: '1' }, { capabilities: {} });
    await c.connect(t);
    const res = await c.callTool({name: 'notebook_describe', arguments: {notebook_id: 'a0f74dc3-ae95-4ddd-817b-a565677c6c5a'}});
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
}
main();
