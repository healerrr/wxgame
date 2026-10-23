'use strict';
class SynthAudio{
  constructor(ctx){
    this.ctx=ctx;this.master=this.ctx.createGain();this.master.gain.value=0;this.master.connect(this.ctx.destination);this.nodes=[];this.enabled=false;
    const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=350;filter.connect(this.master);
    const buffer=this.ctx.createBuffer(1,this.ctx.sampleRate*4,this.ctx.sampleRate),data=buffer.getChannelData(0);let previous=0;
    for(let i=0;i<data.length;i++){previous=(previous+Math.random()*.035-.0175)/1.015;data[i]=previous*3;}
    const source=this.ctx.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(filter);source.start();this.nodes.push(source,filter);
    this.windBuffer=buffer;
    const rain=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate),rainData=rain.getChannelData(0);for(let i=0;i<rainData.length;i++)rainData[i]=(Math.random()*2-1)*.45;
    this.weatherGain=this.ctx.createGain();this.weatherGain.gain.value=0;this.weatherGain.connect(this.master);
    const rainFilter=this.ctx.createBiquadFilter();rainFilter.type='lowpass';rainFilter.frequency.value=1800;rainFilter.connect(this.weatherGain);
    const rainSource=this.ctx.createBufferSource();rainSource.buffer=rain;rainSource.loop=true;rainSource.connect(rainFilter);rainSource.start();this.nodes.push(rainSource,rainFilter,this.weatherGain);
    this.oscs=[130.81,196,261.63].map((freq,index)=>{const osc=this.ctx.createOscillator(),gain=this.ctx.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.value=.12/(index+1);osc.connect(gain);gain.connect(this.master);osc.start();this.nodes.push(osc,gain);return osc;});
  }
  volume(v){this.enabled=v>0;this.master.gain.setTargetAtTime(v,this.ctx.currentTime,.5);}
  resume(){try{const result=this.ctx.resume();if(result&&result.catch)result.catch(()=>{});}catch(_){} }
  suspend(){this.enabled=false;try{this.master.gain.value=0;const result=this.ctx.suspend();if(result&&result.catch)result.catch(()=>{});}catch(_){} }
  theme(scene){const roots=[130.81,146.83,174.61,110];this.oscs.forEach((osc,index)=>osc.frequency.setTargetAtTime(roots[scene]*[1,1.5,2][index],this.ctx.currentTime,2));}
  weather(kind,intensity){this.weatherGain.gain.setTargetAtTime((kind==='storm'?.68:kind==='rain'?.40:0)*intensity,this.ctx.currentTime,1.5);}
  thunder(){
    if(!this.enabled)return;
    const t=this.ctx.currentTime,source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();source.buffer=this.windBuffer;filter.type='lowpass';filter.frequency.value=145;
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.8,t+.35);gain.gain.exponentialRampToValueAtTime(.001,t+3.3);source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(t);source.stop(t+3.5);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  chime(kind='light'){
    if(!this.enabled)return;
    const t=this.ctx.currentTime,osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
    osc.type='sine';osc.frequency.value=kind==='ripple'?261.63:kind==='gate'?392:[523.25,587.33,659.25,783.99,880][Math.floor(Math.random()*5)];
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.36,t+.035);gain.gain.exponentialRampToValueAtTime(.001,t+2.3);osc.connect(gain);gain.connect(this.master);osc.start(t);osc.stop(t+2.4);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  destroy(){this.suspend();for(const node of this.nodes){try{if(node.stop)node.stop();node.disconnect();}catch(_){}}try{if(this.ctx.close)this.ctx.close();}catch(_){} }
}
class FileAudio{
  constructor(wx){this.enabled=false;this.scene=0;this.index=0;this.music=wx.createInnerAudioContext();this.music.loop=true;this.music.autoplay=false;this.music.src='assets/ambient-0.wav';this.music.volume=0;this.effects=[wx.createInnerAudioContext(),wx.createInnerAudioContext()];}
  volume(value){this.enabled=value>0;this.music.volume=Math.min(1,value*4);if(this.enabled)this.music.play();else{this.music.pause();for(const effect of this.effects)effect.stop();}}
  resume(){if(this.enabled)this.music.play();}
  suspend(){this.music.pause();for(const effect of this.effects)effect.stop();}
  theme(scene){if(scene===this.scene)return;this.scene=scene;this.music.src=`assets/ambient-${scene}.wav`;if(this.enabled)this.music.play();}
  chime(kind='light'){if(!this.enabled)return;const effect=this.effects[this.index++%this.effects.length];effect.stop();effect.src=`assets/chime-${kind==='gate'||kind==='ripple'?kind:Math.floor(Math.random()*5)}.wav`;effect.volume=.32;effect.play();}
  destroy(){this.music.destroy();for(const effect of this.effects)effect.destroy();}
}
class AmbientAudio{
  constructor(wx){
    let ctx;
    try{
      if(!wx.createWebAudioContext)throw new Error('No Web Audio');ctx=wx.createWebAudioContext();
      for(const name of ['createOscillator','createBiquadFilter','createGain','createBuffer','createBufferSource'])if(typeof ctx[name]!=='function')throw new Error('Incomplete Web Audio');
      return new SynthAudio(ctx);
    }catch(error){
      if(ctx&&ctx.close){try{const result=ctx.close();if(result&&result.catch)result.catch(()=>{});}catch(_){}}
      if(wx.createInnerAudioContext)return new FileAudio(wx);throw error;
    }
  }
}
module.exports={AmbientAudio};
