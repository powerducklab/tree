import {it,expect} from 'vitest';
import {buildOpenApiTree} from '../../src/adapters/openapi';
import {buildDocTree} from '../../src/adapters/doc';
const operation = {responses:{'200':{description:'OK',content:{'application/json':{schema:{type:'object',properties:{id:{type:'string'}}}}}}}};
const spec: any = {openapi:'3.2.0',info:{title:'Methods',version:'1'},servers:[{url:'https://example.test'}],paths:{'/items':{trace:operation,query:operation,additionalOperations:{PROPFIND:operation,'CUSTOM-VERB':operation}}}};
const expected = ['trace','query','propfind','custom-verb'];
it('preserves QUERY, TRACE and custom operations across consumers',()=>{
for(const build of [buildOpenApiTree,buildDocTree]) {const nodes:any[]=[];const visit=(n:any)=>{if(n.metadata?.method)nodes.push(n);for(const c of n.children??[])visit(c);};visit(build(spec).root); expect(nodes.map(n=>n.metadata.method).sort()).toEqual([...expected].sort());expect(nodes.find(n=>n.metadata.method==='propfind').metadata.pointer).toContain('additionalOperations/PROPFIND');}
});
