import http from 'node:http';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const issuer = 'https://elus360.us.auth0.com/';
const audience = 'https://memo.elus360.com.br/mcp';
const origin = 'https://memo.elus360.com.br';
const bank = process.env.MEMORY_BANK || 'wandora_memory';
const upstream = process.env.HINDSIGHT_INTERNAL_URL || 'http://elus-memory-api:8888';
const apiKey = process.env.HINDSIGHT_API_TENANT_API_KEY;
const allowedSubjects = new Set((process.env.ALLOWED_AUTH0_SUBJECTS || '').split(',').map(x => x.trim()).filter(Boolean));
const keys = createRemoteJWKSet(new URL('.well-known/jwks.json', issuer));
const metadataPath = '/.well-known/oauth-protected-resource';
const scopedMetadataPath = metadataPath + '/mcp/' + bank;
// Auth0 Resource Parameter Compatibility maps this exact resource URI to the API audience.
const gatewayResource = audience;
const metadata = { resource: gatewayResource, authorization_servers: [issuer], scopes_supported: ['memory:read','memory:write'] };
if (!apiKey || !allowedSubjects.size) throw new Error('Missing Hindsight API key or ALLOWED_AUTH0_SUBJECTS allowlist');

const audit = (stage, status) => console.info(JSON.stringify({component:'elus-mcp',stage,status}));
const send = (res, status, obj, headers={}) => { res.writeHead(status, {'content-type':'application/json', 'cache-control':'no-store',...headers});res.end(JSON.stringify(obj)); };
const challenge = () => 'Bearer resource_metadata="' + origin + scopedMetadataPath + '", scope="memory:read memory:write"';

http.createServer(async (req,res) => {
  try {
    const path = new URL(req.url, origin).pathname;
    if (req.method==='GET' && (path===metadataPath || path===metadataPath+'/' || path===scopedMetadataPath || path===scopedMetadataPath+'/')) return send(res,200,metadata);
    if (req.method==='GET' && path==='/__elus_gateway_health') return send(res,200,{status:'ok'});
    if (!(path==='/mcp/'+bank || path==='/mcp/'+bank+'/')) return send(res,404,{error:'not_found'});
    console.info(JSON.stringify({component:'elus-mcp',stage:'request',method:req.method,authorized: Boolean(req.headers.authorization),protocol:req.headers['mcp-protocol-version']||null}));
    const bearer = /^Bearer (.+)$/i.exec(req.headers.authorization || '');
    if (!bearer) { audit('missing_bearer',401); return send(res,401,{error:'unauthorized'},{'www-authenticate':challenge()}); }
    let payload;
    try {
      ({payload}=await jwtVerify(bearer[1],keys,{issuer,audience,algorithms:['RS256'],clockTolerance:5}));
    } catch {
      audit('invalid_token',401); return send(res,401,{error:'invalid_token'},{'www-authenticate':challenge()});
    }
    if (!allowedSubjects.has(payload.sub)) { audit('subject_denied',403); return send(res,403,{error:'account_not_allowed'}); }
    const scopes = new Set(String(payload.scope || '').split(/\s+/));
    if (!scopes.has('memory:read') || !scopes.has('memory:write')) { audit('scope_denied',403); return send(res,403,{error:'insufficient_scope'}); }
    const headers = {};
    for(const key of ['content-type','accept','mcp-session-id','mcp-protocol-version','last-event-id']) {
      if(req.headers[key]) headers[key]=req.headers[key];
    }
    headers.authorization='Bearer '+apiKey;
    const target = new URL(path,upstream);
    const controller = new AbortController();
    const response = await fetch(target,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:req,duplex:'half',signal:controller.signal,redirect:'manual'});
    const outHeaders={};
    for (const [k,v] of response.headers) if(!['transfer-encoding','connection','content-length','set-cookie'].includes(k)) outHeaders[k]=v;
    audit('upstream_response',response.status);
    res.writeHead(response.status,outHeaders);
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  } catch(e) {
    audit('upstream_failure',502);
    if(!res.headersSent) send(res,502,{error:'upstream_failure'});
    else res.destroy();
  }
}).listen(Number(process.env.PORT || 8080),'0.0.0.0');
