(function(root){
  'use strict';
  class WindborneSound{
    constructor(){
      const AC=root.AudioContext||root.webkitAudioContext;this.ctx=new AC();this.enabled=false;this.nodes=[];this.index=0;
      this.master=this.ctx.createGain();this.master.gain.value=0;this.master.connect(this.ctx.destination);
      const buffer=this.ctx.createBuffer(1,this.ctx.sampleRate*4,this.ctx.sampleRate),data=buffer.getChannelData(0);let last=0;
      for(let i=0;i<data.length;i++){last=(last+Math.random()*.035-.0175)/1.015;data[i]=last*3;}this.windBuffer=buffer;
      const source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter();source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=350;source.connect(filter);filter.connect(this.master);source.start();this.nodes.push(source,filter);
      this.oscs=[130.81,196,261.63].map((freq,i)=>{const osc=this.ctx.createOscillator(),gain=this.ctx.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.value=.12/(i+1);osc.connect(gain);gain.connect(this.master);osc.start();this.nodes.push(osc,gain);return osc;});
      const rain=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate),values=rain.getChannelData(0);for(let i=0;i<values.length;i++)values[i]=(Math.random()*2-1)*.45;
      this.weatherGain=this.ctx.createGain();this.weatherGain.gain.value=0;this.weatherGain.connect(this.master);const rainFilter=this.ctx.createBiquadFilter();rainFilter.type='lowpass';rainFilter.frequency.value=1800;rainFilter.connect(this.weatherGain);const rainSource=this.ctx.createBufferSource();rainSource.buffer=rain;rainSource.loop=true;rainSource.connect(rainFilter);rainSource.start();this.nodes.push(rainSource,rainFilter,this.weatherGain);
    }
    resume(){return this.ctx.resume();}
    volume(v){this.enabled=v>0;this.master.gain.setTargetAtTime(v,this.ctx.currentTime,.5);}
    theme(scene){const root=[130.81,146.83,174.61,110][scene||0];this.oscs.forEach((o,i)=>o.frequency.setTargetAtTime(root*[1,1.5,2][i],this.ctx.currentTime,2));}
    weather(kind,intensity){this.weatherGain.gain.setTargetAtTime((kind==='storm'?.68:kind==='rain'?.4:0)*intensity,this.ctx.currentTime,1.5);}
    chime(kind){if(!this.enabled)return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='sine';o.frequency.value=kind==='gate'?392:[523.25,587.33,659.25,783.99][this.index++%4];g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.24,t+.035);g.gain.exponentialRampToValueAtTime(.001,t+1.6);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+1.7);o.onended=()=>{o.disconnect();g.disconnect();};}
    thunder(){if(!this.enabled)return;const t=this.ctx.currentTime,s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=this.windBuffer;f.type='lowpass';f.frequency.value=145;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.8,t+.35);g.gain.exponentialRampToValueAtTime(.001,t+3.3);s.connect(f);f.connect(g);g.connect(this.master);s.start(t);s.stop(t+3.5);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();};}
    destroy(){for(const node of this.nodes){try{node.stop?.();node.disconnect();}catch(_){}}this.ctx.close();}
  }
  root.WindborneSound=WindborneSound;
})(window);
