'use strict';
// The browser and native game use the exact same simulation and Canvas view.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.join(__dirname,'..'),out=path.join(root,'wechat-minigame','src');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const {WINDBORNE_ART_FILES}=require('../dist/assets');
const artSource=path.join(root,'dist','assets','art'),artTarget=path.join(root,'wechat-minigame','assets','art');
for(const file of WINDBORNE_ART_FILES)if(!fs.existsSync(path.join(artSource,file)))throw new Error('Missing local artwork: '+file);
const modules={};fs.mkdirSync(out,{recursive:true});
for(const name of ['adventure','view','scenery','weather','assets']){
  const source=fs.readFileSync(path.join(root,'dist',name+'.js'),'utf8').replace(/\r\n/g,'\n');
  fs.writeFileSync(path.join(out,name+'.js'),source);modules[name]=hash(source);
}
fs.writeFileSync(path.join(out,'world.js'),"'use strict';\n// Legacy import compatibility; the campaign now lives in adventure.js.\nmodule.exports=require('./adventure');\n");
fs.writeFileSync(path.join(out,'ui.js'),"'use strict';\n// Browser and WeChat share the Canvas presentation.\nmodule.exports=require('./view');\n");
const entry=fs.readFileSync(path.join(root,'dist','game.js'),'utf8').replace(/\r\n/g,'\n');
const artwork={};fs.mkdirSync(artTarget,{recursive:true});
for(const file of WINDBORNE_ART_FILES){const contents=fs.readFileSync(path.join(artSource,file));fs.writeFileSync(path.join(artTarget,file),contents);artwork[file]=hash(contents);}
fs.writeFileSync(path.join(root,'wechat-minigame','build-info.json'),JSON.stringify({version:'2.2.0',appid:'wxedf8b0ff920cc0ee',entrySHA256:hash(entry),modules,artwork},null,2)+'\n');
require('./generate-wechat-audio.cjs').generate(path.join(root,'wechat-minigame','assets'));
console.log('WeChat 2.2.0 synchronized: shared campaign, view, weather and '+WINDBORNE_ART_FILES.length+' local artwork assets.');
