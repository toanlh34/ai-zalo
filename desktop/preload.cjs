const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('jev',{
  request:(action,payload)=>ipcRenderer.invoke('jev:request',action,payload),
  onEvent:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('jev:event',listener);return()=>ipcRenderer.removeListener('jev:event',listener);}
});
