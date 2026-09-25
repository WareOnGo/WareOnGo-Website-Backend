import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {imageRow} from './helpers/websiteImageFixtures.js';

// Reuse the isolated image-pipeline fixture database, never DATABASE_URL/.env.
const url=new URL(process.env.TEST_DATABASE_URL);
assert.equal(url.protocol,'postgresql:');assert.equal(url.hostname,'127.0.0.1');
assert.equal(url.pathname,'/warehouse_qa');assert.equal(url.username,'warehouse_test');assert.equal(url.password,'warehouse_test');
assert.ok(url.port);assert.equal(url.search,'');assert.equal(url.hash,'');
process.env.DATABASE_URL=url.toString();
const [{default:prisma},{default:redis},controller]=await Promise.all([
  import('../models/prismaClient.js'),import('../services/redisService.js'),import('../controllers/warehouseController.js'),
]);
const namespace=`gallery-${randomUUID()}`,city=`Gallery ${namespace}`,owners=[930801,930802,930803,930804];
const raw=name=>`https://fixture.r2.dev/${namespace}-${name}.jpg`;
let server,endpoint;
const cache=new Map();
before(async()=>{
  for(const [name,type] of Object.entries({address:'text',city:'text',state:'text',postalCode:'text',
    totalSpaceSqft:'int[]',clearHeightFt:'text',compliances:'text',otherSpecifications:'text',ratePerSqft:'text',
    warehouseType:'text',zone:'text',micromarket:'text[]',status_updated_at:'timestamp',createdAt:'timestamp',
    numberOfDocks:'text',flooringType:'text',status:'text',availability:'text'})) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "${name}" ${type}`);
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "WarehouseData" (id serial PRIMARY KEY,"warehouseId" int UNIQUE,
    "fireNocAvailable" boolean,"fireSafetyMeasures" text,latitude float,longitude float)`);
  const inputs=[[raw(3),raw(4),raw(1),raw(7),raw(2),raw(5),raw(6)],[raw(1)],[raw(1)],[]];
  for(const [i,id] of owners.entries()) {
    await prisma.$executeRawUnsafe(`INSERT INTO "Warehouse" (id,media,photos,"photosWebp",visibility,address,city,state,
      "warehouseType",zone,compliances,"ratePerSqft","totalSpaceSqft","createdAt",status_updated_at)
      VALUES ($1,$2::jsonb,$3,$4,$5,'Test warehouse',$6,'Test state','PEB','North','ISO','20',ARRAY[10000],now(),now())`,
    id,JSON.stringify({images:inputs[i],videos:['keep.mp4'],docs:['keep.pdf']}),raw(3),raw(3)+'.webp',i!==1,city);
  }
  for(const id of [1,2,3,4,5,7]) {
    const row=imageRow(id,id===5?'DOCUMENT':'INDOOR',id===2?'T3':'T1');
    if(id===3||id===5)row.websiteDecision=row.websiteAssessment.decision='BLOCK';
    if(id===4)row.websiteDecision=row.websiteAssessment.decision='REVIEW';
    if(id===7){row.websiteAssessment.model='gpt-5.6-sol';row.websiteAssessment.version='website-approval-sol-batch-v1';}
    await prisma.$executeRawUnsafe(`INSERT INTO labeled_warehouse_images ("warehouseId","imageUrl",classification,description,model,
      "webpUrl","jpegUrl","websiteStatus","websiteDecision","websiteQualityTier","websiteAssessment","websiteAssessedAt")
      VALUES ($1,$2,$3::"ImageClass",'Preserved caption','scene-model',$4,$5,'READY',$6,$7,$8::jsonb,now())`,
    owners[0],raw(id),row.classification,id===2?null:raw(id)+'.webp',raw(id)+'.jpeg',row.websiteDecision,row.websiteQualityTier,JSON.stringify(row.websiteAssessment));
  }
  redis.get=async key=>cache.get(key);redis.setEx=async(key,ttl,data)=>cache.set(key,data);
  const app=express();app.get('/warehouses',controller.getWarehouses);app.get('/warehouses/:id',controller.getWarehouseById);
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  endpoint=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));
  await prisma.$executeRawUnsafe('DELETE FROM labeled_warehouse_images WHERE "imageUrl" LIKE $1',`https://fixture.r2.dev/${namespace}-%`);
  await prisma.$executeRawUnsafe('DELETE FROM "Warehouse" WHERE id=ANY($1::int[]) AND city=$2',owners,city);
  await prisma.$disconnect();
});
const list=async()=> (await fetch(`${endpoint}/warehouses?city=${encodeURIComponent(city)}`)).json();
test('real SQL and HTTP serve only approved current photos; shared ownership, empty media and hidden stock work',async()=>{
  const before=await prisma.$queryRawUnsafe('SELECT * FROM "Warehouse" WHERE city=$1 ORDER BY id',city);
  const labelsBefore=await prisma.$queryRawUnsafe('SELECT * FROM labeled_warehouse_images WHERE "imageUrl" LIKE $1 ORDER BY id',`https://fixture.r2.dev/${namespace}-%`);
  const response=await fetch(`${endpoint}/warehouses/${owners[0]}`),detail=await response.json();
  assert.equal(response.status,200);assert.equal(response.headers.get('x-wareongo-image-policy'),'approved-4-8-v1');
  assert.deepEqual(detail.photos,[raw(1),raw(7),raw(2)]);
  assert.deepEqual(detail.photosWebp,[raw(1)+'.webp',raw(7)+'.webp',null]);
  assert.equal(detail.images[2].displayUrl,raw(2));
  const all=await list();assert.equal(all.pagination.totalItems,3);
  assert.deepEqual(all.data.find(r=>r.id===owners[0]).images,detail.images);
  assert.deepEqual(all.data.find(r=>r.id===owners[2]).photos,[raw(1)],'a shared source belongs to both current galleries');
  assert.deepEqual(all.data.find(r=>r.id===owners[3]).photos,[],'explicit empty media never revives legacy photos');
  assert.equal((await fetch(`${endpoint}/warehouses/${owners[1]}`)).status,404);
  assert.ok(!JSON.stringify([all,detail]).includes(raw(3)));assert.ok(!JSON.stringify(all).includes('sourceSha256'));
  assert.deepEqual(await prisma.$queryRawUnsafe('SELECT * FROM "Warehouse" WHERE city=$1 ORDER BY id',city),before);
  assert.deepEqual(await prisma.$queryRawUnsafe('SELECT * FROM labeled_warehouse_images WHERE "imageUrl" LIKE $1 ORDER BY id',`https://fixture.r2.dev/${namespace}-%`),labelsBefore);
});
test('real cached responses immediately respect a later review or removal from canonical media',async()=>{
  assert.ok(cache.size>0);
  await prisma.$executeRawUnsafe(`UPDATE labeled_warehouse_images SET "websiteDecision"='BLOCK',
    "websiteAssessment"=jsonb_set("websiteAssessment",'{decision}','"BLOCK"'::jsonb) WHERE "imageUrl"=$1`,raw(1));
  const blocked=await list();
  assert.deepEqual(blocked.data.find(r=>r.id===owners[0]).photos,[raw(7),raw(2)]);
  assert.deepEqual(blocked.data.find(r=>r.id===owners[2]).photos,[]);
  await prisma.$executeRawUnsafe(`UPDATE "Warehouse" SET media=jsonb_set(media::jsonb,'{images}','[]'::jsonb) WHERE id=$1`,owners[0]);
  const removed=await list();assert.deepEqual(removed.data.find(r=>r.id===owners[0]).images,[]);
  assert.deepEqual(removed.data.find(r=>r.id===owners[0]).photos,[]);
});
