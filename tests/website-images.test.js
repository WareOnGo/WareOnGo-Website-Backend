import { test } from 'node:test';
import assert from 'node:assert/strict';
import gallery from '../services/websiteImageGallery.cjs';
import pipeline from '../services/imagePipelineRepository.cjs';

import { imageRow } from './helpers/websiteImageFixtures.js';

const select=gallery.selectWebsiteImages;
const ids=rows=>select(rows).map(row=>row.id);
const change=(row,assessment)=>({...row,websiteAssessment:{...row.websiteAssessment,...assessment}});

test('only current approved, useful scene photos can enter any public image field',()=>{
  const rejected=['BLOCK','REVIEW','PENDING'].map((websiteDecision,i)=>imageRow(i+2,'OUTDOOR','T1',{websiteDecision}));
  rejected.push(...['PENDING','RUNNING','FAILED','UNSUPPORTED'].map((websiteStatus,i)=>imageRow(i+10,'INDOOR','T1',{websiteStatus})),
    imageRow(20,'DOCUMENT'),imageRow(21,'UNKNOWN'),imageRow(22,'INDOOR','UNUSABLE'),
    change(imageRow(23),{reasons:['CONTACT_NUMBER']}),change(imageRow(24),{sourceSha256:null}),
    change(imageRow(25),{version:'obsolete-policy'}),{imageUrl:'https://fixture.r2.dev/not-assessed.jpg'});
  assert.deepEqual(ids([imageRow(1),...rejected]),[1]);
  const payload=gallery.publicImageFields(select([imageRow(1),...rejected]));
  assert.deepEqual(payload.photos,['https://fixture.r2.dev/1.jpg']);
  assert.deepEqual(payload.photosWebp,['https://fixture.r2.dev/webp/1.webp']);
  assert.deepEqual(gallery.publicImageFields(select(rejected)),{images:[],photos:[],photosWebp:[]});
  assert.ok(!JSON.stringify(payload).includes('websiteAssessment'));
});
test('Sol reviews are consumed without hard-coding a Luna-only reader',()=>{
  assert.deepEqual(ids([change(imageRow(1),{model:'gpt-5.6-sol',version:'website-approval-sol-batch-v1',batchReview:{prior:{decision:'REVIEW'}}})]),[1]);
});
test('maximum eight balances scenes when available and reallocates a missing side',()=>{
  const both=select(Array.from({length:20},(_,i)=>imageRow(i,i<12?'INDOOR':'OUTDOOR',i<12?'T1':'T2')));
  assert.equal(both.length,8);assert.equal(both.filter(r=>r.classification==='INDOOR').length,4);
  const outdoor=select(Array.from({length:12},(_,i)=>imageRow(i,'OUTDOOR')));
  assert.equal(outdoor.length,8);assert.ok(outdoor.every(r=>r.classification==='OUTDOOR'));
  const uneven=select(Array.from({length:12},(_,i)=>imageRow(i,i<3?'INDOOR':'OUTDOOR')));
  assert.equal(uneven.filter(r=>r.classification==='INDOOR').length,3);
});
test('weak photos fill only a soft minimum of four and never add to five good images',()=>{
  const good=Array.from({length:5},(_,i)=>imageRow(i));
  const weak=Array.from({length:12},(_,i)=>imageRow(i+10,'OUTDOOR','T3'));
  assert.equal(select([...good,...weak]).length,5);
  assert.equal(select([...good.slice(0,2),...weak]).length,4);
  assert.equal(select(weak).length,4);assert.equal(select(weak.slice(0,1)).length,1);
});
test('source-size guards cannot upgrade weak images and exact duplicates choose the stronger photo',()=>{
  const tiny=change(imageRow(10),{sourceWidth:319,sourceHeight:196});
  const good=Array.from({length:5},(_,i)=>imageRow(i));
  assert.deepEqual(ids([...good,tiny]),[0,1,2,3,4]);
  const duplicate=change(imageRow(20,'INDOOR','T3'),{sourceSha256:good[0].websiteAssessment.sourceSha256});
  assert.deepEqual(ids([duplicate,good[0]]),[0]);
});
test('existing scene classifications govern balance and a new opinion never revives documents',()=>{
  const image=change(imageRow(1),{scene:'OUTDOOR'});
  assert.equal(select([image])[0].classification,'INDOOR');
  assert.deepEqual(select([change(imageRow(2,'DOCUMENT'),{scene:'INDOOR'})]),[]);
});
test('an overview is the cover ahead of a washroom and ties remain deterministic',()=>{
  const bathroom=change(imageRow(1),{view:'WASHROOM',coverSuitable:false});
  const yard=imageRow(2,'OUTDOOR','T2');
  assert.deepEqual(ids([bathroom,yard]),[2,1]);assert.deepEqual(ids([bathroom,yard]),ids([bathroom,yard]));
  const portrait=change(imageRow(3),{sourceWidth:400,sourceHeight:1200});
  assert.equal(select([portrait,yard])[0].id,2);
});
test('same-source manual decisions survive automation; stale or malformed overrides cannot allow',()=>{
  const row=imageRow(1,'OUTDOOR','T2',{websiteDecision:'BLOCK'});
  const override={decision:'ALLOW',sourceSha256:row.websiteAssessment.sourceSha256,reviewedBy:'staff-1',
    reviewedAt:'2026-09-25T14:00:00Z',reason:'Verified benign dock markings'};
  assert.deepEqual(ids([{...row,websiteOverride:override}]),[1]);
  for(const changed of [{decision:'BLOCK'},{sourceSha256:'f'.repeat(64)},{reviewedBy:null},{reviewedAt:'bad'},{reason:123}]) {
    assert.deepEqual(ids([{...row,websiteOverride:{...override,...changed}}]),[]);
  }
});
test('WebP failure retains only the approved original and legacy array positions stay aligned',()=>{
  const a=imageRow(1),b=imageRow(2,'INDOOR','T1',{webpUrl:null});
  const fields=gallery.publicImageFields(select([a,b]));
  assert.equal(fields.images[0].displayUrl,a.webpUrl);assert.equal(fields.images[1].displayUrl,b.imageUrl);
  assert.deepEqual(fields.photosWebp,[a.webpUrl,null]);assert.deepEqual(fields.photos,[a.imageUrl,b.imageUrl]);
});
test('public reads fail closed without changing the unfiltered compression/PPT reader',async()=>{
  const blocked=imageRow(1,'INDOOR','T1',{websiteDecision:'BLOCK'});
  let mode='ok';
  const repository=new pipeline.ImagePipelineRepository({$queryRawUnsafe:async()=>{if(mode==='error')throw new Error('database unavailable');return [blocked];}});
  assert.deepEqual((await repository.readWebsiteImages([1])).get(1),[]);
  assert.equal((await repository.readImages([{id:1,media:{images:[blocked.imageUrl]}}])).get(1).length,1);
  mode='error';assert.deepEqual((await repository.readWebsiteImages([1])).get(1),[]);
});
