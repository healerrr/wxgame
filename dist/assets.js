/* Optional local artwork. Failed or delayed images never block a flight. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else Object.assign(root,api);})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const ART_FILES=['dawn.jpg','dusk.jpg','forest.jpg','heaven.jpg','moon-animals.png'];
  function loadWindborneArt(createImage,onChange,base='assets/art/'){
    const art={backgrounds:[null,null,null,null],animals:null,loaded:0,total:5,errors:[]};
    if(typeof createImage!=='function')return art;
    ART_FILES.forEach((file,index)=>{
      try{
        const img=createImage();if(!img)return;
        let settled=false;
        img.onload=()=>{if(settled)return;settled=true;if(index<4)art.backgrounds[index]=img;else art.animals=img;art.loaded++;if(onChange)onChange(art);};
        img.onerror=()=>{if(settled)return;settled=true;art.errors.push(file);if(onChange)onChange(art);};
        img.src=base+file;
      }catch(_){art.errors.push(file);}
    });
    return art;
  }
  return {loadWindborneArt,WINDBORNE_ART_FILES:ART_FILES};
});
