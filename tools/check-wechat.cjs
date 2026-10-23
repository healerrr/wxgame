'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),project=path.join(root,'wechat-minigame');
const {WINDBORNE_ART_FILES}=require('../dist/assets');
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const config=JSON.parse(fs.readFileSync(path.join(project,'project.config.json'))),game=JSON.parse(fs.readFileSync(path.join(project,'game.json')));
check(config.appid==='wxedf8b0ff920cc0ee','AppID mismatch');check(config.compileType==='game','Must be a Mini Game project');check(game.deviceOrientation==='portrait','Portrait configuration missing');
const files=['game.js',...fs.readdirSync(path.join(project,'src')).filter(name=>name.endsWith('.js')).map(name=>'src/'+name)];let bytes=0;
for(const file of files){const source=fs.readFileSync(path.join(project,file),'utf8');new vm.Script(source,{filename:file});bytes+=Buffer.byteLength(source);for(const match of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)){check(match[1].startsWith('.'),'Runtime dependency outside package: '+match[1]);check(fs.existsSync(path.resolve(project,path.dirname(file),match[1]+'.js')),'Missing module: '+match[1]);}}
const main=fs.readFileSync(path.join(project,'src/main.js'),'utf8');check(!/\bdocument\b|\bp5\./.test(main),'Web dependency in native host');
const sounds=[...Array.from({length:4},(_,i)=>`ambient-${i}.wav`),...Array.from({length:5},(_,i)=>`chime-${i}.wav`),'chime-gate.wav','chime-ripple.wav'];let audioBytes=0;
for(const name of sounds){const buffer=fs.readFileSync(path.join(project,'assets',name));check(buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WAVE','Invalid sound asset: '+name);check(buffer.readUInt32LE(40)===buffer.length-44,'Truncated sound asset: '+name);audioBytes+=buffer.length;}
const build=JSON.parse(fs.readFileSync(path.join(project,'build-info.json')));
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
check(build.version==='2.2.0','Native difficulty package needs rebuilding to 2.2.0');
check(hash(fs.readFileSync(path.join(root,'dist','game.js'),'utf8').replace(/\r\n/g,'\n'))===build.entrySHA256,'Browser entry needs rebuilding');
for(const name of ['adventure','view','scenery','weather','assets']){const source=fs.readFileSync(path.join(root,'dist',name+'.js'),'utf8').replace(/\r\n/g,'\n'),native=fs.readFileSync(path.join(project,'src',name+'.js'),'utf8');check(hash(source)===build.modules[name]&&hash(native)===build.modules[name],'Native source needs rebuilding: '+name);}
let artBytes=0;
for(const file of WINDBORNE_ART_FILES){
  const source=fs.readFileSync(path.join(root,'dist','assets','art',file)),native=fs.readFileSync(path.join(project,'assets','art',file));
  check(build.artwork&&hash(source)===build.artwork[file]&&hash(native)===build.artwork[file],'Native artwork needs rebuilding: '+file);
  check(file.endsWith('.png')?native.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):native[0]===255&&native[1]===216&&native[native.length-2]===255&&native[native.length-1]===217,'Invalid image file: '+file);
  artBytes+=native.length;
}
const html=require('./preview-wechat.cjs').page();new vm.Script(html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')),{filename:'native-preview-bundle.js'});
function directoryBytes(folder){return fs.readdirSync(folder,{withFileTypes:true}).reduce((total,entry)=>{const absolute=path.join(folder,entry.name);return total+(entry.isDirectory()?directoryBytes(absolute):fs.statSync(absolute).size);},0);}
const packageBytes=directoryBytes(project);
check(packageBytes<4*1024*1024,'Complete project exceeds 4 MiB budget: '+(packageBytes/1024/1024).toFixed(2)+' MiB');
console.log(`WeChat 2.2.0 checked: ${files.length} scripts, ${sounds.length} sounds, ${WINDBORNE_ART_FILES.length} images (${(artBytes/1024/1024).toFixed(2)} MiB); complete project ${(packageBytes/1024/1024).toFixed(2)} MiB, AppID ${config.appid}.`);
