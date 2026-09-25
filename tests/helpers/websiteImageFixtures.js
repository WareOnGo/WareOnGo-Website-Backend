import { createHash } from 'node:crypto';
export const imageRow = (id, scene='INDOOR', tier='T1', extra={}) => ({
  id, warehouseId:1, imageUrl:`https://fixture.r2.dev/${id}.jpg`, webpUrl:`https://fixture.r2.dev/webp/${id}.webp`,
  classification:scene, description:'Warehouse view', websiteStatus:'READY', websiteDecision:'ALLOW', websiteQualityTier:tier,
  websiteAssessedAt:'2026-09-25T12:00:00Z', websiteOverride:null,
  websiteAssessment:{decision:'ALLOW',qualityTier:tier,modelQualityTier:tier,reasons:[],scene,
    model:'gpt-5.6-luna',version:'website-approval-luna-v1',sourceWidth:1280,sourceHeight:720,
    sourceSha256:createHash('sha256').update(String(id)).digest('hex'),
    view:scene==='INDOOR'?'INTERIOR_OVERVIEW':'EXTERIOR_FACADE',coverSuitable:true},...extra,
});
