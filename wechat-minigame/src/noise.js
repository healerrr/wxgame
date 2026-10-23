'use strict';
// Seeded, smooth 3D value noise. No p5, DOM, downloads or global state.
function createNoise(seed=29){
  const fade=t=>t*t*t*(t*(t*6-15)+10);
  const mix=(a,b,t)=>a+(b-a)*t;
  function hash(x,y,z){
    let n=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(z,2147483647)+seed)|0;
    n=Math.imul(n^(n>>>13),1274126177);
    return ((n^(n>>>16))>>>0)/4294967295;
  }
  return (x,y,z)=>{
    const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fx=fade(x-ix),fy=fade(y-iy),fz=fade(z-iz);
    return mix(mix(mix(hash(ix,iy,iz),hash(ix+1,iy,iz),fx),mix(hash(ix,iy+1,iz),hash(ix+1,iy+1,iz),fx),fy),mix(mix(hash(ix,iy,iz+1),hash(ix+1,iy,iz+1),fx),mix(hash(ix,iy+1,iz+1),hash(ix+1,iy+1,iz+1),fx),fy),fz);
  };
}
module.exports={createNoise};
