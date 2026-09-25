import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { imageRow } from './helpers/websiteImageFixtures.js';

// Every database/cache method used here is stubbed; never load production .env.
process.env.DATABASE_URL='postgresql://fixture:fixture@127.0.0.1:1/fixture';
const [{default:prisma},{default:redis},{default:warehouses},controller]=await Promise.all([
  import('../models/prismaClient.js'),import('../services/redisService.js'),
  import('../services/warehouseService.js'),import('../controllers/warehouseController.js'),
]);
after(()=>prisma.$disconnect());
const response=()=>({headers:{},code:200,set(k,v){this.headers[k]=v;return this;},status(v){this.code=v;return this;},json(v){this.body=v;return this;}});
function stub(t,target,key,fn) {
  const before=target[key];target[key]=t.mock.fn(fn);t.after(()=>{target[key]=before;});return target[key];
}
function setup(t) {
  const state={rows:[imageRow(1),imageRow(2,'OUTDOOR','T2'),imageRow(99,'OUTDOOR','T1',{websiteDecision:'BLOCK'})],fail:false};
  const warehouse={id:1,city:'Test City',totalSpaceSqft:[10000],warehouseType:'PEB',warehouseData:null,
    photos:'https://fixture.r2.dev/99.jpg',photosWebp:'https://fixture.r2.dev/webp/99.webp',media:{images:['https://fixture.r2.dev/99.jpg']}};
  const cache=new Map();
  t.mock.method(redis,'get',async key=>cache.get(key));
  t.mock.method(redis,'setEx',async(key,ttl,data)=>cache.set(key,data));
  const list=stub(t,prisma,'$queryRaw',async sql=>sql.text.includes('count(*)')?[{total:1}]:[warehouse]);
  stub(t,prisma,'$transaction',async promises=>Promise.all(promises));
  stub(t,prisma.warehouse,'findUnique',async()=>warehouse);
  const lookup=stub(t,prisma,'$queryRawUnsafe',async()=>{if(state.fail)throw new Error('offline');return state.rows;});
  return {state,warehouse,cache,list,lookup};
}
test('public list and detail return identical selected pairs with no rejected legacy URLs or private assessments',async t=>{
  const h=setup(t),list=response(),detail=response();
  await controller.getWarehouses({query:{},headers:{}},list);
  await controller.getWarehouseById({params:{id:'1'},headers:{}},detail);
  assert.equal(list.code,200);assert.equal(detail.code,200);
  assert.deepEqual(list.body.data[0].images,detail.body.images);
  assert.deepEqual(detail.body.photos,['https://fixture.r2.dev/1.jpg','https://fixture.r2.dev/2.jpg']);
  assert.ok(!JSON.stringify([list.body,detail.body]).includes('/99.'));
  assert.ok(!Object.hasOwn(detail.body,'media'));assert.ok(!JSON.stringify(detail.body).includes('sourceSha256'));
  assert.equal(list.headers['X-Wareongo-Image-Policy'],'approved-4-8-v1');
  assert.equal(detail.headers['X-Wareongo-Image-Policy'],'approved-4-8-v1');
  assert.ok(![...h.cache.values()][0].includes('fixture.r2.dev'));
});
test('cache hits re-read approvals and current membership without rerunning the catalogue query',async t=>{
  const h=setup(t);
  const first=await warehouses.getWarehouses();assert.equal(first.data[0].images.length,2);
  h.state.rows=[{...imageRow(1),websiteDecision:'BLOCK'},imageRow(3,'OUTDOOR')];
  const next=await warehouses.getWarehouses();
  assert.deepEqual(next.data[0].images.map(r=>r.id),[3]);
  assert.equal(h.list.mock.callCount(),2,'one page query plus one count query');
  assert.equal(h.lookup.mock.callCount(),2,'one fresh approval lookup per request');
});
test('all-pending, all-blocked, missing and unavailable approvals yield explicit empty galleries on both routes',async t=>{
  const h=setup(t);
  for(const rows of [[imageRow(1,'INDOOR','T1',{websiteStatus:'PENDING'})],
    [imageRow(2,'INDOOR','T1',{websiteDecision:'BLOCK'})],[],[imageRow(1)]]) {
    h.state.rows=rows;h.state.fail=rows[0]?.websiteDecision==='ALLOW'&&rows[0]?.websiteStatus==='READY';
    const list=await warehouses.getWarehouses();const detail=response();
    await controller.getWarehouseById({params:{id:'1'},headers:{}},detail);
    for(const row of [list.data[0],detail.body]) {
      assert.deepEqual(row.images,[]);assert.deepEqual(row.photos,[]);assert.deepEqual(row.photosWebp,[]);
    }
  }
});
