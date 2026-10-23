'use strict';
const fs=require('node:fs');
const path=require('node:path');
function wav(seconds,sample){
  const rate=16000,count=Math.round(seconds*rate),buffer=Buffer.alloc(44+count*2);
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);
  for(let i=0;i<count;i++){const value=Math.max(-1,Math.min(1,sample(i/rate,i)));buffer.writeInt16LE(Math.round(value*32767),44+i*2);}
  return buffer;
}
function generate(directory){
  fs.mkdirSync(directory,{recursive:true});
  [130.81,146.83,174.61,110].forEach((root,scene)=>{
    let random=29+scene*37,previous=0;
    const samples=wav(8,(t)=>{random=(Math.imul(random,1664525)+1013904223)>>>0;previous=(previous+((random/4294967296)*2-1)*.02)/1.02;const wind=previous*.7,chord=Math.sin(t*root*Math.PI*2)*.036+Math.sin(t*root*1.5*Math.PI*2)*.018+Math.sin(t*root*2*Math.PI*2)*.01,edge=Math.min(1,t/.05,(8-t)/.05);return(wind+chord)*edge;});
    fs.writeFileSync(path.join(directory,`ambient-${scene}.wav`),samples);
  });
  const notes={0:523.25,1:587.33,2:659.25,3:783.99,4:880,gate:392,ripple:261.63};
  for(const [name,freq] of Object.entries(notes)){const samples=wav(1.8,t=>Math.sin(t*freq*Math.PI*2)*.20*Math.min(1,t/.035)*Math.exp(-t*3.3)*Math.min(1,(1.8-t)/.04));fs.writeFileSync(path.join(directory,`chime-${name}.wav`),samples);}
}
if(require.main===module)generate(path.join(__dirname,'..','wechat-minigame','assets'));
module.exports={generate};
