import { engine, Transform, type Entity } from '@dcl/sdk/ecs'
import { Quaternion } from '@dcl/sdk/math'
import { Session } from 'node:inspector/promises'
import { writeFileSync } from 'node:fs'
import type { HeapProfiler } from 'node:inspector'
import { GuardAgent } from '../src/htn-planner/npc/agent'
import { GuardSquad, possessEntityBody, createCapsuleBody, plannerFor } from '../src/htn-planner/npc/guard-scene'
import { RaycastLineOfSight } from '../src/htn-planner/npc/raycast-los'
import { CLEAR_LINE_OF_SIGHT } from '../src/htn-planner/npc/perception'
import { guardDomain } from '../src/examples/guard/guard.htn'
import { compileDomainSource } from '../tools/htn/compiler'
import { measureAllocation } from '../scripts/bench/alloc'

const [mode, nText, profilePath] = process.argv.slice(2)
const n = Number(nText), frames = 1500, warm = 1000
const targets = mode.endsWith('-far') ? [{id:'player',position:{x:1e9,y:0,z:1e9}}] : [], noises: [] = []
const idle = compileDomainSource('idle.domain', '(:domain Idle top_level_domain (:method (behave) top_level_method (idle () ((!wait 1000000000)))))')
if (!idle.ok) throw new Error('idle compilation failed')
const parentEntities: Entity[] = []
const originalEntities: Entity[] = []
const bodies: ReturnType<typeof possessEntityBody>[] = []
const ks = Array.from({length:n}, (_,i)=>({position:{x:i,y:0,z:0},yaw:0}))
function body(i: number, nested: boolean) {
 let parent
 if(nested){
  const a=engine.addEntity(),b=engine.addEntity()
  Transform.create(a,{position:{x:2,y:0,z:3},rotation:Quaternion.fromEulerDegrees(13,31,19),scale:{x:1.2,y:1.2,z:1.2}})
  Transform.create(b,{parent:a,position:{x:1,y:0,z:2},rotation:Quaternion.fromEulerDegrees(9,17,4),scale:{x:0.9,y:0.9,z:0.9}})
  parentEntities.push(a,b);parent=b
 }
 const e=engine.addEntity();Transform.create(e,{parent,position:{x:i,y:1,z:0}})
 originalEntities.push(e)
 return possessEntityBody(e,{groundY:0})
}
let tick:()=>void
let dispose=()=>{}
if(mode.startsWith('body-')){
 for(let i=0;i<n;i++) bodies.push(body(i,mode==='body-nested'))
 let turn=0
 tick=()=>{turn+=.0001;for(let i=0;i<n;i++){ks[i].yaw=turn;ks[i].position.z+=.001;bodies[i].write(ks[i])}}
 dispose=()=>{for(const b of bodies)b.dispose()}
}else if(mode.startsWith('agent-')){
 const domain=mode==='agent-idle'?idle.ir:guardDomain
 const agents=Array.from({length:n},(_,i)=>new GuardAgent({id:'g'+i,planner:plannerFor(domain,{onDiagnostic:undefined}),lineOfSight:CLEAR_LINE_OF_SIGHT,hearingLineOfSight:mode==='agent-async-empty'?new RaycastLineOfSight():undefined,start:{position:{x:i,y:0,z:0},yaw:0},route:[{x:i,y:0,z:100000}]}))
 tick=()=>{for(const a of agents)a.tick(1/60,targets,noises)}
 dispose=()=>{for(const a of agents)a.stop()}
}else{
 const squad=new GuardSquad({planner:plannerFor(guardDomain,{onDiagnostic:undefined}),lineOfSight:CLEAR_LINE_OF_SIGHT,targets:()=>targets,noise:null,system:false})
 squad.spawn(Array.from({length:n},(_,i)=>({id:'g'+i,route:[{x:i,y:0,z:100000}],start:{position:{x:i,y:0,z:0},yaw:0},body:()=>mode==='squad-capsule'?createCapsuleBody():body(i,mode==='squad-nested')})))
 tick=()=>squad.update(1/60)
 dispose=()=>squad.despawn()
}
for(let i=0;i<warm;i++)tick()
const allocation=measureAllocation(tick,frames)
interface SampleRow {
 function: string
 url: string
 line: number
 bytes: number
 stack: string[]
}
const result: {
 mode: string; n: number; warmFrames: number; measuredFrames: number; node: string
 bytesPerFrame: number; bytesPerNpcFrame: number; gcCount: number; gcMs: number; scope: string
 sampledTop?: SampleRow[]; sampledBytes?: number
}={mode,n,warmFrames:warm,measuredFrames:frames,node:process.version,bytesPerFrame:allocation.bytesPerCall,bytesPerNpcFrame:allocation.bytesPerCall/n,gcCount:allocation.gcCount,gcMs:allocation.gcMs,scope:'Synchronous host/SDK component writes; no engine.update, CRDT serialization, renderer or real raycast answers'}
if(profilePath){
 const session=new Session();session.connect()
 await session.post('HeapProfiler.startSampling',{samplingInterval:1024,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true})
 for(let i=0;i<frames;i++)tick()
 const {profile}=await session.post('HeapProfiler.stopSampling');session.disconnect()
 writeFileSync(profilePath,JSON.stringify(profile))
 const rows:SampleRow[]=[]
 function visit(node:HeapProfiler.SamplingHeapProfileNode,stack:string[]){
  const frame=node.callFrame, id=frame.functionName+' '+frame.url+':'+(frame.lineNumber+1)
  if(node.selfSize)rows.push({function:frame.functionName,url:frame.url,line:frame.lineNumber+1,bytes:node.selfSize,stack:[...stack,id]})
  for(const child of node.children??[])visit(child,[...stack,id])
 }
 visit(profile.head,[])
 result.sampledTop=rows.sort((a,b)=>b.bytes-a.bytes).slice(0,30)
 result.sampledBytes=rows.reduce((sum,r)=>sum+r.bytes,0)
}
dispose();for(const e of originalEntities)engine.removeEntity(e);for(const e of parentEntities.reverse())engine.removeEntity(e)
console.log(JSON.stringify(result))
