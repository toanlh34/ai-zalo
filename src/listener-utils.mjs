const ignoreLateError=()=>{};
export function allowLateCloseErrors(listener){
  // SDK sockets can emit an error after stop() while their close handshake finishes.
  if(!listener.listeners('error').includes(ignoreLateError))listener.on('error',ignoreLateError);
}
