import {DOMParser} from '../.local-providers/anime-sdk/node_modules/linkedom/esm/index.js';
import {HttpClient,startServer,AnimeParadiseProvider} from '../.local-providers/anime-sdk/dist/index.js';
globalThis.DOMParser=DOMParser;
const client=new HttpClient({timeoutMs:30000,retry:false});
// Relay video through the app's tokenized media route, not an open SDK proxy.
const server=startServer({providers:[new AnimeParadiseProvider(client)],port:3031,proxy:false});
process.on('SIGTERM',()=>server.close(()=>process.exit()));
